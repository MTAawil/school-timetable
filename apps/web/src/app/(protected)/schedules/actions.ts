"use server";

import {
  fingerprintSnapshot,
  getDatabase,
  type Prisma,
  type SolverSnapshot,
  solverSchemaVersion,
} from "@school-timetable/database";
import { redirect } from "next/navigation";
import { z } from "zod";

import { verifySession } from "@/lib/auth/dal";

type CandidateAssignment = {
  id: string;
  requirementId: string;
  classSectionId: string;
  teacherId: string;
  dayIndex: number | null;
  periodIndex: number | null;
  durationPeriods: number;
  roomId: string | null;
  isLocked: boolean;
};

type ValidationResult = {
  valid: boolean;
  errors: string[];
  totalPenalty: number;
  penaltyBreakdown: Record<string, number>;
};

const idSchema = z.uuid();
const positionSchema = z.coerce.number().int().nonnegative();
const solverAssignmentSchema = z.object({
  requirementId: z.string(),
  dayIndex: z.number().int().nonnegative(),
  periodIndex: z.number().int().nonnegative(),
  durationPeriods: z.number().int().positive(),
  roomId: z.string().nullable(),
});
const regenerationResponseSchema = z.object({
  jobId: z.string(),
  inputFingerprint: z.string(),
  status: z.enum(["FEASIBLE", "OPTIMAL", "INFEASIBLE", "FAILED"]),
  runtimeMs: z.number().int().nonnegative(),
  alternatives: z.array(
    z.object({
      rank: z.number().int().positive(),
      solverStatus: z.enum(["FEASIBLE", "OPTIMAL"]),
      totalPenalty: z.number().int().nonnegative(),
      diversityScore: z.number().int().nonnegative().nullable().optional(),
      penaltyBreakdown: z.record(z.string(), z.number().int()),
      assignments: z.array(solverAssignmentSchema),
      movementPenalty: z.number().int().nonnegative(),
      movedAssignments: z.array(
        z.object({
          requirementId: z.string(),
          before: z.object({
            dayIndex: z.number().int().nonnegative(),
            periodIndex: z.number().int().nonnegative(),
          }),
          after: z.object({
            dayIndex: z.number().int().nonnegative(),
            periodIndex: z.number().int().nonnegative(),
          }),
        }),
      ),
      runtimeMs: z.number().int().nonnegative(),
      warnings: z.array(z.string()),
    }),
  ),
  diagnostics: z.array(z.record(z.string(), z.unknown())),
  warnings: z.array(z.string()),
  variableCount: z.number().int().nonnegative(),
  constraintCount: z.number().int().nonnegative(),
});

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

async function loadSchedule(scheduleId: string, schoolId: string) {
  const schedule = await getDatabase().schedule.findFirst({
    where: { id: scheduleId, schoolId },
    include: { assignments: true },
  });
  if (!schedule) throw new Error("SCHEDULE_NOT_FOUND");
  if (schedule.status !== "DRAFT") throw new Error("SCHEDULE_NOT_EDITABLE");
  return schedule;
}

function candidatesFrom(
  assignments: Awaited<ReturnType<typeof loadSchedule>>["assignments"],
): CandidateAssignment[] {
  return assignments.map((assignment) => ({
    id: assignment.id,
    requirementId: assignment.teachingRequirementId,
    classSectionId: assignment.classSectionId,
    teacherId: assignment.teacherId,
    dayIndex: assignment.startDayIndex,
    periodIndex: assignment.startPeriodIndex,
    durationPeriods: assignment.durationPeriods,
    roomId: assignment.roomId,
    isLocked: assignment.isLocked,
  }));
}

async function validateCandidate(
  snapshot: SolverSnapshot,
  scheduleId: string,
  assignments: CandidateAssignment[],
  allowIncomplete = true,
): Promise<ValidationResult> {
  const baseUrl = process.env.SOLVER_BASE_URL ?? "http://127.0.0.1:8000";
  const response = await fetch(`${baseUrl}/v1/validate`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(process.env.SOLVER_INTERNAL_TOKEN
        ? { "x-solver-token": process.env.SOLVER_INTERNAL_TOKEN }
        : {}),
    },
    body: JSON.stringify({
      input: { ...snapshot, jobId: `edit-${scheduleId}` },
      assignments: assignments
        .filter(
          (
            assignment,
          ): assignment is CandidateAssignment & {
            dayIndex: number;
            periodIndex: number;
          } => assignment.dayIndex !== null && assignment.periodIndex !== null,
        )
        .map((assignment) => ({
          requirementId: assignment.requirementId,
          dayIndex: assignment.dayIndex,
          periodIndex: assignment.periodIndex,
          durationPeriods: assignment.durationPeriods,
          roomId: assignment.roomId,
        })),
      allowIncomplete,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `SOLVER_VALIDATE_HTTP_${String(response.status)}: ${detail}`,
    );
  }
  return (await response.json()) as ValidationResult;
}

async function createDerivedSchedule({
  schoolId,
  userId,
  parent,
  assignments,
  action,
  details,
}: {
  schoolId: string;
  userId: string;
  parent: Awaited<ReturnType<typeof loadSchedule>>;
  assignments: CandidateAssignment[];
  action: string;
  details: Record<string, unknown>;
}) {
  return getDatabase().$transaction(async (transaction) => {
    const latest = await transaction.schedule.findFirst({
      where: { schoolId, termId: parent.termId },
      orderBy: { version: "desc" },
    });
    const schedule = await transaction.schedule.create({
      data: {
        schoolId,
        termId: parent.termId,
        generationJobId: parent.generationJobId,
        parentScheduleId: parent.id,
        name: parent.name,
        version: (latest?.version ?? parent.version) + 1,
        status: "DRAFT",
        inputSnapshot: jsonValue(parent.inputSnapshot),
        inputFingerprint: parent.inputFingerprint,
      },
    });
    await transaction.scheduleAssignment.createMany({
      data: assignments.map((assignment) => ({
        schoolId,
        termId: parent.termId,
        scheduleId: schedule.id,
        teachingRequirementId: assignment.requirementId,
        classSectionId: assignment.classSectionId,
        teacherId: assignment.teacherId,
        startDayIndex: assignment.dayIndex,
        startPeriodIndex: assignment.periodIndex,
        durationPeriods: assignment.durationPeriods,
        roomId: assignment.roomId,
        isLocked: assignment.isLocked,
        source: "MANUAL" as const,
      })),
    });
    await transaction.auditLog.create({
      data: {
        schoolId,
        userId,
        scheduleId: schedule.id,
        action,
        entityType: "Schedule",
        entityId: schedule.id,
        details: jsonValue({ parentScheduleId: parent.id, ...details }),
      },
    });
    return schedule;
  });
}

function reject(scheduleId: string, code: string): never {
  redirect(`/schedules/${scheduleId}?error=${encodeURIComponent(code)}`);
}

export async function previewMove(formData: FormData): Promise<void> {
  const user = await verifySession();
  const scheduleId = idSchema.parse(formData.get("scheduleId"));
  const assignmentId = idSchema.parse(formData.get("assignmentId"));
  const target = String(formData.get("target") ?? "slot");
  const parent = await loadSchedule(scheduleId, user.schoolId);
  const assignments = candidatesFrom(parent.assignments);
  const assignment = assignments.find((item) => item.id === assignmentId);
  if (!assignment) reject(scheduleId, "ASSIGNMENT_NOT_FOUND");
  if (assignment.isLocked) reject(scheduleId, "ASSIGNMENT_LOCKED");

  const dayIndex =
    target === "tray" ? null : positionSchema.parse(formData.get("dayIndex"));
  const periodIndex =
    target === "tray"
      ? null
      : positionSchema.parse(formData.get("periodIndex"));
  assignment.dayIndex = dayIndex;
  assignment.periodIndex = periodIndex;

  const snapshot = parent.inputSnapshot as unknown as SolverSnapshot;
  const [baseline, candidate] = await Promise.all([
    validateCandidate(snapshot, parent.id, candidatesFrom(parent.assignments)),
    validateCandidate(snapshot, parent.id, assignments),
  ]);
  if (!candidate.valid)
    reject(scheduleId, candidate.errors[0] ?? "EDIT_INVALID");

  const query = new URLSearchParams({
    previewAssignment: assignmentId,
    previewTarget: target,
    previewDelta: String(candidate.totalPenalty - baseline.totalPenalty),
  });
  if (dayIndex !== null) query.set("previewDay", String(dayIndex));
  if (periodIndex !== null) query.set("previewPeriod", String(periodIndex));
  redirect(`/schedules/${scheduleId}?${query.toString()}`);
}

export async function moveAssignment(formData: FormData): Promise<void> {
  const user = await verifySession();
  const scheduleId = idSchema.parse(formData.get("scheduleId"));
  const assignmentId = idSchema.parse(formData.get("assignmentId"));
  const target = String(formData.get("target") ?? "slot");
  const parent = await loadSchedule(scheduleId, user.schoolId);
  const assignments = candidatesFrom(parent.assignments);
  const assignment = assignments.find((item) => item.id === assignmentId);
  if (!assignment) reject(scheduleId, "ASSIGNMENT_NOT_FOUND");
  if (assignment.isLocked) reject(scheduleId, "ASSIGNMENT_LOCKED");

  const before = {
    dayIndex: assignment.dayIndex,
    periodIndex: assignment.periodIndex,
  };
  assignment.dayIndex =
    target === "tray" ? null : positionSchema.parse(formData.get("dayIndex"));
  assignment.periodIndex =
    target === "tray"
      ? null
      : positionSchema.parse(formData.get("periodIndex"));
  const snapshot = parent.inputSnapshot as unknown as SolverSnapshot;
  const [baseline, candidate] = await Promise.all([
    validateCandidate(snapshot, parent.id, candidatesFrom(parent.assignments)),
    validateCandidate(snapshot, parent.id, assignments),
  ]);
  if (!candidate.valid)
    reject(scheduleId, candidate.errors[0] ?? "EDIT_INVALID");

  const schedule = await createDerivedSchedule({
    schoolId: user.schoolId,
    userId: user.id,
    parent,
    assignments,
    action: target === "tray" ? "ASSIGNMENT_UNASSIGNED" : "ASSIGNMENT_MOVED",
    details: {
      assignmentId,
      before,
      after: {
        dayIndex: assignment.dayIndex,
        periodIndex: assignment.periodIndex,
      },
      scoreBefore: baseline.totalPenalty,
      scoreAfter: candidate.totalPenalty,
      scoreDelta: candidate.totalPenalty - baseline.totalPenalty,
    },
  });
  redirect(`/schedules/${schedule.id}`);
}

export async function swapAssignments(formData: FormData): Promise<void> {
  const user = await verifySession();
  const scheduleId = idSchema.parse(formData.get("scheduleId"));
  const firstId = idSchema.parse(formData.get("assignmentId"));
  const secondId = idSchema.parse(formData.get("swapWithId"));
  const parent = await loadSchedule(scheduleId, user.schoolId);
  const assignments = candidatesFrom(parent.assignments);
  const first = assignments.find((item) => item.id === firstId);
  const second = assignments.find((item) => item.id === secondId);
  if (!first || !second) reject(scheduleId, "ASSIGNMENT_NOT_FOUND");
  if (first.isLocked || second.isLocked)
    reject(scheduleId, "ASSIGNMENT_LOCKED");
  [first.dayIndex, second.dayIndex] = [second.dayIndex, first.dayIndex];
  [first.periodIndex, second.periodIndex] = [
    second.periodIndex,
    first.periodIndex,
  ];
  const snapshot = parent.inputSnapshot as unknown as SolverSnapshot;
  const candidate = await validateCandidate(snapshot, parent.id, assignments);
  if (!candidate.valid)
    reject(scheduleId, candidate.errors[0] ?? "EDIT_INVALID");
  const schedule = await createDerivedSchedule({
    schoolId: user.schoolId,
    userId: user.id,
    parent,
    assignments,
    action: "ASSIGNMENTS_SWAPPED",
    details: { firstId, secondId, scoreAfter: candidate.totalPenalty },
  });
  redirect(`/schedules/${schedule.id}`);
}

export async function toggleAssignmentLock(formData: FormData): Promise<void> {
  const user = await verifySession();
  const scheduleId = idSchema.parse(formData.get("scheduleId"));
  const assignmentId = idSchema.parse(formData.get("assignmentId"));
  const parent = await loadSchedule(scheduleId, user.schoolId);
  const assignments = candidatesFrom(parent.assignments);
  const assignment = assignments.find((item) => item.id === assignmentId);
  if (!assignment) reject(scheduleId, "ASSIGNMENT_NOT_FOUND");
  assignment.isLocked = !assignment.isLocked;
  const schedule = await createDerivedSchedule({
    schoolId: user.schoolId,
    userId: user.id,
    parent,
    assignments,
    action: assignment.isLocked ? "ASSIGNMENT_LOCKED" : "ASSIGNMENT_UNLOCKED",
    details: { assignmentId, isLocked: assignment.isLocked },
  });
  redirect(`/schedules/${schedule.id}`);
}

export async function regenerateSchedule(formData: FormData): Promise<void> {
  const user = await verifySession();
  const scheduleId = idSchema.parse(formData.get("scheduleId"));
  const parent = await loadSchedule(scheduleId, user.schoolId);
  const positioned = parent.assignments.filter(
    (
      assignment,
    ): assignment is typeof assignment & {
      startDayIndex: number;
      startPeriodIndex: number;
    } =>
      assignment.startDayIndex !== null && assignment.startPeriodIndex !== null,
  );
  const toSnapshotAssignment = (assignment: (typeof positioned)[number]) => ({
    requirementId: assignment.teachingRequirementId,
    dayIndex: assignment.startDayIndex,
    periodIndex: assignment.startPeriodIndex,
    durationPeriods: assignment.durationPeriods,
    roomId: assignment.roomId,
  });
  const existingAssignments = positioned.map(toSnapshotAssignment);
  const lockedAssignments = positioned
    .filter((assignment) => assignment.isLocked)
    .map(toSnapshotAssignment);
  const baseSnapshot = parent.inputSnapshot as unknown as SolverSnapshot;
  const snapshot: SolverSnapshot = {
    ...baseSnapshot,
    lockedAssignments,
    existingAssignments,
    options: {
      ...baseSnapshot.options,
      alternativeCount: 1,
      useExistingScheduleHint: true,
    },
  };
  const fingerprint = fingerprintSnapshot(snapshot);
  const db = getDatabase();
  const job = await db.generationJob.create({
    data: {
      schoolId: user.schoolId,
      termId: parent.termId,
      constraintProfileId: snapshot.constraintProfile.id,
      status: "RUNNING",
      inputSnapshot: jsonValue(snapshot),
      inputFingerprint: fingerprint,
      solverSchemaVersion,
      options: jsonValue(snapshot.options),
      startedAt: new Date(),
    },
  });
  let createdScheduleId: string | null = null;

  try {
    const baseUrl = process.env.SOLVER_BASE_URL ?? "http://127.0.0.1:8000";
    const timeoutSeconds = Number(
      process.env.SOLVER_REQUEST_TIMEOUT_SECONDS ?? "40",
    );
    const response = await fetch(`${baseUrl}/v1/solve`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(process.env.SOLVER_INTERNAL_TOKEN
          ? { "x-solver-token": process.env.SOLVER_INTERNAL_TOKEN }
          : {}),
      },
      body: JSON.stringify({ ...snapshot, jobId: job.id }),
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutSeconds * 1000),
    });
    if (!response.ok) throw new Error(`SOLVER_HTTP_${String(response.status)}`);
    const result = regenerationResponseSchema.parse(await response.json());
    if (result.jobId !== job.id || result.inputFingerprint !== fingerprint) {
      throw new Error("SOLVER_RESPONSE_IDENTITY_MISMATCH");
    }
    const alternative = result.alternatives[0];
    if (!alternative) throw new Error(`REGENERATION_${result.status}`);

    const outputPositions = new Set(
      alternative.assignments.map(
        (assignment) =>
          `${assignment.requirementId}:${String(assignment.dayIndex)}:${String(
            assignment.periodIndex,
          )}:${assignment.roomId ?? ""}`,
      ),
    );
    const locksPreserved = lockedAssignments.every((assignment) =>
      outputPositions.has(
        `${assignment.requirementId}:${String(assignment.dayIndex)}:${String(
          assignment.periodIndex,
        )}:${assignment.roomId ?? ""}`,
      ),
    );
    if (!locksPreserved) throw new Error("LOCKED_ASSIGNMENT_MOVED");

    const assignmentDetails = new Map(
      parent.assignments.map((assignment) => [
        assignment.teachingRequirementId,
        {
          classSectionId: assignment.classSectionId,
          teacherId: assignment.teacherId,
        },
      ]),
    );
    const lockedPositions = new Set(
      lockedAssignments.map(
        (assignment) =>
          `${assignment.requirementId}:${String(assignment.dayIndex)}:${String(
            assignment.periodIndex,
          )}:${assignment.roomId ?? ""}`,
      ),
    );
    const created = await db.$transaction(async (transaction) => {
      const storedAlternative = await transaction.generationAlternative.create({
        data: {
          schoolId: user.schoolId,
          generationJobId: job.id,
          rank: alternative.rank,
          solverStatus: alternative.solverStatus,
          totalPenalty: alternative.totalPenalty,
          diversityScore: alternative.diversityScore ?? null,
          penaltyBreakdown: jsonValue(alternative.penaltyBreakdown),
          assignments: jsonValue(alternative.assignments),
          runtimeMs: alternative.runtimeMs,
          warnings: jsonValue(alternative.warnings),
        },
      });
      const latest = await transaction.schedule.findFirst({
        where: { schoolId: user.schoolId, termId: parent.termId },
        orderBy: { version: "desc" },
      });
      const schedule = await transaction.schedule.create({
        data: {
          schoolId: user.schoolId,
          termId: parent.termId,
          generationJobId: job.id,
          generationAlternativeId: storedAlternative.id,
          parentScheduleId: parent.id,
          name: parent.name,
          version: (latest?.version ?? parent.version) + 1,
          status: "DRAFT",
          inputSnapshot: jsonValue(snapshot),
          inputFingerprint: fingerprint,
        },
      });
      await transaction.scheduleAssignment.createMany({
        data: alternative.assignments.map((assignment) => {
          const details = assignmentDetails.get(assignment.requirementId);
          if (!details) throw new Error("SCHEDULE_REQUIREMENT_NOT_FOUND");
          const positionKey = `${assignment.requirementId}:${String(
            assignment.dayIndex,
          )}:${String(assignment.periodIndex)}:${assignment.roomId ?? ""}`;
          return {
            schoolId: user.schoolId,
            termId: parent.termId,
            scheduleId: schedule.id,
            teachingRequirementId: assignment.requirementId,
            classSectionId: details.classSectionId,
            teacherId: details.teacherId,
            startDayIndex: assignment.dayIndex,
            startPeriodIndex: assignment.periodIndex,
            durationPeriods: assignment.durationPeriods,
            roomId: assignment.roomId,
            isLocked: lockedPositions.has(positionKey),
            source: "GENERATED" as const,
          };
        }),
      });
      await transaction.auditLog.create({
        data: {
          schoolId: user.schoolId,
          userId: user.id,
          scheduleId: schedule.id,
          action: "SCHEDULE_REGENERATED",
          entityType: "Schedule",
          entityId: schedule.id,
          details: jsonValue({
            parentScheduleId: parent.id,
            generationJobId: job.id,
            movementPenalty: alternative.movementPenalty,
            movedAssignments: alternative.movedAssignments,
            lockedAssignmentCount: lockedAssignments.length,
          }),
        },
      });
      await transaction.generationJob.update({
        where: { id: job.id },
        data: {
          status: result.status,
          responseMetadata: jsonValue({
            runtimeMs: result.runtimeMs,
            variableCount: result.variableCount,
            constraintCount: result.constraintCount,
            movementPenalty: alternative.movementPenalty,
            movedAssignments: alternative.movedAssignments,
            warnings: result.warnings,
          }),
          completedAt: new Date(),
        },
      });
      return schedule;
    });
    createdScheduleId = created.id;
  } catch (error) {
    await db.generationJob.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        errorCode: "REGENERATION_FAILED",
        errorMessage:
          error instanceof Error
            ? error.message
            : "Regeneration failed unexpectedly.",
        completedAt: new Date(),
      },
    });
    redirect(`/schedules/${parent.id}?error=REGENERATION_FAILED`);
  }
  if (!createdScheduleId) {
    redirect(`/schedules/${parent.id}?error=REGENERATION_FAILED`);
  }
  redirect(`/schedules/${createdScheduleId}?regenerated=1`);
}

export async function publishSchedule(formData: FormData): Promise<void> {
  const user = await verifySession();
  const scheduleId = idSchema.parse(formData.get("scheduleId"));
  const schedule = await loadSchedule(scheduleId, user.schoolId);
  const assignments = candidatesFrom(schedule.assignments);
  if (
    assignments.some(
      (assignment) =>
        assignment.dayIndex === null || assignment.periodIndex === null,
    )
  ) {
    reject(scheduleId, "PUBLISH_INCOMPLETE");
  }
  const validation = await validateCandidate(
    schedule.inputSnapshot as unknown as SolverSnapshot,
    schedule.id,
    assignments,
    false,
  );
  if (!validation.valid) {
    reject(scheduleId, validation.errors[0] ?? "PUBLISH_INVALID");
  }

  await getDatabase().$transaction(async (transaction) => {
    await transaction.schedule.updateMany({
      where: {
        schoolId: user.schoolId,
        termId: schedule.termId,
        status: "PUBLISHED",
        id: { not: schedule.id },
      },
      data: { status: "ARCHIVED" },
    });
    await transaction.schedule.update({
      where: { id: schedule.id },
      data: { status: "PUBLISHED", publishedAt: new Date() },
    });
    await transaction.auditLog.create({
      data: {
        schoolId: user.schoolId,
        userId: user.id,
        scheduleId: schedule.id,
        action: "SCHEDULE_PUBLISHED",
        entityType: "Schedule",
        entityId: schedule.id,
        details: jsonValue({
          version: schedule.version,
          assignmentCount: assignments.length,
          totalPenalty: validation.totalPenalty,
        }),
      },
    });
  });
  redirect(`/schedules/${schedule.id}?published=1`);
}

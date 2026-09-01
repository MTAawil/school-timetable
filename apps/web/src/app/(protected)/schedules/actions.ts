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
import { rankBoundedRepairs } from "@/lib/targeted-repair";

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

export type MoveOption = {
  type: "move" | "swap";
  dayIndex: number;
  periodIndex: number;
  scoreDelta: number;
  swapWithId?: string;
  swapLabel?: string;
};

export type MoveSimulationResult = {
  options: MoveOption[];
  error?: string;
};

const idSchema = z.uuid();
const scheduleNameSchema = z.string().trim().min(1).max(100);
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
    include: {
      assignments: {
        include: {
          classSection: true,
          teacher: true,
          teachingRequirement: { include: { subject: true } },
        },
      },
      term: { include: { days: true, periods: true } },
    },
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
        draftFamilyId: parent.draftFamilyId,
        isSavedDraft: false,
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

export async function simulateTargetedRepair(
  formData: FormData,
): Promise<void> {
  const user = await verifySession();
  const scheduleId = idSchema.parse(formData.get("scheduleId"));
  const assignmentId = idSchema.parse(formData.get("assignmentId"));
  const dayIndex = positionSchema.parse(formData.get("dayIndex"));
  const periodIndex = positionSchema.parse(formData.get("periodIndex"));
  const teacherId = idSchema.parse(formData.get("teacherId"));
  const parent = await loadSchedule(scheduleId, user.schoolId);
  const assignments = candidatesFrom(parent.assignments);
  const selected = assignments.find(
    (assignment) => assignment.id === assignmentId,
  );
  if (!selected) reject(scheduleId, "ASSIGNMENT_NOT_FOUND");
  if (selected.isLocked) reject(scheduleId, "ASSIGNMENT_LOCKED");
  if (selected.teacherId !== teacherId) reject(scheduleId, "TEACHER_MISMATCH");

  const positioned = assignments.filter(
    (
      assignment,
    ): assignment is CandidateAssignment & {
      dayIndex: number;
      periodIndex: number;
    } => assignment.dayIndex !== null && assignment.periodIndex !== null,
  );
  const toSnapshotAssignment = (assignment: (typeof positioned)[number]) => ({
    requirementId: assignment.requirementId,
    dayIndex: assignment.dayIndex,
    periodIndex: assignment.periodIndex,
    durationPeriods: assignment.durationPeriods,
    roomId: assignment.roomId,
  });
  const existingAssignments = positioned.map(toSnapshotAssignment);
  const lockedAssignments = positioned
    .filter((assignment) => assignment.isLocked)
    .map(toSnapshotAssignment);
  const forcedAssignment = {
    requirementId: selected.requirementId,
    dayIndex,
    periodIndex,
    durationPeriods: selected.durationPeriods,
    roomId: selected.roomId,
  };
  const baseSnapshot = parent.inputSnapshot as unknown as SolverSnapshot;
  const snapshot: SolverSnapshot = {
    ...baseSnapshot,
    lockedAssignments: [...lockedAssignments, forcedAssignment],
    existingAssignments,
    options: {
      ...baseSnapshot.options,
      alternativeCount: 3,
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
      options: jsonValue({
        ...snapshot.options,
        repairSourceScheduleId: parent.id,
        repairAssignmentId: assignmentId,
        repairTeacherId: teacherId,
        repairDayIndex: dayIndex,
        repairPeriodIndex: periodIndex,
      }),
      startedAt: new Date(),
    },
  });

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
    if (!response.ok) {
      throw new Error(`SOLVER_HTTP_${String(response.status)}`);
    }
    const result = regenerationResponseSchema.parse(await response.json());
    if (result.jobId !== job.id || result.inputFingerprint !== fingerprint) {
      throw new Error("SOLVER_RESPONSE_IDENTITY_MISMATCH");
    }

    const bounded = rankBoundedRepairs(result.alternatives);
    if (bounded.length === 0) {
      await db.generationJob.update({
        where: { id: job.id },
        data: {
          status: result.status,
          responseMetadata: jsonValue({
            repair: true,
            sourceScheduleId: parent.id,
            options: [],
            reason:
              result.alternatives.length === 0
                ? "NO_FEASIBLE_REPAIR"
                : "REPAIR_REQUIRES_TOO_MANY_MOVES",
          }),
          completedAt: new Date(),
        },
      });
    } else {
      await db.$transaction(async (transaction) => {
        const storedOptions: Array<Record<string, unknown>> = [];
        for (const [index, alternative] of bounded.entries()) {
          const stored = await transaction.generationAlternative.create({
            data: {
              schoolId: user.schoolId,
              generationJobId: job.id,
              rank: index + 1,
              solverStatus: alternative.solverStatus,
              totalPenalty: alternative.totalPenalty,
              diversityScore: alternative.diversityScore ?? null,
              penaltyBreakdown: jsonValue(alternative.penaltyBreakdown),
              assignments: jsonValue(alternative.assignments),
              runtimeMs: alternative.runtimeMs,
              warnings: jsonValue(alternative.warnings),
            },
          });
          storedOptions.push({
            alternativeId: stored.id,
            rank: index + 1,
            movementPenalty: alternative.movementPenalty,
            additionalMoves: Math.max(alternative.movementPenalty - 1, 0),
            movedAssignments: alternative.movedAssignments,
            totalPenalty: alternative.totalPenalty,
          });
        }
        await transaction.generationJob.update({
          where: { id: job.id },
          data: {
            status: result.status,
            responseMetadata: jsonValue({
              repair: true,
              sourceScheduleId: parent.id,
              selectedAssignmentId: assignmentId,
              target: { dayIndex, periodIndex },
              options: storedOptions,
            }),
            completedAt: new Date(),
          },
        });
      });
    }
  } catch (error) {
    await db.generationJob.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        errorCode: "TARGETED_REPAIR_FAILED",
        errorMessage:
          error instanceof Error
            ? error.message
            : "Targeted repair failed unexpectedly.",
        completedAt: new Date(),
      },
    });
  }

  redirect(
    `/schedules/${parent.id}?view=teacher&entity=${teacherId}&repairJob=${job.id}`,
  );
}

export async function applyTargetedRepair(formData: FormData): Promise<void> {
  const user = await verifySession();
  const scheduleId = idSchema.parse(formData.get("scheduleId"));
  const alternativeId = idSchema.parse(formData.get("alternativeId"));
  const parent = await loadSchedule(scheduleId, user.schoolId);
  const alternative = await getDatabase().generationAlternative.findFirst({
    where: {
      id: alternativeId,
      schoolId: user.schoolId,
      generationJob: { termId: parent.termId },
    },
    include: { generationJob: true },
  });
  if (!alternative) reject(scheduleId, "REPAIR_OPTION_NOT_FOUND");
  const metadata = alternative.generationJob.responseMetadata as {
    sourceScheduleId?: string;
  } | null;
  if (metadata?.sourceScheduleId !== parent.id) {
    reject(scheduleId, "REPAIR_SOURCE_MISMATCH");
  }

  const output = z.array(solverAssignmentSchema).parse(alternative.assignments);
  const sourceByRequirement = new Map<string, CandidateAssignment[]>();
  for (const assignment of candidatesFrom(parent.assignments)) {
    const existing = sourceByRequirement.get(assignment.requirementId) ?? [];
    existing.push(assignment);
    sourceByRequirement.set(assignment.requirementId, existing);
  }
  const lockedPositions = new Set(
    candidatesFrom(parent.assignments)
      .filter(
        (
          assignment,
        ): assignment is CandidateAssignment & {
          dayIndex: number;
          periodIndex: number;
        } =>
          assignment.isLocked &&
          assignment.dayIndex !== null &&
          assignment.periodIndex !== null,
      )
      .map(
        (assignment) =>
          `${assignment.requirementId}:${String(assignment.dayIndex)}:${String(
            assignment.periodIndex,
          )}:${assignment.roomId ?? ""}`,
      ),
  );
  const assignments = output.map((result) => {
    const sources = sourceByRequirement.get(result.requirementId);
    const source = sources?.shift();
    if (!source) throw new Error("SCHEDULE_REQUIREMENT_NOT_FOUND");
    const positionKey = `${result.requirementId}:${String(
      result.dayIndex,
    )}:${String(result.periodIndex)}:${result.roomId ?? ""}`;
    return {
      ...source,
      dayIndex: result.dayIndex,
      periodIndex: result.periodIndex,
      durationPeriods: result.durationPeriods,
      roomId: result.roomId,
      isLocked: lockedPositions.has(positionKey),
    };
  });
  const validation = await validateCandidate(
    parent.inputSnapshot as unknown as SolverSnapshot,
    parent.id,
    assignments,
    false,
  );
  if (!validation.valid) {
    reject(scheduleId, validation.errors[0] ?? "REPAIR_INVALID");
  }

  const schedule = await createDerivedSchedule({
    schoolId: user.schoolId,
    userId: user.id,
    parent,
    assignments,
    action: "TARGETED_REPAIR_APPLIED",
    details: {
      generationJobId: alternative.generationJobId,
      alternativeId: alternative.id,
      totalPenalty: validation.totalPenalty,
    },
  });
  redirect(`/schedules/${schedule.id}?repairApplied=1`);
}

export async function findMoveOptions(
  formData: FormData,
): Promise<MoveSimulationResult> {
  const user = await verifySession();
  const scheduleId = idSchema.parse(formData.get("scheduleId"));
  const assignmentId = idSchema.parse(formData.get("assignmentId"));
  const parent = await loadSchedule(scheduleId, user.schoolId);
  const baselineAssignments = candidatesFrom(parent.assignments);
  const selected = baselineAssignments.find(
    (assignment) => assignment.id === assignmentId,
  );
  if (!selected) return { options: [], error: "ASSIGNMENT_NOT_FOUND" };
  if (selected.isLocked) return { options: [], error: "ASSIGNMENT_LOCKED" };
  if (selected.dayIndex === null || selected.periodIndex === null) {
    return { options: [], error: "ASSIGNMENT_UNASSIGNED" };
  }

  const snapshot = parent.inputSnapshot as unknown as SolverSnapshot;
  const baseline = await validateCandidate(
    snapshot,
    parent.id,
    baselineAssignments,
  );
  const slots = parent.term.days
    .filter((day) => day.isWorking)
    .flatMap((day) =>
      parent.term.periods
        .filter((period) => period.isTeaching)
        .map((period) => ({
          dayIndex: day.dayIndex,
          periodIndex: period.periodIndex,
        })),
    )
    .filter(
      (slot) =>
        slot.dayIndex !== selected.dayIndex ||
        slot.periodIndex !== selected.periodIndex,
    );

  const candidates: Array<{
    option: MoveOption;
    assignments: CandidateAssignment[];
  }> = [];
  for (const slot of slots) {
    const moved = baselineAssignments.map((assignment) => ({ ...assignment }));
    const movedSelected = moved.find(
      (assignment) => assignment.id === assignmentId,
    )!;
    movedSelected.dayIndex = slot.dayIndex;
    movedSelected.periodIndex = slot.periodIndex;
    candidates.push({
      option: { type: "move", ...slot, scoreDelta: 0 },
      assignments: moved,
    });

    const relevantOccupants = baselineAssignments.filter(
      (assignment) =>
        !assignment.isLocked &&
        assignment.id !== assignmentId &&
        assignment.dayIndex === slot.dayIndex &&
        assignment.periodIndex === slot.periodIndex &&
        (assignment.teacherId === selected.teacherId ||
          assignment.classSectionId === selected.classSectionId),
    );
    for (const occupant of relevantOccupants) {
      const swapped = baselineAssignments.map((assignment) => ({
        ...assignment,
      }));
      const first = swapped.find(
        (assignment) => assignment.id === assignmentId,
      )!;
      const second = swapped.find(
        (assignment) => assignment.id === occupant.id,
      )!;
      [first.dayIndex, second.dayIndex] = [second.dayIndex, first.dayIndex];
      [first.periodIndex, second.periodIndex] = [
        second.periodIndex,
        first.periodIndex,
      ];
      const source = parent.assignments.find(
        (assignment) => assignment.id === occupant.id,
      )!;
      candidates.push({
        option: {
          type: "swap",
          ...slot,
          scoreDelta: 0,
          swapWithId: occupant.id,
          swapLabel: `${source.classSection.shortCode} · ${source.teachingRequirement.subject.shortCode} · ${source.teacher.name}`,
        },
        assignments: swapped,
      });
    }
  }

  const validOptions: MoveOption[] = [];
  for (let index = 0; index < candidates.length; index += 8) {
    const batch = candidates.slice(index, index + 8);
    const results = await Promise.all(
      batch.map((candidate) =>
        validateCandidate(snapshot, parent.id, candidate.assignments),
      ),
    );
    results.forEach((result, resultIndex) => {
      if (result.valid) {
        validOptions.push({
          ...batch[resultIndex]!.option,
          scoreDelta: result.totalPenalty - baseline.totalPenalty,
        });
      }
    });
  }

  return {
    options: validOptions
      .sort(
        (left, right) =>
          left.scoreDelta - right.scoreDelta ||
          left.dayIndex - right.dayIndex ||
          left.periodIndex - right.periodIndex,
      )
      .slice(0, 10),
  };
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
          draftFamilyId: parent.draftFamilyId,
          isSavedDraft: false,
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

export async function saveSchedule(formData: FormData): Promise<void> {
  const user = await verifySession();
  const scheduleId = idSchema.parse(formData.get("scheduleId"));
  const schedule = await loadSchedule(scheduleId, user.schoolId);

  await getDatabase().$transaction(async (transaction) => {
    await transaction.schedule.updateMany({
      where: {
        schoolId: user.schoolId,
        termId: schedule.termId,
        draftFamilyId: schedule.draftFamilyId,
        status: "DRAFT",
      },
      data: { isSavedDraft: false },
    });
    await transaction.schedule.update({
      where: { id: schedule.id },
      data: { isSavedDraft: true, savedAt: new Date() },
    });
    await transaction.auditLog.create({
      data: {
        schoolId: user.schoolId,
        userId: user.id,
        scheduleId: schedule.id,
        action: "SCHEDULE_SAVED",
        entityType: "Schedule",
        entityId: schedule.id,
        details: jsonValue({ draftFamilyId: schedule.draftFamilyId }),
      },
    });
  });

  redirect(`/schedules/${schedule.id}?saved=1`);
}

export async function saveScheduleAsCopy(formData: FormData): Promise<void> {
  const user = await verifySession();
  const scheduleId = idSchema.parse(formData.get("scheduleId"));
  const name = scheduleNameSchema.parse(formData.get("name"));
  const source = await loadSchedule(scheduleId, user.schoolId);
  const assignments = candidatesFrom(source.assignments);

  const copy = await getDatabase().$transaction(async (transaction) => {
    const latest = await transaction.schedule.findFirst({
      where: { schoolId: user.schoolId, termId: source.termId },
      orderBy: { version: "desc" },
    });
    const created = await transaction.schedule.create({
      data: {
        schoolId: user.schoolId,
        termId: source.termId,
        generationJobId: source.generationJobId,
        name,
        version: (latest?.version ?? source.version) + 1,
        status: "DRAFT",
        isSavedDraft: true,
        savedAt: new Date(),
        inputSnapshot: jsonValue(source.inputSnapshot),
        inputFingerprint: source.inputFingerprint,
      },
    });
    await transaction.scheduleAssignment.createMany({
      data: assignments.map((assignment) => ({
        schoolId: user.schoolId,
        termId: source.termId,
        scheduleId: created.id,
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
        schoolId: user.schoolId,
        userId: user.id,
        scheduleId: created.id,
        action: "SCHEDULE_SAVED_AS_COPY",
        entityType: "Schedule",
        entityId: created.id,
        details: jsonValue({
          sourceScheduleId: source.id,
          sourceDraftFamilyId: source.draftFamilyId,
          name,
        }),
      },
    });
    return created;
  });

  redirect(`/schedules/${copy.id}?saved=copy`);
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
        draftFamilyId: schedule.draftFamilyId,
        status: "DRAFT",
        id: { not: schedule.id },
      },
      data: { isSavedDraft: false },
    });
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
      data: {
        status: "PUBLISHED",
        isSavedDraft: true,
        savedAt: new Date(),
        publishedAt: new Date(),
      },
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

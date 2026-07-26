"use server";

import {
  getDatabase,
  type Prisma,
  type SolverSnapshot,
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
): Promise<ValidationResult> {
  const baseUrl = process.env.SOLVER_BASE_URL ?? "http://127.0.0.1:8000";
  const response = await fetch(`${baseUrl}/v1/validate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
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
      allowIncomplete: true,
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

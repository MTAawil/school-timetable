import {
  fingerprintSnapshot,
  getDatabase,
  type Prisma,
  type SupervisorSolverSnapshot,
  validateReadiness,
} from "@school-timetable/database";
import { z } from "zod";

export type PartTimeTeacherPressure = {
  teacherId: string;
  teacherName: string;
  weeklySessions: number;
  availableSlots: number;
  tight: boolean;
};

const solverResponseSchema = z.object({
  schemaVersion: z.literal(2),
  jobId: z.string(),
  inputFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  status: z.enum(["FEASIBLE", "OPTIMAL", "INFEASIBLE", "FAILED"]),
  runtimeMs: z.number().int().nonnegative(),
  alternatives: z.array(
    z.object({
      rank: z.number().int().positive(),
      solverStatus: z.enum(["FEASIBLE", "OPTIMAL"]),
      totalPenalty: z.number().int().nonnegative(),
      assignments: z.array(z.unknown()),
      runtimeMs: z.number().int().nonnegative(),
      warnings: z.array(z.string()),
    }),
  ),
  diagnostics: z.array(
    z.object({
      code: z.string().optional(),
      summary: z.string().optional(),
    }),
  ),
  warnings: z.array(z.string()),
  variableCount: z.number().int().nonnegative(),
  constraintCount: z.number().int().nonnegative(),
});

export type PartTimeSolveResult = z.infer<typeof solverResponseSchema>;

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export function buildPartTimeCheckSnapshot(
  snapshot: SupervisorSolverSnapshot,
  timeLimitSeconds: number,
): SupervisorSolverSnapshot {
  const partTimeTeacherIds = new Set(
    snapshot.teachers
      .filter((teacher) => teacher.employmentType === "PART_TIME")
      .map((teacher) => teacher.id),
  );
  const requirements = snapshot.requirements.filter(
    (requirement) =>
      requirement.teacherId !== null &&
      partTimeTeacherIds.has(requirement.teacherId),
  );
  const activeTeacherIds = new Set(
    requirements
      .map((requirement) => requirement.teacherId)
      .filter((teacherId): teacherId is string => teacherId !== null),
  );
  const subjectIds = new Set(
    requirements.map((requirement) => requirement.subjectId),
  );
  const classSectionIds = new Set(
    requirements.map((requirement) => requirement.classSectionId),
  );

  return {
    ...snapshot,
    teachers: snapshot.teachers.filter((teacher) =>
      activeTeacherIds.has(teacher.id),
    ),
    subjects: snapshot.subjects.filter((subject) => subjectIds.has(subject.id)),
    classSections: snapshot.classSections.filter((classSection) =>
      classSectionIds.has(classSection.id),
    ),
    requirements,
    availability: snapshot.availability.filter(
      (rule) =>
        (rule.entityType === "TEACHER" &&
          activeTeacherIds.has(rule.entityId)) ||
        (rule.entityType === "CLASS_SECTION" &&
          classSectionIds.has(rule.entityId)) ||
        rule.entityType === "ROOM",
    ),
    lockedAssignments: [],
    existingAssignments: [],
    options: {
      ...snapshot.options,
      alternativeCount: 1,
      timeLimitSeconds,
      maxQualityDegradationPercent: 0,
      useExistingScheduleHint: false,
    },
  };
}

export function analyzePartTimeTeacherPressure(
  snapshot: SupervisorSolverSnapshot,
): PartTimeTeacherPressure[] {
  const unavailable = new Set(
    snapshot.availability
      .filter(
        (rule) => rule.entityType === "TEACHER" && rule.state === "UNAVAILABLE",
      )
      .map(
        (rule) =>
          `${rule.entityId}:${String(rule.dayIndex)}:${String(rule.periodIndex)}`,
      ),
  );

  return snapshot.teachers
    .map((teacher) => {
      const availableSlots = snapshot.calendar.enabledSlots.filter(
        (slot) =>
          !unavailable.has(
            `${teacher.id}:${String(slot.dayIndex)}:${String(slot.periodIndex)}`,
          ),
      ).length;
      return {
        teacherId: teacher.id,
        teacherName: teacher.name,
        weeklySessions: teacher.weeklyTeachingSessions,
        availableSlots,
        tight: teacher.weeklyTeachingSessions > availableSlots * 0.75,
      };
    })
    .sort(
      (left, right) =>
        right.weeklySessions / Math.max(1, right.availableSlots) -
        left.weeklySessions / Math.max(1, left.availableSlots),
    );
}

export function validatePartTimeCheckSnapshot(
  snapshot: SupervisorSolverSnapshot,
) {
  return validateReadiness(snapshot);
}

export async function solvePartTimeCheck(
  snapshot: SupervisorSolverSnapshot,
): Promise<PartTimeSolveResult> {
  const baseUrl = process.env.SOLVER_BASE_URL ?? "http://127.0.0.1:8000";
  const timeoutSeconds = Math.max(
    Number(process.env.SOLVER_REQUEST_TIMEOUT_SECONDS ?? "40"),
    snapshot.options.timeLimitSeconds + 15,
  );
  const response = await fetch(`${baseUrl}/v1/solve`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(process.env.SOLVER_INTERNAL_TOKEN
        ? { "x-solver-token": process.env.SOLVER_INTERNAL_TOKEN }
        : {}),
    },
    body: JSON.stringify({
      ...snapshot,
      jobId: `part-time-check-${Date.now().toString()}`,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutSeconds * 1000),
  });
  if (!response.ok) {
    throw new Error(`SOLVER_HTTP_${String(response.status)}`);
  }
  const result = solverResponseSchema.parse(await response.json());
  const fingerprint = fingerprintSnapshot(snapshot);
  if (result.inputFingerprint !== fingerprint) {
    throw new Error("SOLVER_RESPONSE_IDENTITY_MISMATCH");
  }
  return result;
}

export async function recordPartTimeCheckAudit({
  schoolId,
  userId,
  snapshot,
  result,
}: {
  schoolId: string;
  userId: string;
  snapshot: SupervisorSolverSnapshot;
  result: PartTimeSolveResult;
}) {
  await getDatabase().auditLog.create({
    data: {
      schoolId,
      userId,
      action: "PART_TIME_AVAILABILITY_CHECK_RUN",
      entityType: "SolverCheck",
      entityId: null,
      details: jsonValue({
        status: result.status,
        runtimeMs: result.runtimeMs,
        alternativeCount: result.alternatives.length,
        assignmentCount: result.alternatives[0]?.assignments.length ?? 0,
        teacherCount: snapshot.teachers.length,
        requirementCount: snapshot.requirements.length,
        inputFingerprint: fingerprintSnapshot(snapshot),
      }),
    },
  });
}

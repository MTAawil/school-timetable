import "dotenv/config";

import { randomUUID } from "node:crypto";

import {
  getDatabase,
  solverSchemaVersion,
  type SupervisorSolverSnapshot,
  validateReadiness,
} from "@school-timetable/database";

const SCHOOL_ID = "20000000-0000-4000-8000-000000000001";

async function main(): Promise<void> {
  const db = getDatabase();
  const solverTimeLimitSeconds = Number(
    process.env.SCENARIO_SOLVER_TIME_SECONDS ?? "120",
  );
  const term = await db.academicTerm.findFirstOrThrow({
    where: { schoolId: SCHOOL_ID, isActive: true, deletedAt: null },
  });
  const [
    school,
    days,
    periods,
    slots,
    teachers,
    subjects,
    classSections,
    weekConfiguration,
    classCurricula,
    availability,
  ] = await Promise.all([
    db.school.findFirstOrThrow({
      where: { id: SCHOOL_ID, deletedAt: null },
    }),
    db.dayDefinition.findMany({
      where: { schoolId: SCHOOL_ID, termId: term.id },
    }),
    db.periodDefinition.findMany({
      where: { schoolId: SCHOOL_ID, termId: term.id },
    }),
    db.slot.findMany({
      where: { schoolId: SCHOOL_ID, termId: term.id, isEnabled: true },
    }),
    db.teacher.findMany({
      where: { schoolId: SCHOOL_ID, isActive: true, deletedAt: null },
    }),
    db.subject.findMany({
      where: { schoolId: SCHOOL_ID, isActive: true, deletedAt: null },
    }),
    db.classSection.findMany({
      where: {
        schoolId: SCHOOL_ID,
        termId: term.id,
        isActive: true,
        deletedAt: null,
      },
    }),
    db.schoolWeekConfiguration.findFirstOrThrow({
      where: { schoolId: SCHOOL_ID, termId: term.id },
    }),
    db.classCurriculum.findMany({
      where: { schoolId: SCHOOL_ID, termId: term.id, isActive: true },
    }),
    db.availabilityRule.findMany({
      where: { schoolId: SCHOOL_ID, termId: term.id },
    }),
  ]);
  const snapshot = {
    schemaVersion: solverSchemaVersion,
    school: { id: school.id, name: school.name, timezone: school.timezone },
    term: { id: term.id, name: term.name, roomsEnabled: false },
    weekConfiguration: {
      workingDayCount: weekConfiguration.workingDayCount,
      sessionsPerDay: weekConfiguration.sessionsPerDay,
      sessionDurationMinutes: weekConfiguration.sessionDurationMinutes,
      breakAfterSession: weekConfiguration.breakAfterSession,
      breakDurationMinutes: weekConfiguration.breakDurationMinutes,
    },
    calendar: {
      days: days.map((day) => ({
        id: day.id,
        index: day.dayIndex,
        name: day.name,
        isWorking: day.isWorking,
      })),
      periods: periods.map((period) => ({
        id: period.id,
        index: period.periodIndex,
        name: period.name,
        isTeaching: period.isTeaching,
      })),
      enabledSlots: slots.map((slot) => ({
        id: slot.id,
        dayIndex: slot.dayIndex,
        periodIndex: slot.periodIndex,
      })),
    },
    teachers: teachers.map((teacher) => ({
      id: teacher.id,
      name: teacher.name,
      employmentType: teacher.employmentType,
      weeklyTeachingSessions: teacher.weeklyTeachingSessions,
      maxLessonsPerDay: teacher.maxLessonsPerDay,
      maxConsecutiveLessons: teacher.maxConsecutiveLessons,
    })),
    subjects: subjects.map((subject) => ({
      id: subject.id,
      name: subject.name,
      preferredTimeBand: subject.preferredTimeBand,
      consecutivePeriodsPreferred: subject.consecutivePeriodsPreferred,
      defaultRoomType: subject.defaultRoomType,
    })),
    classSections: classSections.map((section) => ({
      id: section.id,
      name: section.sectionName,
      shortCode: section.shortCode,
      maxLessonsPerDay: section.maxLessonsPerDay,
    })),
    rooms: [],
    requirements: classCurricula.map((requirement) => ({
      id: requirement.id,
      classSectionId: requirement.classSectionId,
      subjectId: requirement.subjectId,
      teacherId: requirement.teacherId,
      weeklySessions: requirement.weeklySessions,
      isMainSubject: requirement.isMainSubject,
      allowDoubleSession: requirement.allowDoubleSession,
      fixedSlots: [],
      forbiddenSlots: [],
    })),
    availability: availability.map((rule) => ({
      entityType: rule.entityType,
      entityId: rule.entityId,
      dayIndex: rule.dayIndex,
      periodIndex: rule.periodIndex,
      state: rule.state,
    })),
    lockedAssignments: [],
    existingAssignments: [],
    constraintProfile: {
      id: null,
      weights: {
        FULL_TIME_DAILY_BALANCE: 2,
        PART_TIME_COMPACTNESS: 3,
      },
    },
    options: {
      alternativeCount: 1,
      timeLimitSeconds: 60,
      randomSeed: 12345,
      maxQualityDegradationPercent: 20,
      roomsEnabled: false,
      useExistingScheduleHint: false,
    },
  } satisfies SupervisorSolverSnapshot;
  const result = validateReadiness(snapshot);
  if (!result.ready) {
    throw new Error(`READINESS_FAILED:${JSON.stringify(result.issues)}`);
  }

  const response = await fetch(
    `${process.env.SOLVER_BASE_URL ?? "http://127.0.0.1:8000"}/v1/solve`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(process.env.SOLVER_INTERNAL_TOKEN
          ? { "x-solver-token": process.env.SOLVER_INTERNAL_TOKEN }
          : {}),
      },
      body: JSON.stringify({
        ...snapshot,
        jobId: randomUUID(),
        options: {
          ...snapshot.options,
          alternativeCount: 1,
          timeLimitSeconds: solverTimeLimitSeconds,
        },
      }),
      signal: AbortSignal.timeout((solverTimeLimitSeconds + 15) * 1000),
    },
  );
  if (!response.ok) {
    throw new Error(`SOLVER_HTTP_${String(response.status)}`);
  }
  const payload = (await response.json()) as {
    status?: string;
    alternatives?: { assignments?: unknown[] }[];
    diagnostics?: unknown[];
  };
  if (!["FEASIBLE", "OPTIMAL"].includes(payload.status ?? "")) {
    throw new Error(
      `SOLVER_${payload.status ?? "INVALID"}:${JSON.stringify(payload.diagnostics ?? [])}`,
    );
  }
  console.log(
    `Readiness passed; solver returned ${payload.status} with ` +
      `${String(payload.alternatives?.[0]?.assignments?.length ?? 0)} assignments.`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await getDatabase().$disconnect();
  });

import {
  fingerprintSnapshot,
  getDatabase,
  solverSchemaVersion,
  type SupervisorSolverSnapshot,
  validateReadiness,
} from "@school-timetable/database";

import { getActiveTerm } from "@/lib/setup";
import { softConstraints } from "@/lib/soft-constraints";

export async function buildCurrentSnapshot(
  schoolId: string,
): Promise<SupervisorSolverSnapshot> {
  const db = getDatabase();
  const term = await getActiveTerm(schoolId);
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
    profile,
  ] = await Promise.all([
    db.school.findFirstOrThrow({ where: { id: schoolId, deletedAt: null } }),
    db.dayDefinition.findMany({
      where: { schoolId, termId: term.id },
      orderBy: { dayIndex: "asc" },
    }),
    db.periodDefinition.findMany({
      where: { schoolId, termId: term.id },
      orderBy: { periodIndex: "asc" },
    }),
    db.slot.findMany({
      where: { schoolId, termId: term.id, isEnabled: true },
      orderBy: [{ dayIndex: "asc" }, { periodIndex: "asc" }],
    }),
    db.teacher.findMany({
      where: { schoolId, isActive: true, deletedAt: null },
      orderBy: { id: "asc" },
    }),
    db.subject.findMany({
      where: { schoolId, isActive: true, deletedAt: null },
      orderBy: { id: "asc" },
    }),
    db.classSection.findMany({
      where: {
        schoolId,
        termId: term.id,
        isActive: true,
        deletedAt: null,
      },
      orderBy: { id: "asc" },
    }),
    db.schoolWeekConfiguration.findFirst({
      where: { schoolId, termId: term.id },
    }),
    db.classCurriculum.findMany({
      where: {
        schoolId,
        termId: term.id,
        isActive: true,
      },
      orderBy: { id: "asc" },
    }),
    db.availabilityRule.findMany({
      where: { schoolId, termId: term.id },
      orderBy: [
        { entityType: "asc" },
        { entityId: "asc" },
        { dayIndex: "asc" },
        { periodIndex: "asc" },
      ],
    }),
    db.constraintProfile.findFirst({
      where: { schoolId, termId: term.id, isDefault: true },
      include: {
        weights: { where: { isEnabled: true }, orderBy: { code: "asc" } },
      },
    }),
  ]);
  const snapshotPeriods = weekConfiguration
    ? Array.from({ length: weekConfiguration.sessionsPerDay }, (_, index) => ({
        id: `session-${String(index + 1)}`,
        index,
        name: `Session ${String(index + 1)}`,
        isTeaching: true,
      }))
    : periods.map((period) => ({
        id: period.id,
        index: period.periodIndex,
        name: period.name,
        isTeaching: period.isTeaching,
      }));
  const physicalTeachingSessionByPeriod = new Map(
    periods
      .filter((period) => period.isTeaching)
      .map((period, index) => [period.periodIndex, index]),
  );
  const snapshotEnabledSlots = weekConfiguration
    ? days
        .filter((day) => day.isWorking)
        .flatMap((day) =>
          snapshotPeriods.map((period) => ({
            id: `${day.id}-${period.id}`,
            dayIndex: day.dayIndex,
            periodIndex: period.index,
          })),
        )
    : slots.map((slot) => ({
        id: slot.id,
        dayIndex: slot.dayIndex,
        periodIndex: slot.periodIndex,
      }));
  const snapshotAvailability = availability.flatMap((rule) => {
    const periodIndex = weekConfiguration
      ? physicalTeachingSessionByPeriod.get(rule.periodIndex)
      : rule.periodIndex;
    if (periodIndex === undefined) return [];
    return [
      {
        entityType: rule.entityType,
        entityId: rule.entityId,
        dayIndex: rule.dayIndex,
        periodIndex,
        state: rule.state,
      },
    ];
  });

  return {
    schemaVersion: solverSchemaVersion,
    school: { id: school.id, name: school.name, timezone: school.timezone },
    term: { id: term.id, name: term.name, roomsEnabled: term.roomsEnabled },
    weekConfiguration: weekConfiguration
      ? {
          workingDayCount: weekConfiguration.workingDayCount,
          sessionsPerDay: weekConfiguration.sessionsPerDay,
          sessionDurationMinutes: weekConfiguration.sessionDurationMinutes,
          firstSessionStartMinutes: weekConfiguration.firstSessionStartMinutes,
          breakAfterSession: weekConfiguration.breakAfterSession,
          breakDurationMinutes: weekConfiguration.breakDurationMinutes,
        }
      : null,
    calendar: {
      days: days.map((day) => ({
        id: day.id,
        index: day.dayIndex,
        name: day.name,
        isWorking: day.isWorking,
      })),
      periods: snapshotPeriods,
      enabledSlots: snapshotEnabledSlots,
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
    classSections: classSections.map((classSection) => ({
      id: classSection.id,
      name: `${classSection.grade} ${classSection.sectionName}`,
      shortCode: classSection.shortCode,
      maxLessonsPerDay: classSection.maxLessonsPerDay,
      recessAfterSession: classSection.recessAfterSession,
    })),
    rooms: [],
    requirements: classCurricula.map((requirement) => ({
      id: requirement.id,
      classSectionId: requirement.classSectionId,
      subjectId: requirement.subjectId,
      teacherId: requirement.teacherId,
      sharedTeachingGroupId: requirement.sharedTeachingGroupId,
      weeklySessions: requirement.weeklySessions,
      isMainSubject: requirement.isMainSubject,
      allowDoubleSession: requirement.allowDoubleSession,
      fixedSlots: [],
      forbiddenSlots: [],
    })),
    availability: snapshotAvailability,
    lockedAssignments: [],
    existingAssignments: [],
    constraintProfile: {
      id: profile?.id ?? null,
      weights: {
        ...Object.fromEntries(
          softConstraints.map((constraint) => [
            constraint.code,
            constraint.defaultWeight,
          ]),
        ),
        ...Object.fromEntries(
          profile?.weights.map((weight) => [weight.code, weight.weight ?? 0]) ??
            [],
        ),
        FULL_TIME_DAILY_BALANCE:
          profile?.weights.find(
            (weight) => weight.code === "FULL_TIME_DAILY_BALANCE",
          )?.weight ??
          profile?.weights.find(
            (weight) => weight.code === "DAILY_WORKLOAD_BALANCE",
          )?.weight ??
          2,
      },
    },
    options: {
      alternativeCount: 3,
      timeLimitSeconds: 30,
      randomSeed: 12345,
      maxQualityDegradationPercent: 20,
      roomsEnabled: false,
      useExistingScheduleHint: false,
    },
  } satisfies SupervisorSolverSnapshot;
}

export async function getCurrentReadiness(schoolId: string) {
  const snapshot = await buildCurrentSnapshot(schoolId);
  return {
    snapshot,
    fingerprint: fingerprintSnapshot(snapshot),
    result: validateReadiness(snapshot),
  };
}

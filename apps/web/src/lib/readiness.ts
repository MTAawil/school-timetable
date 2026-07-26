import {
  fingerprintSnapshot,
  getDatabase,
  solverSchemaVersion,
  type SolverSnapshot,
  validateReadiness,
} from "@school-timetable/database";

import { getActiveTerm } from "@/lib/setup";

export async function buildCurrentSnapshot(
  schoolId: string,
): Promise<SolverSnapshot> {
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
    rooms,
    requirements,
    availability,
    profile,
    schedule,
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
    db.room.findMany({
      where: { schoolId, isActive: true, deletedAt: null },
      orderBy: { id: "asc" },
    }),
    db.teachingRequirement.findMany({
      where: {
        schoolId,
        termId: term.id,
        isActive: true,
        deletedAt: null,
      },
      include: {
        fixedSlots: { include: { slot: true } },
        forbiddenSlots: { include: { slot: true } },
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
    db.schedule.findFirst({
      where: { schoolId, termId: term.id, status: "DRAFT" },
      include: { assignments: { where: { isLocked: true } } },
      orderBy: { version: "desc" },
    }),
  ]);

  return {
    schemaVersion: solverSchemaVersion,
    school: { id: school.id, name: school.name, timezone: school.timezone },
    term: { id: term.id, name: term.name, roomsEnabled: term.roomsEnabled },
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
      maxLessonsPerDay: classSection.maxLessonsPerDay,
    })),
    rooms: rooms.map((room) => ({
      id: room.id,
      name: room.name,
      type: room.type,
      capacity: room.capacity,
    })),
    requirements: requirements.map((requirement) => ({
      id: requirement.id,
      classSectionId: requirement.classSectionId,
      subjectId: requirement.subjectId,
      teacherId: requirement.teacherId,
      weeklyOccurrences: requirement.weeklyOccurrences,
      durationPeriods: requirement.durationPeriods,
      maxOccurrencesPerDay: requirement.maxOccurrencesPerDay,
      minimumDistinctDays: requirement.minimumDistinctDays,
      requiredRoomId: requirement.requiredRoomId,
      requiredRoomType: requirement.requiredRoomType,
      fixedSlots: requirement.fixedSlots
        .map(({ slot }) => ({
          dayIndex: slot.dayIndex,
          periodIndex: slot.periodIndex,
        }))
        .sort(
          (left, right) =>
            left.dayIndex - right.dayIndex ||
            left.periodIndex - right.periodIndex,
        ),
      forbiddenSlots: requirement.forbiddenSlots
        .map(({ slot }) => ({
          dayIndex: slot.dayIndex,
          periodIndex: slot.periodIndex,
        }))
        .sort(
          (left, right) =>
            left.dayIndex - right.dayIndex ||
            left.periodIndex - right.periodIndex,
        ),
    })),
    availability: availability.map((rule) => ({
      entityType: rule.entityType,
      entityId: rule.entityId,
      dayIndex: rule.dayIndex,
      periodIndex: rule.periodIndex,
      state: rule.state,
    })),
    lockedAssignments:
      schedule?.assignments
        .filter(
          (
            assignment,
          ): assignment is typeof assignment & {
            startDayIndex: number;
            startPeriodIndex: number;
          } =>
            assignment.startDayIndex !== null &&
            assignment.startPeriodIndex !== null,
        )
        .map((assignment) => ({
          requirementId: assignment.teachingRequirementId,
          dayIndex: assignment.startDayIndex,
          periodIndex: assignment.startPeriodIndex,
          durationPeriods: assignment.durationPeriods,
          roomId: assignment.roomId,
        }))
        .sort((left, right) =>
          left.requirementId.localeCompare(right.requirementId),
        ) ?? [],
    existingAssignments: [],
    constraintProfile: {
      id: profile?.id ?? null,
      weights: Object.fromEntries(
        profile?.weights.map((weight) => [weight.code, weight.weight ?? 0]) ??
          [],
      ),
    },
    options: {
      alternativeCount: 3,
      timeLimitSeconds: 30,
      randomSeed: 12345,
      maxQualityDegradationPercent: 20,
      roomsEnabled: term.roomsEnabled,
      useExistingScheduleHint: Boolean(schedule),
    },
  };
}

export async function getCurrentReadiness(schoolId: string) {
  const snapshot = await buildCurrentSnapshot(schoolId);
  return {
    snapshot,
    fingerprint: fingerprintSnapshot(snapshot),
    result: validateReadiness(snapshot),
  };
}

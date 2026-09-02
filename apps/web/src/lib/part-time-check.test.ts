import { describe, expect, it } from "vitest";

import type { SupervisorSolverSnapshot } from "@school-timetable/database";

import {
  analyzePartTimeTeacherPressure,
  buildPartTimeCheckSnapshot,
} from "./part-time-check";

const baseSnapshot: SupervisorSolverSnapshot = {
  schemaVersion: 2,
  school: { id: "school", name: "School", timezone: "Asia/Beirut" },
  term: { id: "term", name: "Term", roomsEnabled: false },
  weekConfiguration: {
    workingDayCount: 2,
    sessionsPerDay: 3,
    sessionDurationMinutes: 45,
    firstSessionStartMinutes: 450,
    breakAfterSession: 2,
    breakDurationMinutes: 20,
  },
  calendar: {
    days: [
      { id: "mon", index: 0, name: "Monday", isWorking: true },
      { id: "tue", index: 1, name: "Tuesday", isWorking: true },
    ],
    periods: [
      { id: "s1", index: 0, name: "Session 1", isTeaching: true },
      { id: "s2", index: 1, name: "Session 2", isTeaching: true },
      { id: "s3", index: 2, name: "Session 3", isTeaching: true },
    ],
    enabledSlots: [
      { id: "m1", dayIndex: 0, periodIndex: 0 },
      { id: "m2", dayIndex: 0, periodIndex: 1 },
      { id: "m3", dayIndex: 0, periodIndex: 2 },
      { id: "t1", dayIndex: 1, periodIndex: 0 },
      { id: "t2", dayIndex: 1, periodIndex: 1 },
      { id: "t3", dayIndex: 1, periodIndex: 2 },
    ],
  },
  teachers: [
    {
      id: "part",
      name: "Part Timer",
      employmentType: "PART_TIME",
      weeklyTeachingSessions: 2,
      maxLessonsPerDay: null,
      maxConsecutiveLessons: null,
    },
    {
      id: "full",
      name: "Full Timer",
      employmentType: "FULL_TIME",
      weeklyTeachingSessions: 2,
      maxLessonsPerDay: null,
      maxConsecutiveLessons: null,
    },
  ],
  subjects: [
    {
      id: "math",
      name: "Math",
      preferredTimeBand: "EARLY",
      consecutivePeriodsPreferred: false,
      defaultRoomType: null,
    },
    {
      id: "history",
      name: "History",
      preferredTimeBand: "NEUTRAL",
      consecutivePeriodsPreferred: false,
      defaultRoomType: null,
    },
  ],
  classSections: [
    {
      id: "class-a",
      name: "Class A",
      shortCode: "A",
      maxLessonsPerDay: null,
      recessAfterSession: null,
    },
    {
      id: "class-b",
      name: "Class B",
      shortCode: "B",
      maxLessonsPerDay: null,
      recessAfterSession: null,
    },
  ],
  rooms: [],
  requirements: [
    {
      id: "part-req",
      classSectionId: "class-a",
      subjectId: "math",
      teacherId: "part",
      sharedTeachingGroupId: null,
      weeklySessions: 2,
      isMainSubject: false,
      allowDoubleSession: false,
      fixedSlots: [],
      forbiddenSlots: [],
    },
    {
      id: "full-req",
      classSectionId: "class-b",
      subjectId: "history",
      teacherId: "full",
      sharedTeachingGroupId: null,
      weeklySessions: 2,
      isMainSubject: false,
      allowDoubleSession: false,
      fixedSlots: [],
      forbiddenSlots: [],
    },
  ],
  availability: [
    {
      entityType: "TEACHER",
      entityId: "part",
      dayIndex: 0,
      periodIndex: 2,
      state: "UNAVAILABLE",
    },
    {
      entityType: "TEACHER",
      entityId: "full",
      dayIndex: 1,
      periodIndex: 2,
      state: "UNAVAILABLE",
    },
  ],
  lockedAssignments: [],
  existingAssignments: [],
  constraintProfile: { id: null, weights: {} },
  options: {
    alternativeCount: 3,
    timeLimitSeconds: 30,
    randomSeed: 123,
    maxQualityDegradationPercent: 20,
    roomsEnabled: false,
    useExistingScheduleHint: false,
  },
};

describe("part-time availability check", () => {
  it("filters the solver snapshot to active part-time teachers", () => {
    const snapshot = buildPartTimeCheckSnapshot(baseSnapshot, 180);

    expect(snapshot.options).toMatchObject({
      alternativeCount: 1,
      timeLimitSeconds: 180,
      maxQualityDegradationPercent: 0,
      useExistingScheduleHint: false,
    });
    expect(snapshot.teachers.map((teacher) => teacher.id)).toEqual(["part"]);
    expect(snapshot.requirements.map((requirement) => requirement.id)).toEqual([
      "part-req",
    ]);
    expect(snapshot.subjects.map((subject) => subject.id)).toEqual(["math"]);
    expect(
      snapshot.classSections.map((classSection) => classSection.id),
    ).toEqual(["class-a"]);
    expect(snapshot.availability).toEqual([
      {
        entityType: "TEACHER",
        entityId: "part",
        dayIndex: 0,
        periodIndex: 2,
        state: "UNAVAILABLE",
      },
    ]);
  });

  it("reports tight part-time teacher pressure", () => {
    const snapshot = buildPartTimeCheckSnapshot(
      {
        ...baseSnapshot,
        teachers: [
          {
            ...baseSnapshot.teachers[0]!,
            weeklyTeachingSessions: 5,
          },
        ],
        requirements: [
          {
            ...baseSnapshot.requirements[0]!,
            weeklySessions: 5,
          },
        ],
      },
      60,
    );

    expect(analyzePartTimeTeacherPressure(snapshot)[0]).toMatchObject({
      teacherId: "part",
      weeklySessions: 5,
      availableSlots: 5,
      tight: true,
    });
  });
});

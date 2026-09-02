import { describe, expect, it } from "vitest";

import type { SolverSnapshot } from "@school-timetable/database";

import { classBreakLabel, classSessionLabel } from "./session-times";

const snapshot: SolverSnapshot = {
  schemaVersion: 2,
  school: { id: "school", name: "School", timezone: "Asia/Beirut" },
  term: { id: "term", name: "Term", roomsEnabled: false },
  calendar: {
    days: [{ id: "mon", index: 0, name: "Monday", isWorking: true }],
    periods: [
      { id: "s1", index: 0, name: "Session 1", isTeaching: true },
      { id: "s2", index: 1, name: "Session 2", isTeaching: true },
      { id: "s3", index: 2, name: "Session 3", isTeaching: true },
    ],
    enabledSlots: [],
  },
  weekConfiguration: {
    workingDayCount: 5,
    sessionsPerDay: 3,
    sessionDurationMinutes: 45,
    firstSessionStartMinutes: 8 * 60,
    breakAfterSession: 2,
    breakDurationMinutes: 20,
  },
  teachers: [],
  subjects: [],
  classSections: [
    {
      id: "class-a",
      name: "Class A",
      shortCode: "A",
      maxLessonsPerDay: null,
      recessAfterSession: 1,
    },
  ],
  rooms: [],
  requirements: [],
  availability: [],
  lockedAssignments: [],
  existingAssignments: [],
  constraintProfile: { id: null, weights: {} },
  options: {
    alternativeCount: 1,
    timeLimitSeconds: 30,
    randomSeed: 1,
    maxQualityDegradationPercent: 20,
    roomsEnabled: false,
    useExistingScheduleHint: false,
  },
};

describe("session time labels", () => {
  it("uses class-specific recess timing for sessions and breaks", () => {
    expect(classSessionLabel(snapshot, "class-a", 0)).toBe(
      "Session 1 (08:00-08:45)",
    );
    expect(classSessionLabel(snapshot, "class-a", 1)).toBe(
      "Session 2 (09:05-09:50)",
    );
    expect(classBreakLabel(snapshot, "class-a")).toBe("Break (08:45-09:05)");
  });
});

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  canonicalSnapshotJson,
  fingerprintSnapshot,
  type ReadinessIssueCode,
  type SolverSnapshot,
  type SupervisorSolverSnapshot,
  validateReadiness,
} from "../src";

type Fixture = {
  id: string;
  name: string;
  dayCount: number;
  periodCount: number;
  roomsEnabled: boolean;
  teachers: { id: string; name: string }[];
  classes: { id: string; name: string }[];
  rooms: { id: string; name: string; type: string }[];
  requirements: {
    id: string;
    teacherId: string;
    classSectionId: string;
    weeklyOccurrences: number;
    durationPeriods: number;
    maxOccurrencesPerDay: number;
    minimumDistinctDays: number;
    requiredRoomId?: string;
    fixedSlots?: { dayIndex: number; periodIndex: number }[];
  }[];
  expected: {
    code: ReadinessIssueCode;
    required?: number;
    available?: number;
  };
};

const fixtures = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("./fixtures/readiness.json", import.meta.url)),
    "utf8",
  ),
) as Fixture[];

function buildSnapshot(fixture: Fixture): SolverSnapshot {
  const days = Array.from({ length: fixture.dayCount }, (_, index) => ({
    id: `day-${String(index)}`,
    index,
    name: `Day ${String(index + 1)}`,
    isWorking: true,
  }));
  const periods = Array.from({ length: fixture.periodCount }, (_, index) => ({
    id: `period-${String(index)}`,
    index,
    name: `Period ${String(index + 1)}`,
    isTeaching: true,
  }));
  return {
    schemaVersion: 1,
    school: { id: "school", name: "Test School", timezone: "Asia/Beirut" },
    term: {
      id: "term",
      name: "Test Term",
      roomsEnabled: fixture.roomsEnabled,
    },
    calendar: {
      days,
      periods,
      enabledSlots: days.flatMap((day) =>
        periods.map((period) => ({
          id: `${day.id}-${period.id}`,
          dayIndex: day.index,
          periodIndex: period.index,
        })),
      ),
    },
    teachers: fixture.teachers.map((teacher) => ({
      ...teacher,
      employmentType: "FULL_TIME",
      maxLessonsPerDay: null,
      maxConsecutiveLessons: null,
    })),
    subjects: [
      {
        id: "subject",
        name: "Science",
        preferredTimeBand: "NEUTRAL",
        consecutivePeriodsPreferred: false,
        defaultRoomType: null,
      },
    ],
    classSections: fixture.classes.map((item) => ({
      ...item,
      maxLessonsPerDay: null,
    })),
    rooms: fixture.rooms.map((room) => ({ ...room, capacity: null })),
    requirements: fixture.requirements.map((requirement) => ({
      ...requirement,
      subjectId: "subject",
      requiredRoomId: requirement.requiredRoomId ?? null,
      requiredRoomType: null,
      fixedSlots: requirement.fixedSlots ?? [],
      forbiddenSlots: [],
    })),
    availability: [],
    lockedAssignments: [],
    existingAssignments: [],
    constraintProfile: { id: null, weights: {} },
    options: {
      alternativeCount: 3,
      timeLimitSeconds: 30,
      randomSeed: 12345,
      maxQualityDegradationPercent: 20,
      roomsEnabled: fixture.roomsEnabled,
      useExistingScheduleHint: false,
    },
  };
}

describe("readiness acceptance fixtures", () => {
  for (const fixture of fixtures) {
    it(`fixture ${fixture.id}: ${fixture.name}`, () => {
      const result = validateReadiness(buildSnapshot(fixture));
      const issue = result.issues.find(
        (candidate) => candidate.code === fixture.expected.code,
      );

      expect(result.ready).toBe(false);
      expect(issue).toBeDefined();
      if (fixture.expected.required !== undefined) {
        expect(issue?.required).toBe(fixture.expected.required);
      }
      if (fixture.expected.available !== undefined) {
        expect(issue?.available).toBe(fixture.expected.available);
      }
    });
  }
});

function buildSupervisorSnapshot(
  overrides: Partial<SupervisorSolverSnapshot> = {},
): SupervisorSolverSnapshot {
  const days = Array.from({ length: 5 }, (_, index) => ({
    id: `day-${String(index)}`,
    index,
    name: `Day ${String(index + 1)}`,
    isWorking: true,
  }));
  const periods = Array.from({ length: 8 }, (_, index) => ({
    id: `period-${String(index)}`,
    index,
    name: `Period ${String(index + 1)}`,
    isTeaching: true,
  }));
  return {
    schemaVersion: 2,
    school: { id: "school", name: "School", timezone: "Asia/Beirut" },
    term: { id: "term", name: "Term", roomsEnabled: false },
    weekConfiguration: {
      workingDayCount: 5,
      sessionsPerDay: 8,
      sessionDurationMinutes: 45,
      breakAfterSession: 4,
      breakDurationMinutes: 20,
    },
    calendar: {
      days,
      periods,
      enabledSlots: days.flatMap((day) =>
        periods.map((period) => ({
          id: `${day.id}:${period.id}`,
          dayIndex: day.index,
          periodIndex: period.index,
        })),
      ),
    },
    teachers: [
      {
        id: "teacher",
        name: "Rawan",
        employmentType: "FULL_TIME",
        weeklyTeachingSessions: 6,
        maxLessonsPerDay: null,
        maxConsecutiveLessons: null,
      },
    ],
    subjects: [
      {
        id: "math",
        name: "Mathematics",
        preferredTimeBand: "NEUTRAL",
        consecutivePeriodsPreferred: false,
        defaultRoomType: null,
      },
    ],
    classSections: [
      {
        id: "g7-a",
        name: "G7 A",
        shortCode: "G7-A",
        maxLessonsPerDay: null,
      },
    ],
    rooms: [],
    requirements: [
      {
        id: "g7-a:math",
        classSectionId: "g7-a",
        subjectId: "math",
        teacherId: "teacher",
        weeklySessions: 6,
        isMainSubject: true,
        allowDoubleSession: true,
        fixedSlots: [],
        forbiddenSlots: [],
      },
    ],
    availability: [],
    lockedAssignments: [],
    existingAssignments: [],
    constraintProfile: {
      id: null,
      weights: { FULL_TIME_DAILY_BALANCE: 2 },
    },
    options: {
      alternativeCount: 1,
      timeLimitSeconds: 30,
      randomSeed: 12345,
      maxQualityDegradationPercent: 20,
      roomsEnabled: false,
      useExistingScheduleHint: false,
    },
    ...overrides,
  };
}

describe("supervisor readiness", () => {
  it("accepts an optional main-subject double", () => {
    expect(validateReadiness(buildSupervisorSnapshot())).toEqual({
      ready: true,
      issues: [],
    });
  });

  it("rejects impossible non-main frequency", () => {
    const snapshot = buildSupervisorSnapshot();
    const requirement = snapshot.requirements[0];
    if (!requirement) throw new Error("A curriculum requirement is required.");
    snapshot.requirements[0] = {
      ...requirement,
      isMainSubject: false,
      allowDoubleSession: false,
    };

    const issue = validateReadiness(snapshot).issues.find(
      (candidate) => candidate.code === "NON_MAIN_DAILY_CAPACITY_SHORTAGE",
    );

    expect(issue).toMatchObject({ required: 6, available: 5 });
  });

  it("rejects a required pair when doubles are disabled", () => {
    const snapshot = buildSupervisorSnapshot();
    const requirement = snapshot.requirements[0];
    if (!requirement) throw new Error("A curriculum requirement is required.");
    snapshot.requirements[0] = {
      ...requirement,
      allowDoubleSession: false,
    };

    expect(validateReadiness(snapshot).issues).toContainEqual(
      expect.objectContaining({ code: "DOUBLE_REQUIRED_BUT_DISABLED" }),
    );
  });

  it("requires exact declared teacher workload", () => {
    const snapshot = buildSupervisorSnapshot();
    const teacher = snapshot.teachers[0];
    if (!teacher) throw new Error("A teacher is required.");
    snapshot.teachers[0] = {
      ...teacher,
      weeklyTeachingSessions: 5,
    };

    expect(validateReadiness(snapshot).issues).toContainEqual(
      expect.objectContaining({
        code: "TEACHER_WORKLOAD_MISMATCH",
        required: 5,
        available: 6,
      }),
    );
  });
});

describe("snapshot canonicalization", () => {
  it("returns a stable SHA-256 fingerprint", () => {
    const fixture = fixtures[0];
    if (!fixture) {
      throw new Error("Fixture B is required.");
    }
    const snapshot = buildSnapshot(fixture);

    expect(fingerprintSnapshot(snapshot)).toMatch(/^[a-f0-9]{64}$/);
    expect(fingerprintSnapshot(snapshot)).toBe(fingerprintSnapshot(snapshot));
    expect(canonicalSnapshotJson(snapshot)).not.toContain("\n");
  });
});

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  canonicalSnapshotJson,
  fingerprintSnapshot,
  type ReadinessIssueCode,
  type SolverSnapshot,
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

import { createHash } from "node:crypto";

export const solverSchemaVersion = 2;

export type SnapshotAvailabilityState =
  "AVAILABLE" | "PREFERRED" | "DISLIKED" | "UNAVAILABLE";

export type SnapshotAvailability = {
  entityType: "TEACHER" | "CLASS_SECTION" | "ROOM";
  entityId: string;
  dayIndex: number;
  periodIndex: number;
  state: SnapshotAvailabilityState;
};

export type SnapshotAssignment = {
  requirementId: string;
  dayIndex: number;
  periodIndex: number;
  durationPeriods: number;
  roomId: string | null;
};

type SnapshotBase = {
  school: { id: string; name: string; timezone: string };
  term: { id: string; name: string; roomsEnabled: boolean };
  calendar: {
    days: { id: string; index: number; name: string; isWorking: boolean }[];
    periods: {
      id: string;
      index: number;
      name: string;
      isTeaching: boolean;
    }[];
    enabledSlots: { id: string; dayIndex: number; periodIndex: number }[];
  };
  subjects: {
    id: string;
    name: string;
    preferredTimeBand: "EARLY" | "NEUTRAL" | "LATE";
    consecutivePeriodsPreferred: boolean;
    defaultRoomType: string | null;
  }[];
  availability: SnapshotAvailability[];
  lockedAssignments: SnapshotAssignment[];
  existingAssignments: SnapshotAssignment[];
  constraintProfile: {
    id: string | null;
    weights: Record<string, number>;
  };
  options: {
    alternativeCount: number;
    timeLimitSeconds: number;
    randomSeed: number;
    maxQualityDegradationPercent: number;
    roomsEnabled: boolean;
    useExistingScheduleHint: boolean;
  };
};

export type LegacySolverSnapshot = SnapshotBase & {
  schemaVersion: 1;
  teachers: {
    id: string;
    name: string;
    employmentType: "FULL_TIME" | "PART_TIME";
    maxLessonsPerDay: number | null;
    maxConsecutiveLessons: number | null;
  }[];
  classSections: {
    id: string;
    name: string;
    maxLessonsPerDay: number | null;
  }[];
  rooms: { id: string; name: string; type: string; capacity: number | null }[];
  requirements: {
    id: string;
    classSectionId: string;
    subjectId: string;
    teacherId: string;
    weeklyOccurrences: number;
    durationPeriods: number;
    maxOccurrencesPerDay: number;
    minimumDistinctDays: number;
    requiredRoomId: string | null;
    requiredRoomType: string | null;
    fixedSlots: { dayIndex: number; periodIndex: number }[];
    forbiddenSlots: { dayIndex: number; periodIndex: number }[];
  }[];
};

export type SupervisorSolverSnapshot = SnapshotBase & {
  schemaVersion: 2;
  weekConfiguration: {
    workingDayCount: number;
    sessionsPerDay: number;
    sessionDurationMinutes: number;
    breakAfterSession: number;
    breakDurationMinutes: number;
  } | null;
  teachers: {
    id: string;
    name: string;
    employmentType: "FULL_TIME" | "PART_TIME";
    weeklyTeachingSessions: number;
    maxLessonsPerDay: number | null;
    maxConsecutiveLessons: number | null;
  }[];
  classSections: {
    id: string;
    name: string;
    shortCode: string;
    maxLessonsPerDay: number | null;
    recessAfterSession: number | null;
  }[];
  rooms: [];
  requirements: {
    id: string;
    classSectionId: string;
    subjectId: string;
    teacherId: string | null;
    sharedTeachingGroupId: string | null;
    weeklySessions: number;
    isMainSubject: boolean;
    allowDoubleSession: boolean;
    fixedSlots: { dayIndex: number; periodIndex: number }[];
    forbiddenSlots: { dayIndex: number; periodIndex: number }[];
  }[];
};

export type SolverSnapshot = LegacySolverSnapshot | SupervisorSolverSnapshot;

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

export function canonicalSnapshotJson(snapshot: SolverSnapshot): string {
  return JSON.stringify(canonicalize(snapshot));
}

export function fingerprintSnapshot(snapshot: SolverSnapshot): string {
  return createHash("sha256")
    .update(canonicalSnapshotJson(snapshot))
    .digest("hex");
}

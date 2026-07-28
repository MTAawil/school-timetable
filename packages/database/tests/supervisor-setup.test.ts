import { describe, expect, it } from "vitest";

import {
  buildSchoolPeriods,
  curriculumSemanticsSchema,
  defaultGradeLevels,
  findTeacherWorkloadMismatches,
  gradeCode,
  schoolWeekConfigurationSchema,
  sectionLabel,
} from "../src/domain/supervisor-setup.js";

describe("supervisor setup domain", () => {
  it("accepts a complete uniform school week", () => {
    expect(
      schoolWeekConfigurationSchema.safeParse({
        workingDayCount: 5,
        sessionsPerDay: 8,
        sessionDurationMinutes: 50,
        firstSessionStartMinutes: 480,
        breakAfterSession: 4,
        breakDurationMinutes: 20,
      }).success,
    ).toBe(true);
  });

  it("rejects a break after the final teaching session", () => {
    const result = schoolWeekConfigurationSchema.safeParse({
      workingDayCount: 5,
      sessionsPerDay: 8,
      sessionDurationMinutes: 50,
      firstSessionStartMinutes: 480,
      breakAfterSession: 8,
      breakDurationMinutes: 20,
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(
      "BREAK_CONFIGURATION_INVALID",
    );
  });

  it("allows double sessions only for main subjects", () => {
    const result = curriculumSemanticsSchema.safeParse({
      weeklySessions: 2,
      isMainSubject: false,
      allowDoubleSession: true,
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(
      "DOUBLE_SESSION_REQUIRES_MAIN_SUBJECT",
    );
  });

  it("reports exact declared and allocated workload mismatches", () => {
    expect(
      findTeacherWorkloadMismatches([
        {
          teacherId: "rawan",
          declaredWeeklySessions: 9,
          allocatedWeeklySessions: 10,
        },
        {
          teacherId: "samir",
          declaredWeeklySessions: 4,
          allocatedWeeklySessions: 4,
        },
      ]),
    ).toEqual([
      {
        code: "TEACHER_WORKLOAD_MISMATCH",
        teacherId: "rawan",
        declaredWeeklySessions: 9,
        allocatedWeeklySessions: 10,
      },
    ]);
  });

  it("provides the approved grade defaults and stable codes", () => {
    expect(defaultGradeLevels).toHaveLength(17);
    expect(defaultGradeLevels.at(-1)).toBe("G12 GS");
    expect(gradeCode("G12 LS")).toBe("G12_LS");
  });

  it("creates spreadsheet-style section labels", () => {
    expect([0, 25, 26, 27].map(sectionLabel)).toEqual(["A", "Z", "AA", "AB"]);
  });

  it("builds uniform sessions with one break", () => {
    const periods = buildSchoolPeriods({
      workingDayCount: 5,
      sessionsPerDay: 4,
      sessionDurationMinutes: 50,
      firstSessionStartMinutes: 480,
      breakAfterSession: 2,
      breakDurationMinutes: 20,
    });

    expect(periods).toEqual([
      {
        periodIndex: 0,
        name: "Session 1",
        startsAtMinutes: 480,
        endsAtMinutes: 530,
        isTeaching: true,
      },
      {
        periodIndex: 1,
        name: "Session 2",
        startsAtMinutes: 530,
        endsAtMinutes: 580,
        isTeaching: true,
      },
      {
        periodIndex: 2,
        name: "Break",
        startsAtMinutes: 580,
        endsAtMinutes: 600,
        isTeaching: false,
      },
      {
        periodIndex: 3,
        name: "Session 3",
        startsAtMinutes: 600,
        endsAtMinutes: 650,
        isTeaching: true,
      },
      {
        periodIndex: 4,
        name: "Session 4",
        startsAtMinutes: 650,
        endsAtMinutes: 700,
        isTeaching: true,
      },
    ]);
  });
});

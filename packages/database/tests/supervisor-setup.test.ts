import { describe, expect, it } from "vitest";

import {
  curriculumSemanticsSchema,
  findTeacherWorkloadMismatches,
  schoolWeekConfigurationSchema,
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
});

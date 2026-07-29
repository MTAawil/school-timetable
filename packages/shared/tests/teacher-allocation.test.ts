import { describe, expect, it } from "vitest";

import {
  countUncoveredCurriculum,
  summarizeTeacherWorkloads,
  validateTeacherWorkflowAllocation,
} from "../src/teacher-allocation.js";

describe("teacher allocation summaries", () => {
  const teachers = [
    { teacherId: "rawan", declaredWeeklySessions: 9 },
    { teacherId: "samir", declaredWeeklySessions: 4 },
    { teacherId: "nour", declaredWeeklySessions: 6 },
  ];
  const curriculum = [
    {
      classCurriculumId: "g7-a-math",
      teacherId: "rawan",
      weeklySessions: 5,
    },
    {
      classCurriculumId: "g7-b-math",
      teacherId: "rawan",
      weeklySessions: 5,
    },
    {
      classCurriculumId: "g7-a-history",
      teacherId: "samir",
      weeklySessions: 4,
    },
    {
      classCurriculumId: "g7-b-history",
      teacherId: null,
      weeklySessions: 2,
    },
  ];

  it("reports under, exact, and excessive workload explicitly", () => {
    expect(summarizeTeacherWorkloads(teachers, curriculum)).toEqual([
      {
        teacherId: "rawan",
        declaredWeeklySessions: 9,
        allocatedWeeklySessions: 10,
        remainingSessions: 0,
        excessSessions: 1,
        status: "OVER",
      },
      {
        teacherId: "samir",
        declaredWeeklySessions: 4,
        allocatedWeeklySessions: 4,
        remainingSessions: 0,
        excessSessions: 0,
        status: "EXACT",
      },
      {
        teacherId: "nour",
        declaredWeeklySessions: 6,
        allocatedWeeklySessions: 0,
        remainingSessions: 6,
        excessSessions: 0,
        status: "UNDER",
      },
    ]);
  });

  it("counts every uncovered class-subject", () => {
    expect(countUncoveredCurriculum(curriculum)).toBe(1);
  });

  it("accepts only an exact teacher-owned or unassigned selection", () => {
    expect(
      validateTeacherWorkflowAllocation(
        "rawan",
        7,
        ["g7-a-math", "g7-b-history"],
        curriculum,
      ),
    ).toEqual({ valid: true, allocatedWeeklySessions: 7 });
  });

  it("rejects another teacher's class-subject", () => {
    expect(
      validateTeacherWorkflowAllocation(
        "rawan",
        4,
        ["g7-a-history"],
        curriculum,
      ),
    ).toEqual({
      valid: false,
      code: "CLASS_SUBJECT_ALREADY_ASSIGNED",
      allocatedWeeklySessions: 0,
    });
  });

  it("accepts an explicitly confirmed reassignment", () => {
    expect(
      validateTeacherWorkflowAllocation(
        "rawan",
        4,
        ["g7-a-history"],
        curriculum,
        ["g7-a-history"],
      ),
    ).toEqual({ valid: true, allocatedWeeklySessions: 4 });
  });

  it("rejects stale, duplicate, and inexact selections", () => {
    expect(
      validateTeacherWorkflowAllocation("rawan", 5, ["missing"], curriculum),
    ).toMatchObject({ valid: false, code: "ALLOCATION_FORM_STALE" });
    expect(
      validateTeacherWorkflowAllocation(
        "rawan",
        10,
        ["g7-a-math", "g7-a-math"],
        curriculum,
      ),
    ).toMatchObject({ valid: false, code: "ALLOCATION_FORM_STALE" });
    expect(
      validateTeacherWorkflowAllocation("rawan", 9, ["g7-a-math"], curriculum),
    ).toEqual({
      valid: false,
      code: "TEACHER_WORKLOAD_MISMATCH",
      allocatedWeeklySessions: 5,
    });
  });
});

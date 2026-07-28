import { describe, expect, it } from "vitest";

import {
  countUncoveredCurriculum,
  summarizeTeacherWorkloads,
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
});

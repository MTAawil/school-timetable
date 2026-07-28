import { describe, expect, it } from "vitest";

import {
  curriculumCapacityIssue,
  defaultMainSubject,
  formatTeachingTime,
  starterSubjects,
} from "../src/curriculum.js";

describe("curriculum rules", () => {
  it("provides the approved editable starter catalogue", () => {
    expect(starterSubjects).toHaveLength(16);
    expect(starterSubjects[0]).toEqual(["ARABIC", "Arabic"]);
  });

  it("applies grade-specific main-subject defaults", () => {
    expect(defaultMainSubject("G7", "MATHEMATICS")).toBe(true);
    expect(defaultMainSubject("G11", "PHYSICS")).toBe(true);
    expect(defaultMainSubject("G12_LS", "CHEMISTRY")).toBe(true);
    expect(defaultMainSubject("G12_ES", "CHEMISTRY")).toBe(false);
    expect(defaultMainSubject("G7", "HISTORY")).toBe(false);
  });

  it("reports each daily-capacity failure without weakening it", () => {
    expect(
      curriculumCapacityIssue(
        {
          weeklySessions: 6,
          isMainSubject: false,
          allowDoubleSession: false,
        },
        5,
      ),
    ).toBe("NON_MAIN_DAILY_CAPACITY_SHORTAGE");
    expect(
      curriculumCapacityIssue(
        {
          weeklySessions: 6,
          isMainSubject: true,
          allowDoubleSession: false,
        },
        5,
      ),
    ).toBe("DOUBLE_REQUIRED_BUT_DISABLED");
    expect(
      curriculumCapacityIssue(
        {
          weeklySessions: 11,
          isMainSubject: true,
          allowDoubleSession: true,
        },
        5,
      ),
    ).toBe("MAIN_DAILY_CAPACITY_SHORTAGE");
  });

  it("calculates teaching time from physical sessions", () => {
    expect(formatTeachingTime(5, 50)).toBe("4h 10m");
  });
});

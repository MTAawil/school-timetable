import { describe, expect, it } from "vitest";

import {
  automaticWorkloadPreference,
  teacherAvailableCapacity,
} from "../src/teacher-restrictions.js";

describe("teacher restriction capacity", () => {
  it("accounts for hard unavailable slots and the optional daily maximum", () => {
    expect(
      teacherAvailableCapacity(
        [0, 1],
        [0, 1, 2, 3],
        [
          { dayIndex: 0, periodIndex: 0, state: "UNAVAILABLE" },
          { dayIndex: 0, periodIndex: 1, state: "PREFERRED" },
          { dayIndex: 1, periodIndex: 0, state: "DISLIKED" },
        ],
        3,
      ),
    ).toBe(6);
  });

  it("selects workload soft behavior from employment type", () => {
    expect(automaticWorkloadPreference("FULL_TIME")).toBe(
      "FULL_TIME_DAILY_BALANCE",
    );
    expect(automaticWorkloadPreference("PART_TIME")).toBe(
      "PART_TIME_COMPACTNESS",
    );
  });
});

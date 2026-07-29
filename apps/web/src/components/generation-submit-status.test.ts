import { describe, expect, it } from "vitest";

import { generationStageForElapsed } from "@/components/generation-submit-status";

describe("generationStageForElapsed", () => {
  it("reports honest generation stages without estimated percentages", () => {
    expect(generationStageForElapsed(0)).toBe(
      "Preparing and validating timetable inputs",
    );
    expect(generationStageForElapsed(2)).toBe("Starting the scheduling solver");
    expect(generationStageForElapsed(5)).toBe(
      "Solver is evaluating constraints and timetable options",
    );
  });
});

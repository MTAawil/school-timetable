import { describe, expect, it } from "vitest";

import {
  occupiedPeriodsPerWeek,
  teachingRequirementSemanticsSchema,
} from "../src/domain/teaching-requirement.js";

describe("teaching requirement semantics", () => {
  it("distinguishes occurrences from occupied physical periods", () => {
    expect(
      occupiedPeriodsPerWeek({
        weeklyOccurrences: 2,
        durationPeriods: 2,
      }),
    ).toBe(4);
  });

  it("rejects more fixed slots than weekly occurrences", () => {
    const result = teachingRequirementSemanticsSchema.safeParse({
      weeklyOccurrences: 2,
      durationPeriods: 1,
      minOccurrencesPerDay: 0,
      maxOccurrencesPerDay: 1,
      minimumDistinctDays: 2,
      allowMultipleOccurrencesSameDay: false,
      fixedSlotCount: 3,
    });

    expect(result.success).toBe(false);
  });

  it("rejects a daily maximum above one when repetition is disabled", () => {
    const result = teachingRequirementSemanticsSchema.safeParse({
      weeklyOccurrences: 3,
      durationPeriods: 1,
      minOccurrencesPerDay: 0,
      maxOccurrencesPerDay: 2,
      minimumDistinctDays: 2,
      allowMultipleOccurrencesSameDay: false,
      fixedSlotCount: 0,
    });

    expect(result.success).toBe(false);
  });
});

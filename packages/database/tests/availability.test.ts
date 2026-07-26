import { describe, expect, it } from "vitest";

import {
  assertAvailabilityRulesUnique,
  availabilityRuleKey,
} from "../src/domain/availability.js";

const rule = {
  termId: "00000000-0000-4000-8000-000000000001",
  entityType: "TEACHER" as const,
  entityId: "00000000-0000-4000-8000-000000000002",
  dayIndex: 1,
  periodIndex: 2,
};

describe("availability identity", () => {
  it("uses term, entity, day, and period as the stable key", () => {
    expect(availabilityRuleKey(rule)).toBe(
      `${rule.termId}:TEACHER:${rule.entityId}:1:2`,
    );
  });

  it("rejects duplicate rules for the same entity slot", () => {
    expect(() => {
      assertAvailabilityRulesUnique([rule, rule]);
    }).toThrow("Availability rules must be unique");
  });
});

import { z } from "zod";

const availabilityRuleSchema = z.object({
  termId: z.uuid(),
  entityType: z.enum(["TEACHER", "CLASS_SECTION", "ROOM"]),
  entityId: z.uuid(),
  dayIndex: z.number().int().min(0).max(6),
  periodIndex: z.number().int().nonnegative(),
});

type AvailabilityRuleKeyInput = z.input<typeof availabilityRuleSchema>;

export function availabilityRuleKey(input: AvailabilityRuleKeyInput): string {
  const rule = availabilityRuleSchema.parse(input);
  return [
    rule.termId,
    rule.entityType,
    rule.entityId,
    rule.dayIndex,
    rule.periodIndex,
  ].join(":");
}

export function assertAvailabilityRulesUnique(
  rules: AvailabilityRuleKeyInput[],
): void {
  const keys = rules.map(availabilityRuleKey);
  if (new Set(keys).size !== keys.length) {
    throw new Error("Availability rules must be unique per entity and slot.");
  }
}

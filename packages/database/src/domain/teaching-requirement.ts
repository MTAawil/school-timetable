import { z } from "zod";

export const teachingRequirementSemanticsSchema = z
  .object({
    weeklyOccurrences: z.number().int().positive(),
    durationPeriods: z.number().int().positive(),
    minOccurrencesPerDay: z.number().int().nonnegative(),
    maxOccurrencesPerDay: z.number().int().positive(),
    minimumDistinctDays: z.number().int().positive(),
    allowMultipleOccurrencesSameDay: z.boolean(),
    fixedSlotCount: z.number().int().nonnegative(),
  })
  .superRefine((value, context) => {
    if (value.minOccurrencesPerDay > value.maxOccurrencesPerDay) {
      context.addIssue({
        code: "custom",
        path: ["minOccurrencesPerDay"],
        message: "Daily minimum cannot exceed daily maximum.",
      });
    }
    if (value.minimumDistinctDays > value.weeklyOccurrences) {
      context.addIssue({
        code: "custom",
        path: ["minimumDistinctDays"],
        message: "Distinct days cannot exceed weekly occurrences.",
      });
    }
    if (
      !value.allowMultipleOccurrencesSameDay &&
      value.maxOccurrencesPerDay > 1
    ) {
      context.addIssue({
        code: "custom",
        path: ["maxOccurrencesPerDay"],
        message:
          "Daily maximum must be one when multiple occurrences are disabled.",
      });
    }
    if (value.fixedSlotCount > value.weeklyOccurrences) {
      context.addIssue({
        code: "custom",
        path: ["fixedSlotCount"],
        message: "Fixed slots cannot exceed weekly occurrences.",
      });
    }
  });

export function occupiedPeriodsPerWeek(input: {
  weeklyOccurrences: number;
  durationPeriods: number;
}): number {
  const value = z
    .object({
      weeklyOccurrences: z.number().int().positive(),
      durationPeriods: z.number().int().positive(),
    })
    .parse(input);
  return value.weeklyOccurrences * value.durationPeriods;
}

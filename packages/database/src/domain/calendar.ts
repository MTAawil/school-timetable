import { z } from "zod";

const daySchema = z.object({
  dayIndex: z.number().int().min(0).max(6),
  isWorking: z.boolean(),
});

const periodSchema = z.object({
  periodIndex: z.number().int().nonnegative(),
  isTeaching: z.boolean(),
});

export type CalendarSlot = {
  dayIndex: number;
  periodIndex: number;
  isTeaching: boolean;
};

export function buildCalendarSlots(
  daysInput: z.input<typeof daySchema>[],
  periodsInput: z.input<typeof periodSchema>[],
): CalendarSlot[] {
  const days = daysInput.map((day) => daySchema.parse(day));
  const periods = periodsInput.map((period) => periodSchema.parse(period));
  assertUnique(
    days.map((day) => day.dayIndex),
    "dayIndex",
  );
  assertUnique(
    periods.map((period) => period.periodIndex),
    "periodIndex",
  );

  return days
    .filter((day) => day.isWorking)
    .flatMap((day) =>
      periods.map((period) => ({
        dayIndex: day.dayIndex,
        periodIndex: period.periodIndex,
        isTeaching: period.isTeaching,
      })),
    );
}

function assertUnique(values: number[], field: string): void {
  if (new Set(values).size !== values.length) {
    throw new Error(`Calendar ${field} values must be unique.`);
  }
}

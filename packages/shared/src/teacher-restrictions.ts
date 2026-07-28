export type TeacherRestrictionState =
  "AVAILABLE" | "PREFERRED" | "DISLIKED" | "UNAVAILABLE";

export type RestrictionSlot = {
  dayIndex: number;
  periodIndex: number;
  state: TeacherRestrictionState;
};

export function teacherAvailableCapacity(
  workingDayIndexes: number[],
  teachingPeriodIndexes: number[],
  restrictions: RestrictionSlot[],
  maxLessonsPerDay: number | null,
): number {
  const unavailable = new Set(
    restrictions
      .filter((restriction) => restriction.state === "UNAVAILABLE")
      .map(
        (restriction) =>
          `${String(restriction.dayIndex)}:${String(restriction.periodIndex)}`,
      ),
  );

  return workingDayIndexes.reduce((total, dayIndex) => {
    const available = teachingPeriodIndexes.filter(
      (periodIndex) =>
        !unavailable.has(`${String(dayIndex)}:${String(periodIndex)}`),
    ).length;
    return (
      total +
      (maxLessonsPerDay === null
        ? available
        : Math.min(available, maxLessonsPerDay))
    );
  }, 0);
}

export function automaticWorkloadPreference(
  employmentType: "FULL_TIME" | "PART_TIME",
): "FULL_TIME_DAILY_BALANCE" | "PART_TIME_COMPACTNESS" {
  return employmentType === "FULL_TIME"
    ? "FULL_TIME_DAILY_BALANCE"
    : "PART_TIME_COMPACTNESS";
}

import {
  buildSchoolPeriods,
  type SolverSnapshot,
} from "@school-timetable/database";

export function timeLabel(minutes: number): string {
  return `${Math.floor(minutes / 60)
    .toString()
    .padStart(2, "0")}:${(minutes % 60).toString().padStart(2, "0")}`;
}

export function classSessionLabel(
  snapshot: SolverSnapshot,
  classSectionId: string,
  periodIndex: number,
  durationPeriods = 1,
): string {
  if (snapshot.schemaVersion !== 2 || !snapshot.weekConfiguration) {
    const period = snapshot.calendar.periods.find(
      (item) => item.index === periodIndex,
    );
    return period?.name ?? `Session ${String(periodIndex + 1)}`;
  }

  const classSection = snapshot.classSections.find(
    (item) => item.id === classSectionId,
  );
  const periods = buildSchoolPeriods(
    snapshot.weekConfiguration,
    classSection?.recessAfterSession ?? null,
  ).filter((period) => period.isTeaching);
  const startPeriod = periods[periodIndex];
  const endPeriod = periods[periodIndex + durationPeriods - 1];
  if (!startPeriod || !endPeriod) return `Session ${String(periodIndex + 1)}`;

  return `${startPeriod.name} (${timeLabel(startPeriod.startsAtMinutes)}-${timeLabel(endPeriod.endsAtMinutes)})`;
}

export function classBreakLabel(
  snapshot: SolverSnapshot,
  classSectionId: string,
): string | null {
  if (snapshot.schemaVersion !== 2 || !snapshot.weekConfiguration) return null;
  const classSection = snapshot.classSections.find(
    (item) => item.id === classSectionId,
  );
  const periods = buildSchoolPeriods(
    snapshot.weekConfiguration,
    classSection?.recessAfterSession ?? null,
  );
  const breakPeriod = periods.find((period) => !period.isTeaching);
  if (!breakPeriod) return null;
  return `Break (${timeLabel(breakPeriod.startsAtMinutes)}-${timeLabel(breakPeriod.endsAtMinutes)})`;
}

export function assignmentSessionLabel(
  snapshot: SolverSnapshot,
  requirementId: string,
  periodIndex: number,
  durationPeriods = 1,
): string {
  if (snapshot.schemaVersion !== 2 || !snapshot.weekConfiguration) {
    const period = snapshot.calendar.periods.find(
      (item) => item.index === periodIndex,
    );
    return period?.name ?? `Session ${String(periodIndex + 1)}`;
  }
  if (
    typeof (
      snapshot.weekConfiguration as { firstSessionStartMinutes?: unknown }
    ).firstSessionStartMinutes !== "number"
  ) {
    const period = snapshot.calendar.periods.find(
      (item) => item.index === periodIndex,
    );
    return period?.name ?? `Session ${String(periodIndex + 1)}`;
  }

  const requirement = snapshot.requirements.find(
    (item) => item.id === requirementId,
  );
  if (!requirement) return `Session ${String(periodIndex + 1)}`;
  return classSessionLabel(
    snapshot,
    requirement.classSectionId,
    periodIndex,
    durationPeriods,
  );
}

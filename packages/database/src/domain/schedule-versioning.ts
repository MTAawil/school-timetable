export type ScheduleVersionState = {
  id: string;
  schoolId: string;
  termId: string;
  version: number;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
};

export function assertScheduleMutable(
  schedule: Pick<ScheduleVersionState, "status">,
): void {
  if (schedule.status !== "DRAFT") {
    throw new Error("Only draft schedules can be modified.");
  }
}

export function deriveDraftVersion(
  parent: ScheduleVersionState,
  nextVersion: number,
): ScheduleVersionState & { parentScheduleId: string } {
  if (!Number.isInteger(nextVersion) || nextVersion <= parent.version) {
    throw new Error("A derived schedule version must increase monotonically.");
  }

  return {
    id: crypto.randomUUID(),
    schoolId: parent.schoolId,
    termId: parent.termId,
    version: nextVersion,
    status: "DRAFT",
    parentScheduleId: parent.id,
  };
}

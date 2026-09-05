export const starterSubjects = [
  ["ARABIC", "Arabic"],
  ["ENGLISH", "English"],
  ["MATHEMATICS", "Mathematics"],
  ["SCIENCE", "Science"],
  ["PHYSICS", "Physics"],
  ["CHEMISTRY", "Chemistry"],
  ["BIOLOGY", "Biology"],
  ["HISTORY", "History"],
  ["GEOGRAPHY", "Geography"],
  ["CIVICS", "Civics"],
  ["COMPUTER_SCIENCE", "Computer Science"],
  ["PHYSICAL_EDUCATION", "Physical Education"],
  ["ART", "Art"],
  ["MUSIC", "Music"],
  ["RELIGION", "Religion"],
  ["FRENCH", "French"],
] as const;

export type CurriculumCell = {
  weeklySessions: number;
  isMainSubject: boolean;
  allowDoubleSession: boolean;
};

export type CurriculumCapacityCode =
  | "NON_MAIN_DAILY_CAPACITY_SHORTAGE"
  | "DOUBLE_REQUIRED_BUT_DISABLED"
  | "MAIN_DAILY_CAPACITY_SHORTAGE";

export function defaultMainSubject(
  gradeCode: string,
  subjectCode: string,
): boolean {
  if (["ARABIC", "ENGLISH", "MATHEMATICS"].includes(subjectCode)) {
    return true;
  }
  if (gradeCode === "G11" && subjectCode === "PHYSICS") {
    return true;
  }
  return (
    gradeCode === "G12_LS" &&
    ["PHYSICS", "CHEMISTRY", "BIOLOGY"].includes(subjectCode)
  );
}

export function curriculumCapacityIssue(
  cell: CurriculumCell,
  workingDayCount: number,
): CurriculumCapacityCode | null {
  if (cell.weeklySessions <= 0) {
    return null;
  }
  if (
    !cell.isMainSubject &&
    cell.weeklySessions > workingDayCount + (cell.allowDoubleSession ? 1 : 0)
  ) {
    return "NON_MAIN_DAILY_CAPACITY_SHORTAGE";
  }
  if (
    cell.isMainSubject &&
    !cell.allowDoubleSession &&
    cell.weeklySessions >= 2
  ) {
    return "DOUBLE_REQUIRED_BUT_DISABLED";
  }
  if (cell.isMainSubject && cell.weeklySessions > workingDayCount * 2) {
    return "MAIN_DAILY_CAPACITY_SHORTAGE";
  }
  return null;
}

export function formatTeachingTime(
  weeklySessions: number,
  sessionDurationMinutes: number,
): string {
  const totalMinutes = weeklySessions * sessionDurationMinutes;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) {
    return `${String(minutes)}m`;
  }
  return minutes === 0
    ? `${String(hours)}h`
    : `${String(hours)}h ${String(minutes)}m`;
}

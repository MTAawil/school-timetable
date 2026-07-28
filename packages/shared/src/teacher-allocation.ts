export type TeacherWorkloadInput = {
  teacherId: string;
  declaredWeeklySessions: number;
};

export type CurriculumOwnershipInput = {
  classCurriculumId: string;
  teacherId: string | null;
  weeklySessions: number;
};

export type TeacherWorkloadSummary = {
  teacherId: string;
  declaredWeeklySessions: number;
  allocatedWeeklySessions: number;
  remainingSessions: number;
  excessSessions: number;
  status: "EXACT" | "UNDER" | "OVER";
};

export function summarizeTeacherWorkloads(
  teachers: TeacherWorkloadInput[],
  curriculum: CurriculumOwnershipInput[],
): TeacherWorkloadSummary[] {
  return teachers.map((teacher) => {
    const allocatedWeeklySessions = curriculum
      .filter((item) => item.teacherId === teacher.teacherId)
      .reduce((total, item) => total + item.weeklySessions, 0);
    const difference = teacher.declaredWeeklySessions - allocatedWeeklySessions;
    return {
      teacherId: teacher.teacherId,
      declaredWeeklySessions: teacher.declaredWeeklySessions,
      allocatedWeeklySessions,
      remainingSessions: Math.max(0, difference),
      excessSessions: Math.max(0, -difference),
      status: difference === 0 ? "EXACT" : difference > 0 ? "UNDER" : "OVER",
    };
  });
}

export function countUncoveredCurriculum(
  curriculum: CurriculumOwnershipInput[],
): number {
  return curriculum.filter((item) => item.teacherId === null).length;
}

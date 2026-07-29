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

export type TeacherWorkflowAllocationResult =
  | {
      valid: true;
      allocatedWeeklySessions: number;
    }
  | {
      valid: false;
      code:
        | "ALLOCATION_FORM_STALE"
        | "CLASS_SUBJECT_ALREADY_ASSIGNED"
        | "TEACHER_WORKLOAD_MISMATCH";
      allocatedWeeklySessions: number;
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

export function validateTeacherWorkflowAllocation(
  teacherId: string | null,
  declaredWeeklySessions: number,
  selectedCurriculumIds: string[],
  curriculum: CurriculumOwnershipInput[],
  confirmedReassignmentIds: string[] = [],
): TeacherWorkflowAllocationResult {
  const selectedIdSet = new Set(selectedCurriculumIds);
  const confirmedIdSet = new Set(confirmedReassignmentIds);
  if (
    selectedIdSet.size !== selectedCurriculumIds.length ||
    confirmedIdSet.size !== confirmedReassignmentIds.length ||
    confirmedReassignmentIds.some((id) => !selectedIdSet.has(id))
  ) {
    return {
      valid: false,
      code: "ALLOCATION_FORM_STALE",
      allocatedWeeklySessions: 0,
    };
  }
  const curriculumById = new Map(
    curriculum.map((item) => [item.classCurriculumId, item]),
  );
  let allocatedWeeklySessions = 0;
  for (const id of selectedCurriculumIds) {
    const item = curriculumById.get(id);
    if (!item) {
      return {
        valid: false,
        code: "ALLOCATION_FORM_STALE",
        allocatedWeeklySessions,
      };
    }
    if (
      item.teacherId &&
      item.teacherId !== teacherId &&
      !confirmedIdSet.has(id)
    ) {
      return {
        valid: false,
        code: "CLASS_SUBJECT_ALREADY_ASSIGNED",
        allocatedWeeklySessions,
      };
    }
    allocatedWeeklySessions += item.weeklySessions;
  }
  if (allocatedWeeklySessions !== declaredWeeklySessions) {
    return {
      valid: false,
      code: "TEACHER_WORKLOAD_MISMATCH",
      allocatedWeeklySessions,
    };
  }
  return { valid: true, allocatedWeeklySessions };
}

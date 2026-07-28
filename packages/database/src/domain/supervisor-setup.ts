import { z } from "zod";

export const schoolWeekConfigurationSchema = z
  .object({
    workingDayCount: z.number().int().min(1).max(7),
    sessionsPerDay: z.number().int().positive(),
    sessionDurationMinutes: z.number().int().positive(),
    firstSessionStartMinutes: z.number().int().min(0).max(1439),
    breakAfterSession: z.number().int().positive(),
    breakDurationMinutes: z.number().int().positive(),
  })
  .superRefine((configuration, context) => {
    if (configuration.breakAfterSession >= configuration.sessionsPerDay) {
      context.addIssue({
        code: "custom",
        path: ["breakAfterSession"],
        message: "BREAK_CONFIGURATION_INVALID",
      });
    }
  });

export const curriculumSemanticsSchema = z
  .object({
    weeklySessions: z.number().int().positive(),
    isMainSubject: z.boolean(),
    allowDoubleSession: z.boolean(),
  })
  .superRefine((curriculum, context) => {
    if (curriculum.allowDoubleSession && !curriculum.isMainSubject) {
      context.addIssue({
        code: "custom",
        path: ["allowDoubleSession"],
        message: "DOUBLE_SESSION_REQUIRES_MAIN_SUBJECT",
      });
    }
  });

export type TeacherWorkload = {
  teacherId: string;
  declaredWeeklySessions: number;
  allocatedWeeklySessions: number;
};

export type TeacherWorkloadMismatch = TeacherWorkload & {
  code: "TEACHER_WORKLOAD_MISMATCH";
};

export function findTeacherWorkloadMismatches(
  workloads: TeacherWorkload[],
): TeacherWorkloadMismatch[] {
  return workloads
    .filter(
      (workload) =>
        !Number.isInteger(workload.declaredWeeklySessions) ||
        workload.declaredWeeklySessions <= 0 ||
        !Number.isInteger(workload.allocatedWeeklySessions) ||
        workload.allocatedWeeklySessions !== workload.declaredWeeklySessions,
    )
    .map((workload) => ({
      code: "TEACHER_WORKLOAD_MISMATCH",
      ...workload,
    }));
}

import { z } from "zod";

export const defaultGradeLevels = [
  "KG1",
  "KG2",
  "KG3",
  "G1",
  "G2",
  "G3",
  "G4",
  "G5",
  "G6",
  "G7",
  "G8",
  "G9",
  "G10",
  "G11",
  "G12 LS",
  "G12 ES",
  "G12 GS",
] as const;

export function gradeCode(name: string): string {
  return name.trim().toUpperCase().replaceAll(" ", "_");
}

export function sectionLabel(index: number): string {
  if (!Number.isInteger(index) || index < 0) {
    throw new Error("SECTION_INDEX_INVALID");
  }

  let value = index + 1;
  let label = "";
  while (value > 0) {
    value -= 1;
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26);
  }
  return label;
}

export type SchoolPeriod = {
  periodIndex: number;
  name: string;
  startsAtMinutes: number;
  endsAtMinutes: number;
  isTeaching: boolean;
};

export function buildSchoolPeriods(
  configuration: z.input<typeof schoolWeekConfigurationSchema>,
  breakAfterSessionOverride?: number | null,
): SchoolPeriod[] {
  const input = schoolWeekConfigurationSchema.parse(configuration);
  const breakAfterSession =
    breakAfterSessionOverride === undefined ||
    breakAfterSessionOverride === null
      ? input.breakAfterSession
      : z
          .number()
          .int()
          .positive()
          .max(input.sessionsPerDay - 1)
          .parse(breakAfterSessionOverride);
  const periods: SchoolPeriod[] = [];
  let startsAtMinutes = input.firstSessionStartMinutes;

  for (let session = 1; session <= input.sessionsPerDay; session += 1) {
    periods.push({
      periodIndex: periods.length,
      name: `Session ${String(session)}`,
      startsAtMinutes,
      endsAtMinutes: startsAtMinutes + input.sessionDurationMinutes,
      isTeaching: true,
    });
    startsAtMinutes += input.sessionDurationMinutes;

    if (session === breakAfterSession) {
      periods.push({
        periodIndex: periods.length,
        name: "Break",
        startsAtMinutes,
        endsAtMinutes: startsAtMinutes + input.breakDurationMinutes,
        isTeaching: false,
      });
      startsAtMinutes += input.breakDurationMinutes;
    }
  }

  const finalPeriod = periods.at(-1);
  if (!finalPeriod) {
    throw new Error("SCHOOL_DAY_HAS_NO_PERIODS");
  }
  if (finalPeriod.endsAtMinutes > 1440) {
    throw new Error("SCHOOL_DAY_EXCEEDS_MIDNIGHT");
  }

  return periods;
}

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

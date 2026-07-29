import { getDatabase } from "../packages/database/src/index";
import { defaultMainSubject } from "../packages/shared/src/curriculum";

function gradeCode(value: string): string {
  const normalized = value
    .trim()
    .toUpperCase()
    .replaceAll(/[^A-Z0-9]+/g, "");
  if (/^\d+$/.test(normalized)) return `G${normalized}`;
  return normalized || "GRADE";
}

function minutesOfDay(value: Date): number {
  return value.getUTCHours() * 60 + value.getUTCMinutes();
}

async function main(): Promise<void> {
  const db = getDatabase();
  const terms = await db.academicTerm.findMany({
    where: { deletedAt: null },
    include: {
      weekConfiguration: true,
      days: { orderBy: { dayIndex: "asc" } },
      periods: { orderBy: { periodIndex: "asc" } },
      classSections: {
        where: { isActive: true, deletedAt: null },
        orderBy: { shortCode: "asc" },
      },
      requirements: {
        where: { isActive: true, deletedAt: null },
        include: { subject: true },
      },
    },
  });

  for (const term of terms) {
    await db.$transaction(async (transaction) => {
      const workingDays = term.days.filter((day) => day.isWorking);
      const teachingPeriods = term.periods.filter(
        (period) => period.isTeaching,
      );
      const breakPeriod = term.periods.find((period) => !period.isTeaching);
      if (
        workingDays.length > 0 &&
        teachingPeriods.length > 1 &&
        !term.weekConfiguration
      ) {
        const first = teachingPeriods[0];
        if (!first) throw new Error(`TERM_HAS_NO_TEACHING_PERIODS:${term.id}`);
        const sessionDurationMinutes =
          minutesOfDay(first.endsAt) - minutesOfDay(first.startsAt);
        const breakAfterSession = breakPeriod
          ? teachingPeriods.filter(
              (period) => period.periodIndex < breakPeriod.periodIndex,
            ).length
          : Math.max(1, Math.floor(teachingPeriods.length / 2));
        await transaction.schoolWeekConfiguration.create({
          data: {
            schoolId: term.schoolId,
            termId: term.id,
            workingDayCount: workingDays.length,
            sessionsPerDay: teachingPeriods.length,
            sessionDurationMinutes,
            firstSessionStartMinutes: minutesOfDay(first.startsAt),
            breakAfterSession,
            breakDurationMinutes: breakPeriod
              ? minutesOfDay(breakPeriod.endsAt) -
                minutesOfDay(breakPeriod.startsAt)
              : 20,
          },
        });
      }

      const gradeByLegacyName = new Map<string, string>();
      const orderedGrades = Array.from(
        new Set(term.classSections.map((section) => section.grade)),
      );
      for (const [displayOrder, legacyGrade] of orderedGrades.entries()) {
        const code = gradeCode(legacyGrade);
        const grade = await transaction.gradeLevel.upsert({
          where: {
            schoolId_code: { schoolId: term.schoolId, code },
          },
          update: { isActive: true },
          create: {
            schoolId: term.schoolId,
            code,
            name: legacyGrade,
            displayOrder,
          },
        });
        gradeByLegacyName.set(legacyGrade, grade.id);
      }

      for (const section of term.classSections) {
        const gradeLevelId = gradeByLegacyName.get(section.grade);
        if (!gradeLevelId) {
          throw new Error(`GRADE_CONVERSION_FAILED:${section.id}`);
        }
        await transaction.classSection.update({
          where: { id: section.id },
          data: {
            gradeLevelId,
            sectionLabel: section.sectionName,
            generatedName: section.sectionName,
            generatedShortCode: section.shortCode,
          },
        });
      }

      const requirementsByClassSubject = new Map<
        string,
        (typeof term.requirements)[number][]
      >();
      for (const requirement of term.requirements) {
        const key = `${requirement.classSectionId}:${requirement.subjectId}`;
        const grouped = requirementsByClassSubject.get(key) ?? [];
        grouped.push(requirement);
        requirementsByClassSubject.set(key, grouped);
      }

      for (const grouped of requirementsByClassSubject.values()) {
        const first = grouped[0];
        if (!first) continue;
        const teacherIds = new Set(grouped.map((item) => item.teacherId));
        if (teacherIds.size !== 1) {
          throw new Error(
            `CLASS_SUBJECT_MULTIPLE_TEACHERS:${first.classSectionId}:${first.subjectId}`,
          );
        }
        const section = term.classSections.find(
          (item) => item.id === first.classSectionId,
        );
        const gradeLevelId = section
          ? gradeByLegacyName.get(section.grade)
          : undefined;
        if (!section || !gradeLevelId) {
          throw new Error(`CLASS_SECTION_CONVERSION_FAILED:${first.id}`);
        }
        const weeklySessions = grouped.reduce(
          (total, item) =>
            total + item.weeklyOccurrences * item.durationPeriods,
          0,
        );
        const isMainSubject = defaultMainSubject(
          gradeCode(section.grade),
          first.subject.shortCode,
        );
        const allowDoubleSession =
          isMainSubject &&
          (first.subject.consecutivePeriodsAllowed ||
            grouped.some((item) => item.durationPeriods > 1));
        const gradeCurriculum = await transaction.gradeCurriculum.upsert({
          where: {
            schoolId_termId_gradeLevelId_subjectId: {
              schoolId: term.schoolId,
              termId: term.id,
              gradeLevelId,
              subjectId: first.subjectId,
            },
          },
          update: {
            weeklySessions,
            isMainSubject,
            allowDoubleSession,
            isActive: true,
          },
          create: {
            schoolId: term.schoolId,
            termId: term.id,
            gradeLevelId,
            subjectId: first.subjectId,
            weeklySessions,
            isMainSubject,
            allowDoubleSession,
          },
        });
        await transaction.classCurriculum.upsert({
          where: {
            schoolId_termId_classSectionId_subjectId: {
              schoolId: term.schoolId,
              termId: term.id,
              classSectionId: first.classSectionId,
              subjectId: first.subjectId,
            },
          },
          update: {
            gradeCurriculumId: gradeCurriculum.id,
            teacherId: first.teacherId,
            weeklySessions,
            isMainSubject,
            allowDoubleSession,
            isActive: true,
          },
          create: {
            schoolId: term.schoolId,
            termId: term.id,
            classSectionId: first.classSectionId,
            gradeCurriculumId: gradeCurriculum.id,
            subjectId: first.subjectId,
            teacherId: first.teacherId,
            weeklySessions,
            isMainSubject,
            allowDoubleSession,
          },
        });
      }

      const teacherWorkloads = new Map<string, number>();
      for (const requirement of term.requirements) {
        teacherWorkloads.set(
          requirement.teacherId,
          (teacherWorkloads.get(requirement.teacherId) ?? 0) +
            requirement.weeklyOccurrences * requirement.durationPeriods,
        );
      }
      for (const [teacherId, weeklyTeachingSessions] of teacherWorkloads) {
        await transaction.teacher.update({
          where: { id: teacherId },
          data: { weeklyTeachingSessions },
        });
      }
    });
    console.log(`Converted term ${term.name} (${term.id}).`);
  }

  const [weekConfigurations, gradeLevels, classCurricula, teachers] =
    await Promise.all([
      db.schoolWeekConfiguration.count(),
      db.gradeLevel.count(),
      db.classCurriculum.count({ where: { isActive: true } }),
      db.teacher.findMany({
        where: { isActive: true, deletedAt: null },
        select: {
          id: true,
          shortCode: true,
          weeklyTeachingSessions: true,
          classCurricula: {
            where: { isActive: true },
            select: { weeklySessions: true },
          },
        },
      }),
    ]);
  for (const teacher of teachers) {
    const allocated = teacher.classCurricula.reduce(
      (total, curriculum) => total + curriculum.weeklySessions,
      0,
    );
    if (allocated !== teacher.weeklyTeachingSessions) {
      throw new Error(
        `TEACHER_WORKLOAD_MISMATCH:${teacher.shortCode}:${String(teacher.weeklyTeachingSessions)}:${String(allocated)}`,
      );
    }
  }
  console.log(
    `Verified ${String(weekConfigurations)} week configuration(s), ${String(gradeLevels)} grade level(s), ${String(classCurricula)} class curriculum row(s), and ${String(teachers.length)} teacher workload(s).`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await getDatabase().$disconnect();
  });

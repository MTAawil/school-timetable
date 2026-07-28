"use server";

import { getDatabase } from "@school-timetable/database";
import {
  curriculumCapacityIssue,
  starterSubjects,
} from "@school-timetable/shared/curriculum";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { verifySession } from "@/lib/auth/dal";
import { getActiveTerm } from "@/lib/setup";

const subjectNameSchema = z.string().trim().min(1).max(100);
const subjectCodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(24)
  .toUpperCase()
  .regex(/^[A-Z0-9_]+$/);

export async function installStarterSubjects(): Promise<void> {
  const user = await verifySession();
  const db = getDatabase();

  await db.$transaction(
    starterSubjects.map(([shortCode, name]) =>
      db.subject.upsert({
        where: {
          schoolId_shortCode: { schoolId: user.schoolId, shortCode },
        },
        update: { isActive: true, deletedAt: null },
        create: {
          schoolId: user.schoolId,
          shortCode,
          name,
          preferredTimeBand: "NEUTRAL",
        },
      }),
    ),
  );

  revalidatePath("/subjects");
  redirect("/subjects?saved=starter");
}

export async function addCustomSubject(formData: FormData): Promise<void> {
  const user = await verifySession();
  await getDatabase().subject.create({
    data: {
      schoolId: user.schoolId,
      name: subjectNameSchema.parse(formData.get("name")),
      shortCode: subjectCodeSchema.parse(formData.get("shortCode")),
      preferredTimeBand: "NEUTRAL",
    },
  });

  revalidatePath("/subjects");
  redirect("/subjects?saved=subject");
}

export async function saveSubjectCatalogue(formData: FormData): Promise<void> {
  const user = await verifySession();
  const term = await getActiveTerm(user.schoolId);
  const subjectIds = z.array(z.uuid()).parse(formData.getAll("subjectId"));
  const db = getDatabase();

  await db.$transaction(async (transaction) => {
    for (const subjectId of subjectIds) {
      const isActive = formData.get(`active:${subjectId}`) === "on";
      const result = await transaction.subject.updateMany({
        where: {
          id: subjectId,
          schoolId: user.schoolId,
          deletedAt: null,
        },
        data: {
          name: subjectNameSchema.parse(formData.get(`name:${subjectId}`)),
          shortCode: subjectCodeSchema.parse(
            formData.get(`shortCode:${subjectId}`),
          ),
          isActive,
        },
      });
      if (result.count !== 1) {
        throw new Error("SUBJECT_NOT_FOUND");
      }
      if (!isActive) {
        await transaction.gradeCurriculum.updateMany({
          where: {
            schoolId: user.schoolId,
            termId: term.id,
            subjectId,
          },
          data: { isActive: false },
        });
        await transaction.classCurriculum.updateMany({
          where: {
            schoolId: user.schoolId,
            termId: term.id,
            subjectId,
          },
          data: { isActive: false },
        });
      }
    }
  });

  revalidatePath("/subjects");
  redirect("/subjects?saved=catalogue");
}

export async function saveCurriculumMatrix(formData: FormData): Promise<void> {
  const user = await verifySession();
  const term = await getActiveTerm(user.schoolId);
  const db = getDatabase();
  const [configuration, grades, subjects] = await Promise.all([
    db.schoolWeekConfiguration.findFirst({
      where: { schoolId: user.schoolId, termId: term.id },
    }),
    db.gradeLevel.findMany({
      where: { schoolId: user.schoolId, isActive: true, deletedAt: null },
      include: {
        classSections: {
          where: { termId: term.id, isActive: true, deletedAt: null },
        },
      },
    }),
    db.subject.findMany({
      where: { schoolId: user.schoolId, isActive: true, deletedAt: null },
    }),
  ]);
  if (!configuration) {
    throw new Error("SCHOOL_WEEK_INCOMPLETE");
  }

  const requested = grades.flatMap((grade) =>
    subjects.map((subject) => {
      const key = `${grade.id}:${subject.id}`;
      const weeklySessions = z
        .number()
        .int()
        .min(0)
        .max(configuration.sessionsPerDay * configuration.workingDayCount)
        .parse(Number(formData.get(`sessions:${key}`)));
      const isMainSubject = formData.get(`main:${key}`) === "on";
      const allowDoubleSession =
        isMainSubject && formData.get(`double:${key}`) === "on";
      const issue = curriculumCapacityIssue(
        { weeklySessions, isMainSubject, allowDoubleSession },
        configuration.workingDayCount,
      );
      if (issue) {
        throw new Error(`${issue}:${grade.code}:${subject.shortCode}`);
      }
      return {
        grade,
        subject,
        weeklySessions,
        isMainSubject,
        allowDoubleSession,
      };
    }),
  );

  for (const grade of grades) {
    const gradeTotal = requested
      .filter((item) => item.grade.id === grade.id)
      .reduce((total, item) => total + item.weeklySessions, 0);
    const capacity =
      configuration.workingDayCount * configuration.sessionsPerDay;
    if (gradeTotal > capacity) {
      throw new Error(
        `CURRICULUM_EXCEEDS_CLASS_CAPACITY:${grade.code}:${String(gradeTotal)}:${String(capacity)}`,
      );
    }
  }

  await db.$transaction(async (transaction) => {
    for (const item of requested) {
      const where = {
        schoolId_termId_gradeLevelId_subjectId: {
          schoolId: user.schoolId,
          termId: term.id,
          gradeLevelId: item.grade.id,
          subjectId: item.subject.id,
        },
      };
      const existing = await transaction.gradeCurriculum.findUnique({ where });

      if (item.weeklySessions === 0) {
        if (!existing) {
          continue;
        }
        await transaction.classCurriculum.deleteMany({
          where: { gradeCurriculumId: existing.id, teacherId: null },
        });
        await transaction.classCurriculum.updateMany({
          where: { gradeCurriculumId: existing.id, teacherId: { not: null } },
          data: { isActive: false },
        });
        await transaction.gradeCurriculum.update({
          where: { id: existing.id },
          data: { isActive: false },
        });
        continue;
      }

      const gradeCurriculum = await transaction.gradeCurriculum.upsert({
        where,
        update: {
          weeklySessions: item.weeklySessions,
          isMainSubject: item.isMainSubject,
          allowDoubleSession: item.allowDoubleSession,
          isActive: true,
        },
        create: {
          schoolId: user.schoolId,
          termId: term.id,
          gradeLevelId: item.grade.id,
          subjectId: item.subject.id,
          weeklySessions: item.weeklySessions,
          isMainSubject: item.isMainSubject,
          allowDoubleSession: item.allowDoubleSession,
        },
      });

      for (const classSection of item.grade.classSections) {
        await transaction.classCurriculum.upsert({
          where: {
            schoolId_termId_classSectionId_subjectId: {
              schoolId: user.schoolId,
              termId: term.id,
              classSectionId: classSection.id,
              subjectId: item.subject.id,
            },
          },
          update: {
            gradeCurriculumId: gradeCurriculum.id,
            weeklySessions: item.weeklySessions,
            isMainSubject: item.isMainSubject,
            allowDoubleSession: item.allowDoubleSession,
            isActive: true,
          },
          create: {
            schoolId: user.schoolId,
            termId: term.id,
            classSectionId: classSection.id,
            gradeCurriculumId: gradeCurriculum.id,
            subjectId: item.subject.id,
            weeklySessions: item.weeklySessions,
            isMainSubject: item.isMainSubject,
            allowDoubleSession: item.allowDoubleSession,
          },
        });
      }
    }
  });

  revalidatePath("/subjects");
  revalidatePath("/setup");
  redirect("/subjects?saved=curriculum");
}

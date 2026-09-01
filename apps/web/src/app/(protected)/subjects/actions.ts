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
  const [configuration, classSections, subjects] = await Promise.all([
    db.schoolWeekConfiguration.findFirst({
      where: { schoolId: user.schoolId, termId: term.id },
    }),
    db.classSection.findMany({
      where: {
        schoolId: user.schoolId,
        termId: term.id,
        isActive: true,
        deletedAt: null,
        gradeLevelId: { not: null },
      },
      include: { gradeLevel: true },
    }),
    db.subject.findMany({
      where: { schoolId: user.schoolId, isActive: true, deletedAt: null },
    }),
  ]);
  if (!configuration) {
    throw new Error("SCHOOL_WEEK_INCOMPLETE");
  }

  const requested = classSections.flatMap((classSection) =>
    subjects.map((subject) => {
      if (!classSection.gradeLevelId || !classSection.gradeLevel) {
        throw new Error("CLASS_SECTION_GRADE_INCOMPLETE");
      }
      const key = `${classSection.id}:${subject.id}`;
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
        throw new Error(
          `${issue}:${classSection.shortCode}:${subject.shortCode}`,
        );
      }
      return {
        classSection,
        subject,
        weeklySessions,
        isMainSubject,
        allowDoubleSession,
      };
    }),
  );

  for (const classSection of classSections) {
    const classTotal = requested
      .filter((item) => item.classSection.id === classSection.id)
      .reduce((total, item) => total + item.weeklySessions, 0);
    const capacity =
      configuration.workingDayCount * configuration.sessionsPerDay;
    if (classTotal > capacity) {
      throw new Error(
        `CURRICULUM_EXCEEDS_CLASS_CAPACITY:${classSection.shortCode}:${String(classTotal)}:${String(capacity)}`,
      );
    }
  }

  await db.$transaction(async (transaction) => {
    const templates = new Map<
      string,
      {
        gradeLevelId: string;
        subjectId: string;
        weeklySessions: number;
        isMainSubject: boolean;
        allowDoubleSession: boolean;
      }
    >();
    for (const item of requested) {
      if (item.weeklySessions === 0) continue;
      const key = `${item.classSection.gradeLevelId}:${item.subject.id}`;
      const existing = templates.get(key);
      templates.set(key, {
        gradeLevelId: item.classSection.gradeLevelId!,
        subjectId: item.subject.id,
        weeklySessions: Math.max(
          existing?.weeklySessions ?? 0,
          item.weeklySessions,
        ),
        isMainSubject: Boolean(existing?.isMainSubject) || item.isMainSubject,
        allowDoubleSession:
          Boolean(existing?.allowDoubleSession) || item.allowDoubleSession,
      });
    }

    const templateIds = new Map<string, string>();
    for (const [key, template] of templates) {
      const where = {
        schoolId_termId_gradeLevelId_subjectId: {
          schoolId: user.schoolId,
          termId: term.id,
          gradeLevelId: template.gradeLevelId,
          subjectId: template.subjectId,
        },
      };
      const gradeCurriculum = await transaction.gradeCurriculum.upsert({
        where,
        update: {
          weeklySessions: template.weeklySessions,
          isMainSubject: template.isMainSubject,
          allowDoubleSession: template.allowDoubleSession,
          isActive: true,
        },
        create: {
          schoolId: user.schoolId,
          termId: term.id,
          gradeLevelId: template.gradeLevelId,
          subjectId: template.subjectId,
          weeklySessions: template.weeklySessions,
          isMainSubject: template.isMainSubject,
          allowDoubleSession: template.allowDoubleSession,
        },
      });
      templateIds.set(key, gradeCurriculum.id);
    }

    for (const item of requested) {
      const where = {
        schoolId_termId_classSectionId_subjectId: {
          schoolId: user.schoolId,
          termId: term.id,
          classSectionId: item.classSection.id,
          subjectId: item.subject.id,
        },
      };
      const existing = await transaction.classCurriculum.findUnique({ where });

      if (item.weeklySessions === 0) {
        if (!existing) continue;
        if (existing.teacherId) {
          await transaction.classCurriculum.update({
            where: { id: existing.id },
            data: { isActive: false },
          });
        } else {
          await transaction.classCurriculum.delete({
            where: { id: existing.id },
          });
        }
        continue;
      }

      const gradeCurriculumId = templateIds.get(
        `${item.classSection.gradeLevelId}:${item.subject.id}`,
      );
      if (!gradeCurriculumId) {
        throw new Error("GRADE_CURRICULUM_TEMPLATE_MISSING");
      }

      await transaction.classCurriculum.upsert({
        where,
        update: {
          gradeCurriculumId,
          weeklySessions: item.weeklySessions,
          isMainSubject: item.isMainSubject,
          allowDoubleSession: item.allowDoubleSession,
          isActive: true,
        },
        create: {
          schoolId: user.schoolId,
          termId: term.id,
          classSectionId: item.classSection.id,
          gradeCurriculumId,
          subjectId: item.subject.id,
          weeklySessions: item.weeklySessions,
          isMainSubject: item.isMainSubject,
          allowDoubleSession: item.allowDoubleSession,
        },
      });
    }

    const submittedGradeSubjectKeys = new Set(
      requested.map(
        (item) => `${item.classSection.gradeLevelId}:${item.subject.id}`,
      ),
    );
    for (const key of submittedGradeSubjectKeys) {
      if (templateIds.has(key)) continue;
      const [gradeLevelId, subjectId] = key.split(":");
      if (!gradeLevelId || !subjectId) continue;
      await transaction.gradeCurriculum.updateMany({
        where: {
          schoolId: user.schoolId,
          termId: term.id,
          gradeLevelId,
          subjectId,
        },
        data: { isActive: false },
      });
    }
  });

  revalidatePath("/subjects");
  revalidatePath("/setup");
  redirect("/subjects?saved=curriculum");
}

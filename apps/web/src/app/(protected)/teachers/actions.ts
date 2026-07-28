"use server";

import { getDatabase } from "@school-timetable/database";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { verifySession } from "@/lib/auth/dal";
import { getActiveTerm, optionalInteger, optionalText } from "@/lib/setup";

const teacherSchema = z.object({
  name: z.string().trim().min(2).max(100),
  shortCode: z
    .string()
    .trim()
    .min(1)
    .max(12)
    .toUpperCase()
    .regex(/^[A-Z0-9_]+$/),
  employmentType: z.enum(["FULL_TIME", "PART_TIME"]),
  weeklyTeachingSessions: z.number().int().positive().max(100),
  maxLessonsPerDay: z.number().int().positive().max(20).nullable(),
  maxConsecutiveLessons: z.number().int().positive().max(20).nullable(),
});

export async function saveTeacherProfile(formData: FormData): Promise<void> {
  const user = await verifySession();
  const input = teacherSchema.parse({
    name: formData.get("name"),
    shortCode: formData.get("shortCode"),
    employmentType: formData.get("employmentType"),
    weeklyTeachingSessions: Number(formData.get("weeklyTeachingSessions")),
    maxLessonsPerDay: optionalInteger(formData.get("maxLessonsPerDay")),
    maxConsecutiveLessons: optionalInteger(
      formData.get("maxConsecutiveLessons"),
    ),
  });
  const id = optionalText(formData.get("id"));
  const db = getDatabase();

  if (id) {
    const result = await db.teacher.updateMany({
      where: {
        id: z.uuid().parse(id),
        schoolId: user.schoolId,
        deletedAt: null,
      },
      data: input,
    });
    if (result.count !== 1) {
      throw new Error("TEACHER_NOT_FOUND");
    }
  } else {
    await db.teacher.create({
      data: { schoolId: user.schoolId, ...input },
    });
  }

  revalidatePath("/teachers");
  redirect("/teachers?saved=teacher");
}

export async function saveTeachingAllocations(
  formData: FormData,
): Promise<void> {
  const user = await verifySession();
  const term = await getActiveTerm(user.schoolId);
  const submittedIds = z
    .array(z.uuid())
    .parse(formData.getAll("classCurriculumId"));
  const db = getDatabase();
  const [curriculum, teachers] = await Promise.all([
    db.classCurriculum.findMany({
      where: {
        schoolId: user.schoolId,
        termId: term.id,
        isActive: true,
        classSection: { isActive: true, deletedAt: null },
      },
      select: { id: true },
    }),
    db.teacher.findMany({
      where: { schoolId: user.schoolId, isActive: true, deletedAt: null },
      select: { id: true },
    }),
  ]);
  const expectedIds = curriculum.map((item) => item.id).sort();
  const actualIds = [...submittedIds].sort();
  if (
    expectedIds.length !== actualIds.length ||
    expectedIds.some((id, index) => id !== actualIds[index])
  ) {
    throw new Error("ALLOCATION_FORM_STALE");
  }
  const validTeacherIds = new Set(teachers.map((teacher) => teacher.id));
  const allocations = submittedIds.map((classCurriculumId) => {
    const teacherId = optionalText(
      formData.get(`teacher:${classCurriculumId}`),
    );
    if (teacherId && !validTeacherIds.has(teacherId)) {
      throw new Error("TEACHER_NOT_FOUND");
    }
    return { classCurriculumId, teacherId };
  });

  await db.$transaction(async (transaction) => {
    for (const allocation of allocations) {
      const result = await transaction.classCurriculum.updateMany({
        where: {
          id: allocation.classCurriculumId,
          schoolId: user.schoolId,
          termId: term.id,
          isActive: true,
        },
        data: { teacherId: allocation.teacherId },
      });
      if (result.count !== 1) {
        throw new Error("ALLOCATION_FORM_STALE");
      }
    }
  });

  revalidatePath("/teachers");
  revalidatePath("/subjects");
  redirect("/teachers?saved=allocations");
}

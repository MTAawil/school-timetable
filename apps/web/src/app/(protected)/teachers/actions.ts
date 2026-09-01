"use server";

import { getDatabase } from "@school-timetable/database";
import type { TeacherRestrictionState } from "@school-timetable/shared/teacher-restrictions";
import { validateTeacherWorkflowAllocation } from "@school-timetable/shared/teacher-allocation";
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

const restrictionStateSchema = z.enum([
  "AVAILABLE",
  "PREFERRED",
  "DISLIKED",
  "UNAVAILABLE",
]);

export async function saveTeacherWorkflow(formData: FormData): Promise<void> {
  const user = await verifySession();
  const term = await getActiveTerm(user.schoolId);
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
  const requestedTeacherId = optionalText(formData.get("id"));
  const teacherId = requestedTeacherId
    ? z.uuid().parse(requestedTeacherId)
    : null;
  const selectedCurriculumIds = z
    .array(z.uuid())
    .parse(formData.getAll("classCurriculumId"));
  const confirmedReassignmentIds = z
    .array(z.uuid())
    .parse(formData.getAll("reassignCurriculumId"));
  const sharedCurriculumIds = z
    .array(z.uuid())
    .parse(formData.getAll("sharedCurriculumId"));
  const submittedSlots = z
    .array(z.string().regex(/^\d+:\d+$/))
    .parse(formData.getAll("restrictionSlot"));
  const db = getDatabase();
  const [configuration, days, periods, curriculum, existingTeacher] =
    await Promise.all([
      db.schoolWeekConfiguration.findFirst({
        where: { schoolId: user.schoolId, termId: term.id },
      }),
      db.dayDefinition.findMany({
        where: { schoolId: user.schoolId, termId: term.id, isWorking: true },
        select: { dayIndex: true },
      }),
      db.periodDefinition.findMany({
        where: {
          schoolId: user.schoolId,
          termId: term.id,
          isTeaching: true,
        },
        select: { periodIndex: true },
      }),
      db.classCurriculum.findMany({
        where: {
          schoolId: user.schoolId,
          termId: term.id,
          isActive: true,
          classSection: { isActive: true, deletedAt: null },
        },
        select: {
          id: true,
          subjectId: true,
          teacherId: true,
          weeklySessions: true,
          sharedTeachingGroupId: true,
        },
      }),
      teacherId
        ? db.teacher.findFirst({
            where: {
              id: teacherId,
              schoolId: user.schoolId,
              isActive: true,
              deletedAt: null,
            },
          })
        : null,
    ]);

  if (!configuration) {
    throw new Error("SCHOOL_WEEK_INCOMPLETE");
  }
  if (teacherId && !existingTeacher) {
    throw new Error("TEACHER_NOT_FOUND");
  }
  const limitSchema = z
    .number()
    .int()
    .positive()
    .max(configuration.sessionsPerDay)
    .nullable();
  limitSchema.parse(input.maxLessonsPerDay);
  limitSchema.parse(input.maxConsecutiveLessons);

  const allocationValidation = validateTeacherWorkflowAllocation(
    teacherId,
    input.weeklyTeachingSessions,
    selectedCurriculumIds,
    curriculum.map((item) => ({
      classCurriculumId: item.id,
      teacherId: item.teacherId,
      weeklySessions: item.weeklySessions,
    })),
    confirmedReassignmentIds,
    sharedCurriculumIds,
  );
  if (
    !allocationValidation.valid &&
    allocationValidation.code === "CLASS_SUBJECT_ALREADY_ASSIGNED"
  ) {
    redirect("/teachers?error=CLASS_SUBJECT_ALREADY_ASSIGNED");
  }
  if (
    !allocationValidation.valid &&
    allocationValidation.code === "TEACHER_WORKLOAD_MISMATCH"
  ) {
    redirect(
      `/teachers?error=TEACHER_WORKLOAD_MISMATCH&declared=${String(input.weeklyTeachingSessions)}&allocated=${String(allocationValidation.allocatedWeeklySessions)}`,
    );
  }
  if (!allocationValidation.valid) {
    throw new Error(allocationValidation.code);
  }
  const curriculumById = new Map(curriculum.map((item) => [item.id, item]));
  if (sharedCurriculumIds.some((id) => !selectedCurriculumIds.includes(id))) {
    throw new Error("SHARED_CLASS_NOT_SELECTED");
  }
  const sharedItems = sharedCurriculumIds.map((id) => {
    const item = curriculumById.get(id);
    if (!item || item.teacherId || item.sharedTeachingGroupId) {
      throw new Error("SHARED_CLASS_NOT_ELIGIBLE");
    }
    return item;
  });
  if (sharedItems.length > 0) {
    const anchor = selectedCurriculumIds
      .map((id) => curriculumById.get(id))
      .find(
        (item) =>
          item?.subjectId === sharedItems[0]?.subjectId &&
          item?.weeklySessions === sharedItems[0]?.weeklySessions &&
          item !== undefined &&
          !sharedCurriculumIds.includes(item.id),
      );
    if (!anchor || sharedItems.some((item) => item.subjectId !== anchor.subjectId)) {
      throw new Error("SHARED_CLASS_REQUIRES_MATCHING_ANCHOR");
    }
  }
  const expectedSlots = days
    .flatMap((day) =>
      periods.map(
        (period) => `${String(day.dayIndex)}:${String(period.periodIndex)}`,
      ),
    )
    .sort();
  const actualSlots = [...submittedSlots].sort();
  if (
    expectedSlots.length !== actualSlots.length ||
    expectedSlots.some((slot, index) => slot !== actualSlots[index])
  ) {
    throw new Error("RESTRICTION_FORM_STALE");
  }
  const restrictions = submittedSlots.flatMap((slot) => {
    const [dayIndex, periodIndex] = slot.split(":").map(Number);
    if (dayIndex === undefined || periodIndex === undefined) {
      throw new Error("RESTRICTION_SLOT_INVALID");
    }
    const state = restrictionStateSchema.parse(formData.get(`state:${slot}`));
    return state === "AVAILABLE"
      ? []
      : [
          {
            schoolId: user.schoolId,
            termId: term.id,
            entityType: "TEACHER" as const,
            dayIndex,
            periodIndex,
            state: state as Exclude<TeacherRestrictionState, "AVAILABLE">,
          },
        ];
  });

  let savedTeacherId: string;
  try {
    savedTeacherId = await db.$transaction(async (transaction) => {
      const teacher = teacherId
        ? await transaction.teacher.update({
            where: { id_schoolId: { id: teacherId, schoolId: user.schoolId } },
            data: input,
          })
        : await transaction.teacher.create({
            data: { schoolId: user.schoolId, ...input },
          });

      if (teacherId) {
        await transaction.classCurriculum.updateMany({
          where: {
            schoolId: user.schoolId,
            termId: term.id,
            teacherId,
            id: { notIn: selectedCurriculumIds },
          },
          data: { teacherId: null, sharedTeachingGroupId: null },
        });
      }
      if (selectedCurriculumIds.length > 0) {
        const allocationResult = await transaction.classCurriculum.updateMany({
          where: {
            schoolId: user.schoolId,
            termId: term.id,
            id: { in: selectedCurriculumIds },
          },
          data: { teacherId: teacher.id },
        });
        if (allocationResult.count !== selectedCurriculumIds.length) {
          throw new Error("CLASS_SUBJECT_ALREADY_ASSIGNED");
        }
      }
      if (sharedItems.length > 0) {
        const anchor = selectedCurriculumIds
          .map((id) => curriculumById.get(id))
          .find(
            (item) =>
              item?.subjectId === sharedItems[0]?.subjectId &&
              item?.weeklySessions === sharedItems[0]?.weeklySessions &&
              item !== undefined &&
              !sharedCurriculumIds.includes(item.id),
          );
        if (!anchor) throw new Error("SHARED_CLASS_REQUIRES_MATCHING_ANCHOR");
        const group = anchor.sharedTeachingGroupId
          ? await transaction.sharedTeachingGroup.update({
              where: { id: anchor.sharedTeachingGroupId },
              data: { weeklySessions: anchor.weeklySessions },
            })
          : await transaction.sharedTeachingGroup.create({
              data: {
                schoolId: user.schoolId,
                termId: term.id,
                subjectId: anchor.subjectId,
                teacherId: teacher.id,
                weeklySessions: anchor.weeklySessions,
              },
            });
        await transaction.classCurriculum.updateMany({
          where: {
            id: { in: [anchor.id, ...sharedCurriculumIds] },
            schoolId: user.schoolId,
            termId: term.id,
          },
          data: { sharedTeachingGroupId: group.id },
        });
      }
      const sharedGroups = await transaction.sharedTeachingGroup.findMany({
        where: { schoolId: user.schoolId, termId: term.id },
        include: { _count: { select: { members: true } } },
      });
      await transaction.sharedTeachingGroup.deleteMany({
        where: {
          id: { in: sharedGroups.filter((group) => group._count.members < 2).map((group) => group.id) },
        },
      });

      await transaction.availabilityRule.deleteMany({
        where: {
          schoolId: user.schoolId,
          termId: term.id,
          entityType: "TEACHER",
          entityId: teacher.id,
        },
      });
      if (restrictions.length > 0) {
        await transaction.availabilityRule.createMany({
          data: restrictions.map((restriction) => ({
            ...restriction,
            entityId: teacher.id,
          })),
        });
      }
      return teacher.id;
    });
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      error.message === "CLASS_SUBJECT_ALREADY_ASSIGNED"
    ) {
      redirect("/teachers?error=CLASS_SUBJECT_ALREADY_ASSIGNED");
    }
    throw error;
  }

  revalidatePath("/teachers");
  revalidatePath("/availability");
  revalidatePath("/subjects");
  revalidatePath("/readiness");
  redirect(`/teachers?teacher=${savedTeacherId}&saved=teacher`);
}

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

"use server";

import { getDatabase } from "@school-timetable/database";
import type { TeacherRestrictionState } from "@school-timetable/shared/teacher-restrictions";
import { validateTeacherWorkflowAllocation } from "@school-timetable/shared/teacher-allocation";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { verifySession } from "@/lib/auth/dal";
import { getActiveTerm, optionalInteger, optionalText } from "@/lib/setup";
import { createTeacherCode } from "@/lib/teacher-code";

const teacherSchema = z.object({
  name: z.string().trim().min(2).max(100),
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
  const declaredSubjectIds = z
    .array(z.uuid())
    .min(1)
    .parse(formData.getAll("subjectId"));
  const confirmedReassignmentIds = z
    .array(z.uuid())
    .parse(formData.getAll("reassignCurriculumId"));
  const submittedSlots = z
    .array(z.string().regex(/^\d+:\d+$/))
    .parse(formData.getAll("restrictionSlot"));
  const db = getDatabase();
  const [
    configuration,
    days,
    periods,
    curriculum,
    availableSubjects,
    existingTeacher,
    existingTeacherCodes,
  ] = await Promise.all([
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
      },
    }),
    db.subject.findMany({
      where: {
        schoolId: user.schoolId,
        isActive: true,
        deletedAt: null,
        id: { in: declaredSubjectIds },
      },
      select: { id: true },
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
    db.teacher.findMany({
      where: { schoolId: user.schoolId },
      select: { shortCode: true },
    }),
  ]);

  if (!configuration) {
    throw new Error("SCHOOL_WEEK_INCOMPLETE");
  }
  if (teacherId && !existingTeacher) {
    throw new Error("TEACHER_NOT_FOUND");
  }
  if (availableSubjects.length !== new Set(declaredSubjectIds).size) {
    throw new Error("TEACHER_SUBJECT_INVALID");
  }
  const limitSchema = z
    .number()
    .int()
    .positive()
    .max(configuration.sessionsPerDay)
    .nullable();
  limitSchema.parse(input.maxLessonsPerDay);
  limitSchema.parse(input.maxConsecutiveLessons);
  const declaredSubjectIdSet = new Set(declaredSubjectIds);
  const selectedCurriculum = curriculum.filter((item) =>
    selectedCurriculumIds.includes(item.id),
  );
  if (
    selectedCurriculum.some((item) => !declaredSubjectIdSet.has(item.subjectId))
  ) {
    throw new Error("TEACHER_CURRICULUM_SUBJECT_NOT_DECLARED");
  }

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
            data: {
              schoolId: user.schoolId,
              ...input,
              shortCode: createTeacherCode(
                input.name,
                existingTeacherCodes.map((item) => item.shortCode),
              ),
            },
          });

      await transaction.teacherSubject.deleteMany({
        where: { schoolId: user.schoolId, teacherId: teacher.id },
      });
      await transaction.teacherSubject.createMany({
        data: declaredSubjectIds.map((subjectId) => ({
          schoolId: user.schoolId,
          teacherId: teacher.id,
          subjectId,
        })),
      });

      if (teacherId) {
        await transaction.classCurriculum.updateMany({
          where: {
            schoolId: user.schoolId,
            termId: term.id,
            teacherId,
            id: { notIn: selectedCurriculumIds },
          },
          data: { teacherId: null },
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
    const existingCodes = await db.teacher.findMany({
      where: { schoolId: user.schoolId },
      select: { shortCode: true },
    });
    await db.teacher.create({
      data: {
        schoolId: user.schoolId,
        ...input,
        shortCode: createTeacherCode(
          input.name,
          existingCodes.map((teacher) => teacher.shortCode),
        ),
      },
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

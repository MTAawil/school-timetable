"use server";

import { getDatabase } from "@school-timetable/database";
import type { TeacherRestrictionState } from "@school-timetable/shared/teacher-restrictions";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { verifySession } from "@/lib/auth/dal";
import { getActiveTerm, optionalInteger } from "@/lib/setup";

const restrictionStateSchema = z.enum([
  "AVAILABLE",
  "PREFERRED",
  "DISLIKED",
  "UNAVAILABLE",
]);

export async function saveTeacherRestrictions(
  formData: FormData,
): Promise<void> {
  const user = await verifySession();
  const term = await getActiveTerm(user.schoolId);
  const teacherId = z.uuid().parse(formData.get("teacherId"));
  const db = getDatabase();
  const [teacher, configuration, days, periods] = await Promise.all([
    db.teacher.findFirst({
      where: {
        id: teacherId,
        schoolId: user.schoolId,
        isActive: true,
        deletedAt: null,
      },
    }),
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
  ]);
  if (!teacher) {
    throw new Error("TEACHER_NOT_FOUND");
  }
  if (!configuration) {
    throw new Error("SCHOOL_WEEK_INCOMPLETE");
  }

  const maxLessonsPerDay = optionalInteger(formData.get("maxLessonsPerDay"));
  const maxConsecutiveLessons = optionalInteger(
    formData.get("maxConsecutiveLessons"),
  );
  const limitSchema = z
    .number()
    .int()
    .positive()
    .max(configuration.sessionsPerDay)
    .nullable();
  limitSchema.parse(maxLessonsPerDay);
  limitSchema.parse(maxConsecutiveLessons);

  const submittedSlots = z
    .array(z.string().regex(/^\d+:\d+$/))
    .parse(formData.getAll("restrictionSlot"));
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
    if (state === "AVAILABLE") {
      return [];
    }
    return [
      {
        schoolId: user.schoolId,
        termId: term.id,
        entityType: "TEACHER" as const,
        entityId: teacherId,
        dayIndex,
        periodIndex,
        state: state as Exclude<TeacherRestrictionState, "AVAILABLE">,
      },
    ];
  });

  await db.$transaction(async (transaction) => {
    const result = await transaction.teacher.updateMany({
      where: {
        id: teacherId,
        schoolId: user.schoolId,
        isActive: true,
        deletedAt: null,
      },
      data: { maxLessonsPerDay, maxConsecutiveLessons },
    });
    if (result.count !== 1) {
      throw new Error("TEACHER_NOT_FOUND");
    }
    await transaction.availabilityRule.deleteMany({
      where: {
        schoolId: user.schoolId,
        termId: term.id,
        entityType: "TEACHER",
        entityId: teacherId,
      },
    });
    if (restrictions.length > 0) {
      await transaction.availabilityRule.createMany({ data: restrictions });
    }
  });

  revalidatePath("/availability");
  revalidatePath("/teachers");
  redirect(`/availability?teacher=${teacherId}&saved=1`);
}

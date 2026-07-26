"use server";

import { getDatabase } from "@school-timetable/database";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { verifySession } from "@/lib/auth/dal";
import { getActiveTerm, optionalInteger, optionalText } from "@/lib/setup";

const idSchema = z.uuid();

const teacherSchema = z.object({
  name: z.string().trim().min(2).max(100),
  shortCode: z.string().trim().min(1).max(12).toUpperCase(),
  employmentType: z.enum(["FULL_TIME", "PART_TIME"]),
  maxLessonsPerDay: z.number().int().positive().nullable(),
  maxConsecutiveLessons: z.number().int().positive().nullable(),
});

export async function saveTeacher(formData: FormData): Promise<void> {
  const user = await verifySession();
  const input = teacherSchema.parse({
    name: formData.get("name"),
    shortCode: formData.get("shortCode"),
    employmentType: formData.get("employmentType"),
    maxLessonsPerDay: optionalInteger(formData.get("maxLessonsPerDay")),
    maxConsecutiveLessons: optionalInteger(
      formData.get("maxConsecutiveLessons"),
    ),
  });
  const id = optionalText(formData.get("id"));
  const db = getDatabase();
  if (id) {
    await db.teacher.updateMany({
      where: {
        id: idSchema.parse(id),
        schoolId: user.schoolId,
        deletedAt: null,
      },
      data: input,
    });
  } else {
    await db.teacher.create({ data: { schoolId: user.schoolId, ...input } });
  }
  revalidatePath("/teachers");
}

const subjectSchema = z.object({
  name: z.string().trim().min(2).max(100),
  shortCode: z.string().trim().min(1).max(12).toUpperCase(),
  category: z.string().trim().max(60).nullable(),
  preferredTimeBand: z.enum(["EARLY", "NEUTRAL", "LATE"]),
  defaultRoomType: z
    .enum(["STANDARD", "LAB", "COMPUTER_LAB", "GYM", "OTHER"])
    .nullable(),
  consecutivePeriodsAllowed: z.boolean(),
});

export async function saveSubject(formData: FormData): Promise<void> {
  const user = await verifySession();
  const input = subjectSchema.parse({
    name: formData.get("name"),
    shortCode: formData.get("shortCode"),
    category: optionalText(formData.get("category")),
    preferredTimeBand: formData.get("preferredTimeBand"),
    defaultRoomType: optionalText(formData.get("defaultRoomType")),
    consecutivePeriodsAllowed:
      formData.get("consecutivePeriodsAllowed") === "on",
  });
  await getDatabase().subject.create({
    data: { schoolId: user.schoolId, ...input },
  });
  revalidatePath("/subjects");
}

const roomSchema = z.object({
  name: z.string().trim().min(2).max(100),
  shortCode: z.string().trim().min(1).max(12).toUpperCase(),
  type: z.enum(["STANDARD", "LAB", "COMPUTER_LAB", "GYM", "OTHER"]),
  capacity: z.number().int().positive().nullable(),
});

export async function saveRoom(formData: FormData): Promise<void> {
  const user = await verifySession();
  const input = roomSchema.parse({
    name: formData.get("name"),
    shortCode: formData.get("shortCode"),
    type: formData.get("type"),
    capacity: optionalInteger(formData.get("capacity")),
  });
  await getDatabase().room.create({
    data: { schoolId: user.schoolId, ...input },
  });
  revalidatePath("/rooms");
}

const classSchema = z.object({
  grade: z.string().trim().min(1).max(20),
  sectionName: z.string().trim().min(1).max(40),
  shortCode: z.string().trim().min(1).max(12).toUpperCase(),
  homeroomTeacherId: z.uuid().nullable(),
  fixedRoomId: z.uuid().nullable(),
  maxLessonsPerDay: z.number().int().positive().nullable(),
});

export async function saveClassSection(formData: FormData): Promise<void> {
  const user = await verifySession();
  const term = await getActiveTerm(user.schoolId);
  const input = classSchema.parse({
    grade: formData.get("grade"),
    sectionName: formData.get("sectionName"),
    shortCode: formData.get("shortCode"),
    homeroomTeacherId: optionalText(formData.get("homeroomTeacherId")),
    fixedRoomId: optionalText(formData.get("fixedRoomId")),
    maxLessonsPerDay: optionalInteger(formData.get("maxLessonsPerDay")),
  });
  await getDatabase().classSection.create({
    data: {
      schoolId: user.schoolId,
      termId: term.id,
      ...input,
    },
  });
  revalidatePath("/classes");
}

const requirementSchema = z.object({
  classSectionId: z.uuid(),
  subjectId: z.uuid(),
  teacherId: z.uuid(),
  weeklyOccurrences: z.number().int().positive(),
  durationPeriods: z.number().int().positive().max(4),
  minimumDistinctDays: z.number().int().positive(),
  requiredRoomId: z.uuid().nullable(),
});

export async function saveRequirement(formData: FormData): Promise<void> {
  const user = await verifySession();
  const term = await getActiveTerm(user.schoolId);
  const input = requirementSchema.parse({
    classSectionId: formData.get("classSectionId"),
    subjectId: formData.get("subjectId"),
    teacherId: formData.get("teacherId"),
    weeklyOccurrences: Number(formData.get("weeklyOccurrences")),
    durationPeriods: Number(formData.get("durationPeriods")),
    minimumDistinctDays: Number(formData.get("minimumDistinctDays")),
    requiredRoomId: optionalText(formData.get("requiredRoomId")),
  });
  if (input.minimumDistinctDays > input.weeklyOccurrences) {
    throw new Error("DISTINCT_DAYS_EXCEED_OCCURRENCES");
  }

  const db = getDatabase();
  const [classSection, subject, teacher, room] = await Promise.all([
    db.classSection.findFirst({
      where: {
        id: input.classSectionId,
        schoolId: user.schoolId,
        termId: term.id,
        deletedAt: null,
      },
    }),
    db.subject.findFirst({
      where: { id: input.subjectId, schoolId: user.schoolId, deletedAt: null },
    }),
    db.teacher.findFirst({
      where: { id: input.teacherId, schoolId: user.schoolId, deletedAt: null },
    }),
    input.requiredRoomId
      ? db.room.findFirst({
          where: {
            id: input.requiredRoomId,
            schoolId: user.schoolId,
            deletedAt: null,
          },
        })
      : Promise.resolve(null),
  ]);
  if (
    !classSection ||
    !subject ||
    !teacher ||
    (input.requiredRoomId && !room)
  ) {
    throw new Error("SCHOOL_SCOPED_REFERENCE_NOT_FOUND");
  }

  await db.teachingRequirement.create({
    data: {
      schoolId: user.schoolId,
      termId: term.id,
      ...input,
      maxOccurrencesPerDay: 1,
      allowMultipleOccurrencesSameDay: false,
    },
  });
  revalidatePath("/requirements");
}

export async function setRoomsEnabled(formData: FormData): Promise<void> {
  const user = await verifySession();
  const term = await getActiveTerm(user.schoolId);
  await getDatabase().academicTerm.updateMany({
    where: { id: term.id, schoolId: user.schoolId },
    data: { roomsEnabled: formData.get("roomsEnabled") === "on" },
  });
  revalidatePath("/rooms");
  revalidatePath("/settings/calendar");
}

export async function saveTeacherAvailability(
  formData: FormData,
): Promise<void> {
  const user = await verifySession();
  const term = await getActiveTerm(user.schoolId);
  const teacherId = idSchema.parse(formData.get("teacherId"));
  const teacher = await getDatabase().teacher.findFirst({
    where: { id: teacherId, schoolId: user.schoolId, deletedAt: null },
  });
  if (!teacher) {
    throw new Error("TEACHER_NOT_FOUND");
  }

  const db = getDatabase();
  await db.$transaction(async (transaction) => {
    await transaction.availabilityRule.deleteMany({
      where: {
        schoolId: user.schoolId,
        termId: term.id,
        entityType: "TEACHER",
        entityId: teacherId,
      },
    });

    const unavailableSlots = Array.from(formData.keys())
      .filter((key) => key.startsWith("slot:"))
      .map((key) => {
        const [, dayIndex, periodIndex] = key.split(":");
        return {
          schoolId: user.schoolId,
          termId: term.id,
          entityType: "TEACHER" as const,
          entityId: teacherId,
          dayIndex: Number(dayIndex),
          periodIndex: Number(periodIndex),
          state: "UNAVAILABLE" as const,
        };
      });
    if (unavailableSlots.length > 0) {
      await transaction.availabilityRule.createMany({
        data: unavailableSlots,
      });
    }
  });
  revalidatePath("/availability");
}

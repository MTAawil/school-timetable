"use server";

import {
  buildSchoolPeriods,
  defaultGradeLevels,
  getDatabase,
  gradeCode,
  schoolWeekConfigurationSchema,
  sectionLabel,
} from "@school-timetable/database";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { verifySession } from "@/lib/auth/dal";
import { getActiveTerm, optionalInteger, optionalText } from "@/lib/setup";

const dayNameSchema = z.enum([
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
]);

function minutesFromTime(value: FormDataEntryValue | null): number {
  const parsed = z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .parse(value);
  const [hours, minutes] = parsed.split(":").map(Number);
  return hours! * 60 + minutes!;
}

function timeFromMinutes(minutes: number): Date {
  const hours = Math.floor(minutes / 60)
    .toString()
    .padStart(2, "0");
  const remainder = (minutes % 60).toString().padStart(2, "0");
  return new Date(`1970-01-01T${hours}:${remainder}:00.000Z`);
}

export async function saveSchoolWeek(formData: FormData): Promise<void> {
  const user = await verifySession();
  const term = await getActiveTerm(user.schoolId);
  const workingDays = z
    .array(dayNameSchema)
    .min(1)
    .max(7)
    .parse(formData.getAll("workingDays"));
  const configuration = schoolWeekConfigurationSchema.parse({
    workingDayCount: workingDays.length,
    sessionsPerDay: Number(formData.get("sessionsPerDay")),
    sessionDurationMinutes: Number(formData.get("sessionDurationMinutes")),
    firstSessionStartMinutes: minutesFromTime(
      formData.get("firstSessionStart"),
    ),
    breakAfterSession: Number(formData.get("breakAfterSession")),
    breakDurationMinutes: Number(formData.get("breakDurationMinutes")),
  });
  const periods = buildSchoolPeriods(configuration);
  const db = getDatabase();

  await db.$transaction(async (transaction) => {
    const [historyCount, fixedCount, forbiddenCount, restrictionCount] =
      await Promise.all([
        transaction.schedule.count({
          where: { schoolId: user.schoolId, termId: term.id },
        }),
        transaction.requirementFixedSlot.count({
          where: { schoolId: user.schoolId, termId: term.id },
        }),
        transaction.requirementForbiddenSlot.count({
          where: { schoolId: user.schoolId, termId: term.id },
        }),
        transaction.availabilityRule.count({
          where: { schoolId: user.schoolId, termId: term.id },
        }),
      ]);
    if (historyCount > 0) {
      throw new Error("CALENDAR_LOCKED_BY_SCHEDULE_HISTORY");
    }
    if (fixedCount + forbiddenCount > 0) {
      throw new Error("CALENDAR_HAS_FIXED_REQUIREMENTS");
    }
    if (restrictionCount > 0) {
      throw new Error("CALENDAR_HAS_RESTRICTIONS");
    }

    await transaction.slot.deleteMany({
      where: { schoolId: user.schoolId, termId: term.id },
    });
    await transaction.periodDefinition.deleteMany({
      where: { schoolId: user.schoolId, termId: term.id },
    });
    await transaction.dayDefinition.deleteMany({
      where: { schoolId: user.schoolId, termId: term.id },
    });

    await transaction.schoolWeekConfiguration.upsert({
      where: {
        termId_schoolId: { termId: term.id, schoolId: user.schoolId },
      },
      update: configuration,
      create: {
        schoolId: user.schoolId,
        termId: term.id,
        ...configuration,
      },
    });

    const days = await Promise.all(
      workingDays.map((name, dayIndex) =>
        transaction.dayDefinition.create({
          data: {
            schoolId: user.schoolId,
            termId: term.id,
            dayIndex,
            name,
            isWorking: true,
          },
        }),
      ),
    );

    const periodRecords = await Promise.all(
      periods.map((period) =>
        transaction.periodDefinition.create({
          data: {
            schoolId: user.schoolId,
            termId: term.id,
            periodIndex: period.periodIndex,
            name: period.name,
            startsAt: timeFromMinutes(period.startsAtMinutes),
            endsAt: timeFromMinutes(period.endsAtMinutes),
            isTeaching: period.isTeaching,
          },
        }),
      ),
    );

    await transaction.slot.createMany({
      data: days.flatMap((day) =>
        periodRecords.map((period) => ({
          schoolId: user.schoolId,
          termId: term.id,
          dayId: day.id,
          periodId: period.id,
          dayIndex: day.dayIndex,
          periodIndex: period.periodIndex,
        })),
      ),
    });
  });

  revalidatePath("/setup");
  revalidatePath("/settings/calendar");
  redirect("/setup?saved=week");
}

const sectionCountSchema = z.number().int().min(0).max(52);

export async function saveGradeSections(formData: FormData): Promise<void> {
  const user = await verifySession();
  const term = await getActiveTerm(user.schoolId);
  const requested = defaultGradeLevels.map((name) => ({
    name: z
      .string()
      .trim()
      .min(1)
      .max(40)
      .parse(formData.get(`gradeName:${gradeCode(name)}`)),
    code: gradeCode(name),
    sectionCount: sectionCountSchema.parse(
      Number(formData.get(`grade:${gradeCode(name)}`)),
    ),
  }));
  const db = getDatabase();

  await db.$transaction(async (transaction) => {
    for (const [displayOrder, grade] of requested.entries()) {
      const gradeLevel = await transaction.gradeLevel.upsert({
        where: {
          schoolId_code: { schoolId: user.schoolId, code: grade.code },
        },
        update: {
          name: grade.name,
          displayOrder,
          isActive: grade.sectionCount > 0,
          deletedAt: null,
        },
        create: {
          schoolId: user.schoolId,
          code: grade.code,
          name: grade.name,
          displayOrder,
          isActive: grade.sectionCount > 0,
        },
      });
      const existingSections = await transaction.classSection.findMany({
        where: {
          schoolId: user.schoolId,
          termId: term.id,
          gradeLevelId: gradeLevel.id,
        },
        include: {
          _count: {
            select: {
              classCurricula: true,
              requirements: true,
              assignments: true,
            },
          },
        },
      });
      const activeCurriculum = await transaction.gradeCurriculum.findMany({
        where: {
          schoolId: user.schoolId,
          termId: term.id,
          gradeLevelId: gradeLevel.id,
          isActive: true,
        },
      });
      const existingByLabel = new Map(
        existingSections.map((section) => [section.sectionLabel, section]),
      );
      const targetLabels = Array.from(
        { length: grade.sectionCount },
        (_, index) => sectionLabel(index),
      );

      for (const label of targetLabels) {
        const existing = existingByLabel.get(label);
        const generatedName = `${grade.name}-${label}`;
        const generatedShortCode = `${grade.code.replaceAll("_", "")}-${label}`;
        let classSectionId: string;
        if (existing) {
          const sectionName =
            existing.sectionName === existing.generatedName
              ? generatedName
              : existing.sectionName;
          const shortCode =
            existing.shortCode === existing.generatedShortCode
              ? generatedShortCode
              : existing.shortCode;
          const classSection = await transaction.classSection.update({
            where: { id: existing.id },
            data: {
              grade: grade.name,
              isActive: true,
              deletedAt: null,
              sectionName,
              shortCode,
              generatedName,
              generatedShortCode,
            },
          });
          classSectionId = classSection.id;
        } else {
          const classSection = await transaction.classSection.create({
            data: {
              schoolId: user.schoolId,
              termId: term.id,
              grade: grade.name,
              gradeLevelId: gradeLevel.id,
              sectionLabel: label,
              sectionName: generatedName,
              shortCode: generatedShortCode,
              generatedName,
              generatedShortCode,
            },
          });
          classSectionId = classSection.id;
        }

        for (const curriculum of activeCurriculum) {
          await transaction.classCurriculum.upsert({
            where: {
              schoolId_termId_classSectionId_subjectId: {
                schoolId: user.schoolId,
                termId: term.id,
                classSectionId,
                subjectId: curriculum.subjectId,
              },
            },
            update: {
              gradeCurriculumId: curriculum.id,
              weeklySessions: curriculum.weeklySessions,
              isMainSubject: curriculum.isMainSubject,
              allowDoubleSession: curriculum.allowDoubleSession,
              isActive: true,
            },
            create: {
              schoolId: user.schoolId,
              termId: term.id,
              classSectionId,
              gradeCurriculumId: curriculum.id,
              subjectId: curriculum.subjectId,
              weeklySessions: curriculum.weeklySessions,
              isMainSubject: curriculum.isMainSubject,
              allowDoubleSession: curriculum.allowDoubleSession,
            },
          });
        }
      }

      for (const section of existingSections) {
        if (
          section.sectionLabel &&
          !targetLabels.includes(section.sectionLabel)
        ) {
          const referenceCount =
            section._count.classCurricula +
            section._count.requirements +
            section._count.assignments;
          if (referenceCount > 0) {
            throw new Error(`SECTION_REDUCTION_BLOCKED:${section.shortCode}`);
          }
          await transaction.classSection.update({
            where: { id: section.id },
            data: { isActive: false, deletedAt: new Date() },
          });
        }
      }
    }
  });

  revalidatePath("/setup");
  revalidatePath("/classes");
  redirect("/setup?saved=grades");
}

export async function saveSectionNames(formData: FormData): Promise<void> {
  const user = await verifySession();
  const term = await getActiveTerm(user.schoolId);
  const sectionIds = z.array(z.uuid()).parse(formData.getAll("sectionId"));
  const db = getDatabase();

  await db.$transaction(async (transaction) => {
    for (const sectionId of sectionIds) {
      const sectionName = z
        .string()
        .trim()
        .min(1)
        .max(40)
        .parse(formData.get(`sectionName:${sectionId}`));
      const shortCode = z
        .string()
        .trim()
        .min(1)
        .max(20)
        .toUpperCase()
        .parse(formData.get(`shortCode:${sectionId}`));
      const result = await transaction.classSection.updateMany({
        where: {
          id: sectionId,
          schoolId: user.schoolId,
          termId: term.id,
          deletedAt: null,
        },
        data: { sectionName, shortCode },
      });
      if (result.count !== 1) {
        throw new Error("CLASS_SECTION_NOT_FOUND");
      }
    }
  });

  revalidatePath("/setup");
  revalidatePath("/classes");
  redirect("/setup?saved=names");
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

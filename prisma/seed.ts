import { hash } from "bcryptjs";

import { getDatabase } from "../packages/database/src/index";

const ids = {
  school: "00000000-0000-4000-8000-000000000001",
  term: "00000000-0000-4000-8000-000000000002",
  admin: "00000000-0000-4000-8000-000000000003",
  teachers: {
    maya: "00000000-0000-4000-8000-000000000101",
    rami: "00000000-0000-4000-8000-000000000102",
    nour: "00000000-0000-4000-8000-000000000103",
  },
  subjects: {
    math: "00000000-0000-4000-8000-000000000201",
    english: "00000000-0000-4000-8000-000000000202",
    physics: "00000000-0000-4000-8000-000000000203",
    history: "00000000-0000-4000-8000-000000000204",
  },
  classes: {
    tenA: "00000000-0000-4000-8000-000000000301",
    tenB: "00000000-0000-4000-8000-000000000302",
  },
  lab: "00000000-0000-4000-8000-000000000401",
  profile: "00000000-0000-4000-8000-000000000501",
} as const;

const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const periods = [
  { name: "Period 1", startsAt: "08:00", endsAt: "08:50", isTeaching: true },
  { name: "Period 2", startsAt: "08:55", endsAt: "09:45", isTeaching: true },
  { name: "Break", startsAt: "09:45", endsAt: "10:05", isTeaching: false },
  { name: "Period 3", startsAt: "10:05", endsAt: "10:55", isTeaching: true },
  { name: "Period 4", startsAt: "11:00", endsAt: "11:50", isTeaching: true },
];

function time(value: string): Date {
  return new Date(`1970-01-01T${value}:00.000Z`);
}

async function main(): Promise<void> {
  const db = getDatabase();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  if (!adminPassword || adminPassword.length < 12) {
    throw new Error("SEED_ADMIN_PASSWORD must contain at least 12 characters.");
  }
  const passwordHash = await hash(adminPassword, 12);

  await db.school.upsert({
    where: { id: ids.school },
    update: { name: "Cedars Secondary School", timezone: "Asia/Beirut" },
    create: {
      id: ids.school,
      name: "Cedars Secondary School",
      timezone: "Asia/Beirut",
    },
  });

  await db.user.upsert({
    where: { id: ids.admin },
    update: {
      name: "School Administrator",
      passwordHash,
      isActive: true,
    },
    create: {
      id: ids.admin,
      schoolId: ids.school,
      email: "admin@example.test",
      name: "School Administrator",
      passwordHash,
      isActive: true,
    },
  });

  await db.academicTerm.upsert({
    where: { id: ids.term },
    update: { isActive: true, roomsEnabled: true },
    create: {
      id: ids.term,
      schoolId: ids.school,
      name: "2026-2027",
      startsOn: new Date("2026-09-01T00:00:00.000Z"),
      endsOn: new Date("2027-06-30T00:00:00.000Z"),
      isActive: true,
      roomsEnabled: true,
    },
  });

  const dayRecords = [];
  for (const [dayIndex, name] of days.entries()) {
    dayRecords.push(
      await db.dayDefinition.upsert({
        where: { termId_dayIndex: { termId: ids.term, dayIndex } },
        update: { name, isWorking: true },
        create: { schoolId: ids.school, termId: ids.term, dayIndex, name },
      }),
    );
  }

  const periodRecords = [];
  for (const [periodIndex, period] of periods.entries()) {
    periodRecords.push(
      await db.periodDefinition.upsert({
        where: { termId_periodIndex: { termId: ids.term, periodIndex } },
        update: {
          ...period,
          startsAt: time(period.startsAt),
          endsAt: time(period.endsAt),
        },
        create: {
          schoolId: ids.school,
          termId: ids.term,
          periodIndex,
          ...period,
          startsAt: time(period.startsAt),
          endsAt: time(period.endsAt),
        },
      }),
    );
  }

  for (const day of dayRecords) {
    for (const period of periodRecords) {
      await db.slot.upsert({
        where: {
          termId_dayIndex_periodIndex: {
            termId: ids.term,
            dayIndex: day.dayIndex,
            periodIndex: period.periodIndex,
          },
        },
        update: { dayId: day.id, periodId: period.id, isEnabled: true },
        create: {
          schoolId: ids.school,
          termId: ids.term,
          dayId: day.id,
          periodId: period.id,
          dayIndex: day.dayIndex,
          periodIndex: period.periodIndex,
        },
      });
    }
  }

  const teacherData = [
    {
      id: ids.teachers.maya,
      name: "Maya Haddad",
      shortCode: "MH",
      employmentType: "FULL_TIME" as const,
      maxLessonsPerDay: 4,
      maxConsecutiveLessons: 3,
    },
    {
      id: ids.teachers.rami,
      name: "Rami Khoury",
      shortCode: "RK",
      employmentType: "PART_TIME" as const,
      maxLessonsPerDay: 3,
      maxConsecutiveLessons: 3,
    },
    {
      id: ids.teachers.nour,
      name: "Nour Saad",
      shortCode: "NS",
      employmentType: "FULL_TIME" as const,
      maxLessonsPerDay: 4,
      maxConsecutiveLessons: 3,
    },
  ];

  for (const teacher of teacherData) {
    await db.teacher.upsert({
      where: { id: teacher.id },
      update: teacher,
      create: { schoolId: ids.school, ...teacher },
    });
  }

  const subjectData = [
    {
      id: ids.subjects.math,
      name: "Mathematics",
      shortCode: "MATH",
      preferredTimeBand: "EARLY" as const,
    },
    {
      id: ids.subjects.english,
      name: "English",
      shortCode: "ENG",
      preferredTimeBand: "NEUTRAL" as const,
    },
    {
      id: ids.subjects.physics,
      name: "Physics Laboratory",
      shortCode: "PHY",
      preferredTimeBand: "EARLY" as const,
      defaultRoomType: "LAB" as const,
      consecutivePeriodsAllowed: true,
      consecutivePeriodsPreferred: true,
    },
    {
      id: ids.subjects.history,
      name: "History",
      shortCode: "HIST",
      preferredTimeBand: "NEUTRAL" as const,
    },
  ];

  for (const subject of subjectData) {
    await db.subject.upsert({
      where: { id: subject.id },
      update: subject,
      create: { schoolId: ids.school, ...subject },
    });
  }

  await db.room.upsert({
    where: { id: ids.lab },
    update: { name: "Science Laboratory", capacity: 32, isActive: true },
    create: {
      id: ids.lab,
      schoolId: ids.school,
      name: "Science Laboratory",
      shortCode: "LAB-1",
      type: "LAB",
      capacity: 32,
    },
  });

  for (const section of [
    {
      id: ids.classes.tenA,
      sectionName: "10-A",
      shortCode: "10A",
      homeroomTeacherId: ids.teachers.maya,
    },
    {
      id: ids.classes.tenB,
      sectionName: "10-B",
      shortCode: "10B",
      homeroomTeacherId: ids.teachers.nour,
    },
  ]) {
    await db.classSection.upsert({
      where: { id: section.id },
      update: section,
      create: {
        schoolId: ids.school,
        termId: ids.term,
        grade: "10",
        maxLessonsPerDay: 4,
        ...section,
      },
    });
  }

  const requirements = [
    [ids.classes.tenA, ids.subjects.math, ids.teachers.maya, 4, 1],
    [ids.classes.tenA, ids.subjects.english, ids.teachers.nour, 3, 1],
    [ids.classes.tenA, ids.subjects.physics, ids.teachers.rami, 1, 2],
    [ids.classes.tenB, ids.subjects.math, ids.teachers.maya, 4, 1],
    [ids.classes.tenB, ids.subjects.english, ids.teachers.nour, 3, 1],
    [ids.classes.tenB, ids.subjects.history, ids.teachers.rami, 2, 1],
  ] as const;

  for (const [
    classSectionId,
    subjectId,
    teacherId,
    weeklyOccurrences,
    durationPeriods,
  ] of requirements) {
    const existing = await db.teachingRequirement.findFirst({
      where: {
        schoolId: ids.school,
        termId: ids.term,
        classSectionId,
        subjectId,
      },
    });
    const data = {
      schoolId: ids.school,
      termId: ids.term,
      classSectionId,
      subjectId,
      teacherId,
      weeklyOccurrences,
      durationPeriods,
      minimumDistinctDays: Math.min(weeklyOccurrences, 3),
      maxOccurrencesPerDay: 1,
      requiredRoomId: subjectId === ids.subjects.physics ? ids.lab : null,
      requiredRoomType:
        subjectId === ids.subjects.physics ? ("LAB" as const) : null,
    };
    if (existing) {
      await db.teachingRequirement.update({ where: { id: existing.id }, data });
    } else {
      await db.teachingRequirement.create({ data });
    }
  }

  for (const periodIndex of [0, 1, 2, 3, 4]) {
    await db.availabilityRule.upsert({
      where: {
        termId_entityType_entityId_dayIndex_periodIndex: {
          termId: ids.term,
          entityType: "TEACHER",
          entityId: ids.teachers.rami,
          dayIndex: 1,
          periodIndex,
        },
      },
      update: { state: "UNAVAILABLE", reason: "Part-time day" },
      create: {
        schoolId: ids.school,
        termId: ids.term,
        entityType: "TEACHER",
        entityId: ids.teachers.rami,
        dayIndex: 1,
        periodIndex,
        state: "UNAVAILABLE",
        reason: "Part-time day",
      },
    });
  }

  await db.constraintProfile.upsert({
    where: { id: ids.profile },
    update: { name: "Balanced", isDefault: true },
    create: {
      id: ids.profile,
      schoolId: ids.school,
      termId: ids.term,
      name: "Balanced",
      isDefault: true,
    },
  });

  for (const [code, weight] of [
    ["TEACHER_AVAILABILITY", 20],
    ["FIRST_LAST_PERIOD", 2],
    ["TEACHER_GAP", 12],
    ["PART_TIME_COMPACTNESS", 10],
    ["TEACHER_CONSECUTIVE_PREFERENCE", 3],
    ["SUBJECT_SPREAD", 10],
    ["REPEATED_SUBJECT_DAY", 8],
    ["LATE_HEAVY_SUBJECT", 4],
    ["DAILY_WORKLOAD_BALANCE", 2],
  ] as const) {
    await db.constraintWeight.upsert({
      where: { profileId_code: { profileId: ids.profile, code } },
      update: { kind: "SOFT", weight, isEnabled: true },
      create: { profileId: ids.profile, code, kind: "SOFT", weight },
    });
  }

  console.log("Sample school, term, resources, and requirements seeded.");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

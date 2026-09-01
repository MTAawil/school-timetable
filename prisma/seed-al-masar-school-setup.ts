import "dotenv/config";

import { hash } from "bcryptjs";

import {
  defaultGradeLevels,
  getDatabase,
  gradeCode,
} from "../packages/database/src/index";

const SCHOOL_ID = "20000000-0000-4000-8000-000000000001";
const TERM_ID = "20000000-0000-4000-8000-000000000002";
const ADMIN_ID = "20000000-0000-4000-8000-000000000003";

const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const periods = [
  ["Session 1", "08:00", "08:50", true],
  ["Session 2", "08:50", "09:40", true],
  ["Session 3", "09:40", "10:30", true],
  ["Session 4", "10:30", "11:20", true],
  ["Break", "11:20", "11:50", false],
  ["Session 5", "11:50", "12:40", true],
  ["Session 6", "12:40", "13:30", true],
  ["Session 7", "13:30", "14:20", true],
] as const;

const subjectCodes = {
  Arabic: "ARABIC",
  English: "ENGLISH",
  French: "FRENCH",
  Mathematics: "MATHEMATICS",
  Science: "SCIENCE",
  "Social Studies/Civics": "SOCIAL_STUDIES_CIVICS",
  "Computer/IT": "COMPUTER_SCIENCE",
  "Arts and Activities": "ARTS_ACTIVITIES",
  "Physical Education": "PHYSICAL_EDUCATION",
  History: "HISTORY",
  Geography: "GEOGRAPHY",
  Civics: "CIVICS",
  Technology: "TECHNOLOGY",
  Physics: "PHYSICS",
  Chemistry: "CHEMISTRY",
  "Biology/Life Sciences": "BIOLOGY",
  "Sociology and Economics": "SOCIOLOGY_ECONOMICS",
  Philosophy: "PHILOSOPHY",
  Economics: "ECONOMICS",
  Sociology: "SOCIOLOGY",
  "Scientific Culture": "SCIENTIFIC_CULTURE",
} as const;

type SubjectName = keyof typeof subjectCodes;

const curricula: {
  code: string;
  name: string;
  subjects: [SubjectName, number][];
}[] = [
  {
    code: "G1",
    name: "Grade 1",
    subjects: [
      ["Arabic", 7],
      ["English", 8],
      ["French", 2],
      ["Mathematics", 6],
      ["Science", 2],
      ["Social Studies/Civics", 3],
      ["Computer/IT", 1],
      ["Arts and Activities", 4],
      ["Physical Education", 2],
    ],
  },
  {
    code: "G2",
    name: "Grade 2",
    subjects: [
      ["Arabic", 7],
      ["English", 8],
      ["French", 2],
      ["Mathematics", 6],
      ["Science", 2],
      ["Social Studies/Civics", 3],
      ["Computer/IT", 1],
      ["Arts and Activities", 4],
      ["Physical Education", 2],
    ],
  },
  {
    code: "G3",
    name: "Grade 3",
    subjects: [
      ["Arabic", 7],
      ["English", 8],
      ["French", 2],
      ["Mathematics", 6],
      ["Science", 3],
      ["Social Studies/Civics", 3],
      ["Computer/IT", 1],
      ["Arts and Activities", 3],
      ["Physical Education", 2],
    ],
  },
  {
    code: "G4",
    name: "Grade 4",
    subjects: [
      ["Arabic", 6],
      ["English", 7],
      ["French", 2],
      ["Mathematics", 6],
      ["Science", 4],
      ["Social Studies/Civics", 3],
      ["Computer/IT", 1],
      ["Arts and Activities", 4],
      ["Physical Education", 2],
    ],
  },
  {
    code: "G5",
    name: "Grade 5",
    subjects: [
      ["Arabic", 6],
      ["English", 7],
      ["French", 2],
      ["Mathematics", 6],
      ["Science", 4],
      ["Social Studies/Civics", 3],
      ["Computer/IT", 1],
      ["Arts and Activities", 4],
      ["Physical Education", 2],
    ],
  },
  {
    code: "G6",
    name: "Grade 6",
    subjects: [
      ["Arabic", 6],
      ["English", 7],
      ["French", 2],
      ["Mathematics", 6],
      ["Science", 5],
      ["Social Studies/Civics", 3],
      ["Computer/IT", 1],
      ["Arts and Activities", 3],
      ["Physical Education", 2],
    ],
  },
  ...["G7", "G8", "G9"].map((code, index) => ({
    code,
    name: `Grade ${String(index + 7)}`,
    subjects: [
      ["Arabic", 6],
      ["English", 6],
      ["French", 2],
      ["Mathematics", 5],
      ["History", 1],
      ["Geography", 2],
      ["Civics", 1],
      ["Technology", 1],
      ["Computer/IT", 1],
      ["Arts and Activities", 2],
      ["Physical Education", 2],
      ["Physics", 2],
      ["Chemistry", 2],
      ["Biology/Life Sciences", 2],
    ] as [SubjectName, number][],
  })),
  {
    code: "G10",
    name: "Grade 10",
    subjects: [
      ["Arabic", 5],
      ["English", 5],
      ["French", 2],
      ["Mathematics", 5],
      ["Physics", 3],
      ["Chemistry", 2],
      ["Biology/Life Sciences", 2],
      ["Sociology and Economics", 2],
      ["History", 1],
      ["Geography", 2],
      ["Civics", 1],
      ["Technology", 1],
      ["Computer/IT", 1],
      ["Arts and Activities", 1],
      ["Physical Education", 2],
    ],
  },
  {
    code: "G11",
    name: "Grade 11",
    subjects: [
      ["Arabic", 3],
      ["English", 3],
      ["French", 2],
      ["Mathematics", 6],
      ["Physics", 5],
      ["Chemistry", 3],
      ["Biology/Life Sciences", 2],
      ["Philosophy", 2],
      ["Sociology and Economics", 2],
      ["History", 1],
      ["Geography", 1],
      ["Civics", 1],
      ["Technology", 1],
      ["Computer/IT", 1],
      ["Arts and Activities", 1],
      ["Physical Education", 1],
    ],
  },
  {
    code: "G12_LS",
    name: "Grade 12 LS",
    subjects: [
      ["Arabic", 2],
      ["English", 2],
      ["French", 2],
      ["Mathematics", 5],
      ["Physics", 5],
      ["Chemistry", 5],
      ["Biology/Life Sciences", 6],
      ["Philosophy", 3],
      ["History", 1],
      ["Geography", 1],
      ["Civics", 1],
      ["Computer/IT", 1],
      ["Physical Education", 1],
    ],
  },
  {
    code: "G12_ES",
    name: "Grade 12 ES",
    subjects: [
      ["Arabic", 4],
      ["English", 4],
      ["French", 2],
      ["Mathematics", 4],
      ["Economics", 4],
      ["Sociology", 4],
      ["Scientific Culture", 4],
      ["Philosophy", 3],
      ["History", 1],
      ["Geography", 1],
      ["Civics", 1],
      ["Computer/IT", 1],
      ["Arts and Activities", 1],
      ["Physical Education", 1],
    ],
  },
];

function time(value: string): Date {
  return new Date(`1970-01-01T${value}:00.000Z`);
}

async function main(): Promise<void> {
  for (const curriculum of curricula) {
    const total = curriculum.subjects.reduce(
      (sum, [, sessions]) => sum + sessions,
      0,
    );
    if (total !== 35) {
      throw new Error(`${curriculum.code} has ${String(total)} sessions.`);
    }
  }

  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!password || password.length < 12) {
    throw new Error("SEED_ADMIN_PASSWORD must contain at least 12 characters.");
  }

  const db = getDatabase();
  const passwordHash = await hash(password, 12);
  await db.school.upsert({
    where: { id: SCHOOL_ID },
    update: { name: "Al Masar School", timezone: "Asia/Beirut" },
    create: {
      id: SCHOOL_ID,
      name: "Al Masar School",
      timezone: "Asia/Beirut",
    },
  });
  await db.user.upsert({
    where: { id: ADMIN_ID },
    update: { passwordHash, isActive: true },
    create: {
      id: ADMIN_ID,
      schoolId: SCHOOL_ID,
      email: "admin@example.test",
      name: "School Administrator",
      passwordHash,
    },
  });
  await db.academicTerm.upsert({
    where: { id: TERM_ID },
    update: { isActive: true, roomsEnabled: false },
    create: {
      id: TERM_ID,
      schoolId: SCHOOL_ID,
      name: "2026-2027",
      startsOn: new Date("2026-09-01T00:00:00.000Z"),
      endsOn: new Date("2027-06-30T00:00:00.000Z"),
      isActive: true,
      roomsEnabled: false,
    },
  });
  await db.schoolWeekConfiguration.upsert({
    where: { termId_schoolId: { termId: TERM_ID, schoolId: SCHOOL_ID } },
    update: {
      workingDayCount: 5,
      sessionsPerDay: 7,
      sessionDurationMinutes: 50,
      firstSessionStartMinutes: 480,
      breakAfterSession: 4,
      breakDurationMinutes: 30,
    },
    create: {
      schoolId: SCHOOL_ID,
      termId: TERM_ID,
      workingDayCount: 5,
      sessionsPerDay: 7,
      sessionDurationMinutes: 50,
      firstSessionStartMinutes: 480,
      breakAfterSession: 4,
      breakDurationMinutes: 30,
    },
  });

  const dayRecords = [];
  for (const [dayIndex, name] of days.entries()) {
    dayRecords.push(
      await db.dayDefinition.upsert({
        where: { termId_dayIndex: { termId: TERM_ID, dayIndex } },
        update: { name, isWorking: true },
        create: { schoolId: SCHOOL_ID, termId: TERM_ID, dayIndex, name },
      }),
    );
  }
  const periodRecords = [];
  for (const [
    periodIndex,
    [name, startsAt, endsAt, isTeaching],
  ] of periods.entries()) {
    periodRecords.push(
      await db.periodDefinition.upsert({
        where: { termId_periodIndex: { termId: TERM_ID, periodIndex } },
        update: {
          name,
          startsAt: time(startsAt),
          endsAt: time(endsAt),
          isTeaching,
        },
        create: {
          schoolId: SCHOOL_ID,
          termId: TERM_ID,
          periodIndex,
          name,
          startsAt: time(startsAt),
          endsAt: time(endsAt),
          isTeaching,
        },
      }),
    );
  }
  for (const day of dayRecords) {
    for (const period of periodRecords) {
      await db.slot.upsert({
        where: {
          termId_dayIndex_periodIndex: {
            termId: TERM_ID,
            dayIndex: day.dayIndex,
            periodIndex: period.periodIndex,
          },
        },
        update: { dayId: day.id, periodId: period.id, isEnabled: true },
        create: {
          schoolId: SCHOOL_ID,
          termId: TERM_ID,
          dayId: day.id,
          periodId: period.id,
          dayIndex: day.dayIndex,
          periodIndex: period.periodIndex,
        },
      });
    }
  }

  const subjects = new Map<SubjectName, string>();
  for (const [name, shortCode] of Object.entries(subjectCodes) as [
    SubjectName,
    string,
  ][]) {
    const subject = await db.subject.upsert({
      where: { schoolId_shortCode: { schoolId: SCHOOL_ID, shortCode } },
      update: { name, isActive: true, deletedAt: null },
      create: { schoolId: SCHOOL_ID, name, shortCode },
    });
    subjects.set(name, subject.id);
  }

  const selectedGradeNames = new Map(
    curricula.map((curriculum) => [curriculum.code, curriculum.name]),
  );
  const grades = new Map<string, string>();
  for (const [displayOrder, defaultName] of defaultGradeLevels.entries()) {
    const code = gradeCode(defaultName);
    const selectedName = selectedGradeNames.get(code);
    const grade = await db.gradeLevel.upsert({
      where: { schoolId_code: { schoolId: SCHOOL_ID, code } },
      update: {
        name: selectedName ?? defaultName,
        displayOrder,
        isActive: Boolean(selectedName),
        deletedAt: null,
      },
      create: {
        schoolId: SCHOOL_ID,
        code,
        name: selectedName ?? defaultName,
        displayOrder,
        isActive: Boolean(selectedName),
      },
    });
    grades.set(code, grade.id);
  }

  for (const curriculum of curricula) {
    const gradeId = grades.get(curriculum.code);
    if (!gradeId) throw new Error(`Missing grade ${curriculum.code}.`);
    const generatedName = `${curriculum.name}-A`;
    const generatedShortCode = `${curriculum.code.replaceAll("_", "")}-A`;
    const section = await db.classSection.upsert({
      where: {
        schoolId_termId_shortCode: {
          schoolId: SCHOOL_ID,
          termId: TERM_ID,
          shortCode: generatedShortCode,
        },
      },
      update: {
        grade: curriculum.name,
        gradeLevelId: gradeId,
        sectionLabel: "A",
        sectionName: generatedName,
        generatedName,
        generatedShortCode,
        isActive: true,
        deletedAt: null,
      },
      create: {
        schoolId: SCHOOL_ID,
        termId: TERM_ID,
        grade: curriculum.name,
        gradeLevelId: gradeId,
        sectionLabel: "A",
        sectionName: generatedName,
        shortCode: generatedShortCode,
        generatedName,
        generatedShortCode,
      },
    });
    for (const [subjectName, weeklySessions] of curriculum.subjects) {
      const subjectId = subjects.get(subjectName);
      if (!subjectId) throw new Error(`Missing subject ${subjectName}.`);
      const isGrade12EsMain =
        curriculum.code === "G12_ES" &&
        ["Economics", "Sociology", "Philosophy"].includes(subjectName);
      const isMainSubject = weeklySessions >= 5 || isGrade12EsMain;
      const gradeCurriculum = await db.gradeCurriculum.upsert({
        where: {
          schoolId_termId_gradeLevelId_subjectId: {
            schoolId: SCHOOL_ID,
            termId: TERM_ID,
            gradeLevelId: gradeId,
            subjectId,
          },
        },
        update: {
          weeklySessions,
          isMainSubject,
          allowDoubleSession: isMainSubject,
          isActive: true,
        },
        create: {
          schoolId: SCHOOL_ID,
          termId: TERM_ID,
          gradeLevelId: gradeId,
          subjectId,
          weeklySessions,
          isMainSubject,
          allowDoubleSession: isMainSubject,
        },
      });
      await db.classCurriculum.upsert({
        where: {
          schoolId_termId_classSectionId_subjectId: {
            schoolId: SCHOOL_ID,
            termId: TERM_ID,
            classSectionId: section.id,
            subjectId,
          },
        },
        update: {
          gradeCurriculumId: gradeCurriculum.id,
          weeklySessions,
          isMainSubject,
          allowDoubleSession: isMainSubject,
          isActive: true,
        },
        create: {
          schoolId: SCHOOL_ID,
          termId: TERM_ID,
          classSectionId: section.id,
          gradeCurriculumId: gradeCurriculum.id,
          subjectId,
          weeklySessions,
          isMainSubject,
          allowDoubleSession: isMainSubject,
        },
      });
    }
  }

  console.log(
    `Seeded Al Masar School: ${String(curricula.length)} classes, ` +
      `${String(subjects.size)} subjects, 35 sessions per class, 0 teachers.`,
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

import "dotenv/config";

import { getDatabase } from "../packages/database/src/index";

const SCHOOL_ID = "20000000-0000-4000-8000-000000000001";
const TERM_ID = "20000000-0000-4000-8000-000000000002";
const teachingPeriods = [0, 1, 2, 3, 5, 6, 7];

type EmploymentType = "FULL_TIME" | "PART_TIME";
type Family =
  | "ARABIC"
  | "LANGUAGES"
  | "MATHEMATICS"
  | "CREATIVE"
  | "SCIENCES"
  | "HUMANITIES";

type CurriculumRow = {
  id: string;
  subjectId: string;
  weeklySessions: number;
  subject: { name: string };
  classSection: { shortCode: string };
};

type WorkUnit = {
  key: string;
  sessions: number;
  rows: CurriculumRow[];
};

type TeacherBin = {
  family: Family;
  employmentType: EmploymentType;
  minimum: number;
  maximum: number;
};

export type ScenarioNumber = 1 | 2 | 3;

const familySubjects: Record<Family, string[]> = {
  ARABIC: ["Arabic"],
  LANGUAGES: ["English", "French"],
  MATHEMATICS: ["Mathematics"],
  CREATIVE: [
    "Arts and Activities",
    "Computer/IT",
    "Physical Education",
    "Technology",
  ],
  SCIENCES: ["Biology/Life Sciences", "Chemistry", "Physics", "Science"],
  HUMANITIES: [
    "Civics",
    "Economics",
    "Geography",
    "History",
    "Philosophy",
    "Scientific Culture",
    "Social Studies/Civics",
    "Sociology",
    "Sociology and Economics",
  ],
};

const names = [
  "Rana Khoury",
  "Karim Haddad",
  "Maya Nassar",
  "Tarek Saad",
  "Nour Hamdan",
  "Rami Daher",
  "Lina Khalil",
  "Walid Mansour",
  "Hiba Fares",
  "Samer Abboud",
  "Dima Saliba",
  "Fadi Aoun",
  "Mariam Karam",
  "Ziad Rahal",
  "Reem Najjar",
  "Bassem Harb",
  "Lara Sayegh",
  "Nabil Rached",
  "Sana Matar",
  "Jad Farah",
  "Aya Chami",
  "Hassan Saleh",
  "Rita Ghosn",
  "Omar Younes",
  "Carla Rizk",
  "Maher Issa",
  "Yara Tannous",
  "Ali Hamadeh",
  "Nada Zein",
  "Georges Azar",
  "Rola Moukbel",
  "Bassam Kanaan",
  "Mira Dagher",
  "Wael Hakim",
  "Layla Barakat",
];

function bins(
  family: Family,
  fullTime: number,
  partTime: number,
): TeacherBin[] {
  return [
    ...Array.from({ length: fullTime }, () => ({
      family,
      employmentType: "FULL_TIME" as const,
      minimum: 21,
      maximum: 25,
    })),
    ...Array.from({ length: partTime }, () => ({
      family,
      employmentType: "PART_TIME" as const,
      minimum: 10,
      maximum: 20,
    })),
  ];
}

function scenarioBins(scenario: ScenarioNumber): TeacherBin[] {
  if (scenario === 1) {
    return [
      ...bins("ARABIC", 2, 2),
      ...bins("LANGUAGES", 3, 2),
      ...bins("MATHEMATICS", 3, 0),
      ...bins("CREATIVE", 1, 3),
      ...bins("SCIENCES", 0, 4),
      ...bins("HUMANITIES", 1, 3),
    ];
  }
  if (scenario === 2) {
    return [
      ...bins("ARABIC", 3, 0),
      ...bins("LANGUAGES", 3, 3),
      ...bins("MATHEMATICS", 3, 0),
      ...bins("CREATIVE", 3, 0),
      ...bins("SCIENCES", 2, 2),
      ...bins("HUMANITIES", 3, 0),
    ];
  }
  return [
    ...bins("ARABIC", 2, 2),
    ...bins("LANGUAGES", 2, 5),
    ...bins("MATHEMATICS", 1, 4),
    ...bins("CREATIVE", 1, 4),
    ...bins("SCIENCES", 1, 4),
    ...bins("HUMANITIES", 0, 6),
  ];
}

function familyForSubject(subjectName: string): Family {
  const family = (Object.entries(familySubjects) as [Family, string[]][]).find(
    ([, subjects]) => subjects.includes(subjectName),
  )?.[0];
  if (!family) throw new Error(`No teacher family for ${subjectName}.`);
  return family;
}

function continuityKey(row: CurriculumRow): string {
  const grade = row.classSection.shortCode;
  if (
    row.subject.name === "English" &&
    ["G1-A", "G2-A", "G3-A"].includes(grade)
  ) {
    return "ENGLISH_G1_G3";
  }
  if (
    row.subject.name === "English" &&
    ["G4-A", "G5-A", "G6-A"].includes(grade)
  ) {
    return "ENGLISH_G4_G6";
  }
  if (
    row.subject.name === "Arabic" &&
    ["G1-A", "G2-A", "G3-A"].includes(grade)
  ) {
    return "ARABIC_G1_G3";
  }
  if (
    row.subject.name === "Arabic" &&
    ["G4-A", "G5-A", "G6-A", "G7-A"].includes(grade)
  ) {
    return "ARABIC_G4_G7";
  }
  return row.id;
}

function buildUnits(rows: CurriculumRow[]): WorkUnit[] {
  const grouped = Map.groupBy(rows, continuityKey);
  return [...grouped.entries()]
    .map(([key, groupedRows]) => ({
      key,
      rows: groupedRows,
      sessions: groupedRows.reduce(
        (total, row) => total + row.weeklySessions,
        0,
      ),
    }))
    .sort((left, right) => right.sessions - left.sessions);
}

function partitionUnits(
  units: WorkUnit[],
  teacherBins: TeacherBin[],
): WorkUnit[][] {
  const assignments = teacherBins.map(() => [] as WorkUnit[]);
  const loads = teacherBins.map(() => 0);

  const search = (unitIndex: number): boolean => {
    if (unitIndex === units.length) {
      return teacherBins.every(
        (bin, index) =>
          loads[index]! >= bin.minimum && loads[index]! <= bin.maximum,
      );
    }
    const remaining = units
      .slice(unitIndex)
      .reduce((total, unit) => total + unit.sessions, 0);
    const minimumNeeded = teacherBins.reduce(
      (total, bin, index) => total + Math.max(0, bin.minimum - loads[index]!),
      0,
    );
    const capacityLeft = teacherBins.reduce(
      (total, bin, index) => total + bin.maximum - loads[index]!,
      0,
    );
    if (remaining < minimumNeeded || remaining > capacityLeft) return false;

    const unit = units[unitIndex]!;
    const subjectIds = new Set(unit.rows.map((row) => row.subjectId));
    const candidates = teacherBins
      .map((bin, index) => ({ bin, index }))
      .filter(({ bin, index }) => loads[index]! + unit.sessions <= bin.maximum)
      .sort((left, right) => {
        const leftSubjects = new Set(
          assignments[left.index]!.flatMap((item) =>
            item.rows.map((row) => row.subjectId),
          ),
        );
        const rightSubjects = new Set(
          assignments[right.index]!.flatMap((item) =>
            item.rows.map((row) => row.subjectId),
          ),
        );
        const leftMatch = [...subjectIds].some((id) => leftSubjects.has(id));
        const rightMatch = [...subjectIds].some((id) => rightSubjects.has(id));
        if (leftMatch !== rightMatch) return leftMatch ? -1 : 1;
        return loads[right.index]! - loads[left.index]!;
      });
    const seen = new Set<string>();
    for (const { bin, index } of candidates) {
      const signature = `${bin.employmentType}:${String(loads[index])}`;
      if (seen.has(signature)) continue;
      seen.add(signature);
      assignments[index]!.push(unit);
      loads[index] += unit.sessions;
      if (search(unitIndex + 1)) return true;
      loads[index] -= unit.sessions;
      assignments[index]!.pop();
    }
    return false;
  };

  if (!search(0)) {
    throw new Error(
      `Unable to partition ${String(
        units.reduce((total, unit) => total + unit.sessions, 0),
      )} sessions into ${String(teacherBins.length)} teacher workloads.`,
    );
  }
  return assignments;
}

function restrictionsFor(
  teacherId: string,
  employmentType: EmploymentType,
  workload: number,
  teacherIndex: number,
  scenario: ScenarioNumber,
) {
  const restrictions = new Map<string, "DISLIKED" | "UNAVAILABLE">();
  if (employmentType === "FULL_TIME") {
    if (workload <= 23 && (teacherIndex + scenario) % 4 === 0) {
      restrictions.set(
        `${String((teacherIndex + scenario) % 5)}:0`,
        "UNAVAILABLE",
      );
    }
    if (workload <= 23 && (teacherIndex + scenario) % 6 === 0) {
      restrictions.set(`${String((teacherIndex + 2) % 5)}:7`, "UNAVAILABLE");
    }
  } else if (hasLateWindow(workload, teacherIndex, scenario)) {
    for (let dayIndex = 0; dayIndex < 5; dayIndex += 1) {
      for (const periodIndex of [0, 1, 2, 3]) {
        restrictions.set(
          `${String(dayIndex)}:${String(periodIndex)}`,
          "UNAVAILABLE",
        );
      }
    }
  } else {
    if (workload <= 15 && (teacherIndex + scenario) % 5 === 0) {
      const unavailableDay = (teacherIndex + scenario) % 5;
      for (const periodIndex of teachingPeriods) {
        restrictions.set(
          `${String(unavailableDay)}:${String(periodIndex)}`,
          "UNAVAILABLE",
        );
      }
    }
    for (let dayIndex = 0; dayIndex < 5; dayIndex += 1) {
      restrictions.set(`${String(dayIndex)}:0`, "DISLIKED");
    }
  }

  return [...restrictions].map(([slot, state]) => {
    const [dayIndex, periodIndex] = slot.split(":").map(Number);
    return {
      schoolId: SCHOOL_ID,
      termId: TERM_ID,
      entityType: "TEACHER" as const,
      entityId: teacherId,
      dayIndex: dayIndex!,
      periodIndex: periodIndex!,
      state,
      reason:
        employmentType === "FULL_TIME"
          ? "Limited arrival or departure"
          : "Part-time teaching window",
    };
  });
}

function hasLateWindow(
  workload: number,
  teacherIndex: number,
  scenario: ScenarioNumber,
): boolean {
  return workload <= 12 && (teacherIndex + scenario) % 11 === 0;
}

export async function seedTeacherScenario(
  scenario: ScenarioNumber,
): Promise<void> {
  const db = getDatabase();
  const scheduleCount = await db.schedule.count({
    where: { schoolId: SCHOOL_ID },
  });
  if (scheduleCount > 0) {
    throw new Error(
      "TEACHER_SCENARIO_REQUIRES_DATABASE_WITHOUT_SCHEDULE_HISTORY",
    );
  }

  const curriculum = await db.classCurriculum.findMany({
    where: { schoolId: SCHOOL_ID, termId: TERM_ID, isActive: true },
    include: { subject: true, classSection: true },
    orderBy: [
      { subject: { name: "asc" } },
      { classSection: { shortCode: "asc" } },
    ],
  });
  if (curriculum.length === 0) {
    throw new Error("AL_MASAR_CURRICULUM_REQUIRED");
  }

  const allBins = scenarioBins(scenario);
  const plannedTeachers: {
    bin: TeacherBin;
    units: WorkUnit[];
  }[] = [];
  for (const family of Object.keys(familySubjects) as Family[]) {
    const familyRows = curriculum.filter(
      (row) => familyForSubject(row.subject.name) === family,
    );
    const familyBins = allBins.filter((bin) => bin.family === family);
    const assignments = partitionUnits(buildUnits(familyRows), familyBins);
    assignments.forEach((units, index) => {
      plannedTeachers.push({ bin: familyBins[index]!, units });
    });
  }

  await db.$transaction(async (transaction) => {
    await transaction.classCurriculum.updateMany({
      where: { schoolId: SCHOOL_ID, termId: TERM_ID },
      data: { teacherId: null },
    });
    await transaction.availabilityRule.deleteMany({
      where: { schoolId: SCHOOL_ID, termId: TERM_ID, entityType: "TEACHER" },
    });
    await transaction.teacherSubject.deleteMany({
      where: { schoolId: SCHOOL_ID },
    });
    await transaction.teacher.deleteMany({ where: { schoolId: SCHOOL_ID } });

    for (const [teacherIndex, plan] of plannedTeachers.entries()) {
      const workload = plan.units.reduce(
        (total, unit) => total + unit.sessions,
        0,
      );
      const lateWindow =
        plan.bin.employmentType === "PART_TIME" &&
        hasLateWindow(workload, teacherIndex, scenario);
      const maxLessonsPerDay =
        plan.bin.employmentType === "FULL_TIME"
          ? 5
          : lateWindow
            ? 3
            : Math.min(5, Math.max(4, Math.ceil(workload / 3)));
      const teacher = await transaction.teacher.create({
        data: {
          schoolId: SCHOOL_ID,
          name: names[teacherIndex]!,
          shortCode: `S${String(scenario)}_${String(teacherIndex + 1).padStart(2, "0")}`,
          employmentType: plan.bin.employmentType,
          weeklyTeachingSessions: workload,
          maxLessonsPerDay,
          maxConsecutiveLessons: lateWindow
            ? 3
            : (teacherIndex + scenario) % 2 === 0
              ? 2
              : 3,
        },
      });
      const rows = plan.units.flatMap((unit) => unit.rows);
      const subjectIds = [...new Set(rows.map((row) => row.subjectId))];
      await transaction.teacherSubject.createMany({
        data: subjectIds.map((subjectId) => ({
          schoolId: SCHOOL_ID,
          teacherId: teacher.id,
          subjectId,
        })),
      });
      const allocation = await transaction.classCurriculum.updateMany({
        where: { id: { in: rows.map((row) => row.id) }, teacherId: null },
        data: { teacherId: teacher.id },
      });
      if (allocation.count !== rows.length) {
        throw new Error("TEACHER_SCENARIO_ALLOCATION_CONFLICT");
      }
      const restrictions = restrictionsFor(
        teacher.id,
        plan.bin.employmentType,
        workload,
        teacherIndex,
        scenario,
      );
      if (restrictions.length > 0) {
        await transaction.availabilityRule.createMany({ data: restrictions });
      }
    }
  });

  const fullTime = plannedTeachers.filter(
    ({ bin }) => bin.employmentType === "FULL_TIME",
  ).length;
  console.log(
    `Seeded teacher scenario ${String(scenario)}: ` +
      `${String(plannedTeachers.length)} teachers ` +
      `(${String(fullTime)} full-time, ` +
      `${String(plannedTeachers.length - fullTime)} part-time), ` +
      "455 allocated sessions.",
  );
}

const { Client } = require("./packages/database/node_modules/pg");

const DATABASE_URL =
  "postgresql://timetable:timetable@localhost:5432/timetable_al_masar";
const SOLVER_URL = "http://127.0.0.1:8000/v1/solve";
const SOLVER_TOKEN = "local-development-only";

async function query(client, text, params = []) {
  const result = await client.query(text, params);
  return result.rows;
}

async function buildSnapshot() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  const [school] = await query(client, 'select * from "School" limit 1');
  const [term] = await query(
    client,
    'select * from "AcademicTerm" where "isActive" = true limit 1',
  );
  const days = await query(
    client,
    'select * from "DayDefinition" where "schoolId"=$1 and "termId"=$2 order by "dayIndex"',
    [school.id, term.id],
  );
  const dbPeriods = await query(
    client,
    'select * from "PeriodDefinition" where "schoolId"=$1 and "termId"=$2 order by "periodIndex"',
    [school.id, term.id],
  );
  const [weekConfiguration] = await query(
    client,
    'select * from "SchoolWeekConfiguration" where "schoolId"=$1 and "termId"=$2 limit 1',
    [school.id, term.id],
  );
  const teachers = await query(
    client,
    'select * from "Teacher" where "schoolId"=$1 and "isActive"=true and "deletedAt" is null order by id',
    [school.id],
  );
  const subjects = await query(
    client,
    'select * from "Subject" where "schoolId"=$1 and "isActive"=true and "deletedAt" is null order by id',
    [school.id],
  );
  const classSections = await query(
    client,
    'select * from "ClassSection" where "schoolId"=$1 and "termId"=$2 and "isActive"=true and "deletedAt" is null order by id',
    [school.id, term.id],
  );
  const classCurricula = await query(
    client,
    'select * from "ClassCurriculum" where "schoolId"=$1 and "termId"=$2 and "isActive"=true order by id',
    [school.id, term.id],
  );
  const availability = await query(
    client,
    'select * from "AvailabilityRule" where "schoolId"=$1 and "termId"=$2 order by "entityType", "entityId", "dayIndex", "periodIndex"',
    [school.id, term.id],
  );
  const profileRows = await query(
    client,
    'select * from "ConstraintProfile" where "schoolId"=$1 and "termId"=$2 and "isDefault"=true limit 1',
    [school.id, term.id],
  );
  const profile = profileRows[0] ?? null;
  const weights = profile
    ? await query(
        client,
        'select * from "ConstraintWeight" where "profileId"=$1 and "isEnabled"=true order by code',
        [profile.id],
      )
    : [];
  await client.end();

  const snapshotPeriods = Array.from(
    { length: weekConfiguration.sessionsPerDay },
    (_, index) => ({
      id: `session-${index + 1}`,
      index,
      name: `Session ${index + 1}`,
      isTeaching: true,
    }),
  );
  const teachingSessionByPhysicalPeriod = new Map(
    dbPeriods
      .filter((period) => period.isTeaching)
      .map((period, index) => [period.periodIndex, index]),
  );
  const snapshotAvailability = availability.flatMap((rule) => {
    const periodIndex = teachingSessionByPhysicalPeriod.get(rule.periodIndex);
    if (periodIndex === undefined) return [];
    return [
      {
        entityType: rule.entityType,
        entityId: rule.entityId,
        dayIndex: rule.dayIndex,
        periodIndex,
        state: rule.state,
      },
    ];
  });
  const enabledSlots = days
    .filter((day) => day.isWorking)
    .flatMap((day) =>
      snapshotPeriods.map((period) => ({
        id: `${day.id}-${period.id}`,
        dayIndex: day.dayIndex,
        periodIndex: period.index,
      })),
    );

  const full = {
    schemaVersion: 2,
    jobId: "debug-part-time",
    school: { id: school.id, name: school.name, timezone: school.timezone },
    term: { id: term.id, name: term.name, roomsEnabled: term.roomsEnabled },
    weekConfiguration: {
      workingDayCount: weekConfiguration.workingDayCount,
      sessionsPerDay: weekConfiguration.sessionsPerDay,
      sessionDurationMinutes: weekConfiguration.sessionDurationMinutes,
      firstSessionStartMinutes: weekConfiguration.firstSessionStartMinutes,
      breakAfterSession: weekConfiguration.breakAfterSession,
      breakDurationMinutes: weekConfiguration.breakDurationMinutes,
    },
    calendar: {
      days: days.map((day) => ({
        id: day.id,
        index: day.dayIndex,
        name: day.name,
        isWorking: day.isWorking,
      })),
      periods: snapshotPeriods,
      enabledSlots,
    },
    teachers: teachers.map((teacher) => ({
      id: teacher.id,
      name: teacher.name,
      employmentType: teacher.employmentType,
      weeklyTeachingSessions: teacher.weeklyTeachingSessions,
      maxLessonsPerDay: teacher.maxLessonsPerDay,
      maxConsecutiveLessons: teacher.maxConsecutiveLessons,
    })),
    subjects: subjects.map((subject) => ({
      id: subject.id,
      name: subject.name,
      preferredTimeBand: subject.preferredTimeBand,
      consecutivePeriodsPreferred: subject.consecutivePeriodsPreferred,
      defaultRoomType: subject.defaultRoomType,
    })),
    classSections: classSections.map((classSection) => ({
      id: classSection.id,
      name: `${classSection.grade} ${classSection.sectionName}`,
      shortCode: classSection.shortCode,
      maxLessonsPerDay: classSection.maxLessonsPerDay,
      recessAfterSession: classSection.recessAfterSession,
    })),
    rooms: [],
    requirements: classCurricula.map((curriculum) => ({
      id: curriculum.id,
      classSectionId: curriculum.classSectionId,
      subjectId: curriculum.subjectId,
      teacherId: curriculum.teacherId,
      sharedTeachingGroupId: curriculum.sharedTeachingGroupId,
      weeklySessions: curriculum.weeklySessions,
      isMainSubject: curriculum.isMainSubject,
      allowDoubleSession: curriculum.allowDoubleSession,
      fixedSlots: [],
      forbiddenSlots: [],
    })),
    availability: snapshotAvailability,
    lockedAssignments: [],
    existingAssignments: [],
    constraintProfile: {
      id: profile?.id ?? null,
      weights: Object.fromEntries(weights.map((weight) => [weight.code, weight.weight ?? 0])),
    },
    options: {
      alternativeCount: 1,
      timeLimitSeconds: 60,
      randomSeed: 12345,
      maxQualityDegradationPercent: 0,
      roomsEnabled: false,
      useExistingScheduleHint: false,
    },
  };

  const partTimeIds = new Set(
    full.teachers
      .filter((teacher) => teacher.employmentType === "PART_TIME")
      .map((teacher) => teacher.id),
  );
  const requirements = full.requirements.filter(
    (requirement) => requirement.teacherId && partTimeIds.has(requirement.teacherId),
  );
  const teacherIds = new Set(requirements.map((requirement) => requirement.teacherId));
  const subjectIds = new Set(requirements.map((requirement) => requirement.subjectId));
  const classIds = new Set(requirements.map((requirement) => requirement.classSectionId));
  return {
    ...full,
    teachers: full.teachers.filter((teacher) => teacherIds.has(teacher.id)),
    subjects: full.subjects.filter((subject) => subjectIds.has(subject.id)),
    classSections: full.classSections.filter((classSection) => classIds.has(classSection.id)),
    requirements,
    availability: full.availability.filter(
      (rule) =>
        (rule.entityType === "TEACHER" && teacherIds.has(rule.entityId)) ||
        (rule.entityType === "CLASS_SECTION" && classIds.has(rule.entityId)) ||
        rule.entityType === "ROOM",
    ),
  };
}

async function solve(label, mutate) {
  const snapshot = await buildSnapshot();
  mutate?.(snapshot);
  const response = await fetch(SOLVER_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-solver-token": SOLVER_TOKEN,
    },
    body: JSON.stringify({ ...snapshot, jobId: `debug-${label}` }),
  });
  const body = await response.json();
  console.log(label, body.status, body.runtimeMs);
  console.log(JSON.stringify(body.diagnostics, null, 2));
}

(async () => {
  await solve("current");
  await solve("no-main-double-required", (snapshot) => {
    for (const requirement of snapshot.requirements) {
      requirement.isMainSubject = false;
    }
  });
  await solve("all-double-allowed", (snapshot) => {
    for (const requirement of snapshot.requirements) {
      requirement.allowDoubleSession = true;
    }
  });
  await solve("relax-assaf-sobhi", (snapshot) => {
    for (const requirement of snapshot.requirements) {
      const teacher = snapshot.teachers.find((item) => item.id === requirement.teacherId);
      if (teacher && ["محمد عساف", "صبحي حمية"].includes(teacher.name)) {
        requirement.allowDoubleSession = true;
        requirement.isMainSubject = true;
      }
    }
  });
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

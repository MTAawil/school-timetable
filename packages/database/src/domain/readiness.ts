import type {
  LegacySolverSnapshot,
  SnapshotAssignment,
  SolverSnapshot,
  SupervisorSolverSnapshot,
} from "./solver-snapshot";

export type ReadinessIssueCode =
  | "CLASS_CAPACITY_SHORTAGE"
  | "TEACHER_CAPACITY_SHORTAGE"
  | "REQUIREMENT_COMPATIBILITY_SHORTAGE"
  | "DAILY_CAPACITY_SHORTAGE"
  | "DISTINCT_DAYS_SHORTAGE"
  | "ROOM_CAPACITY_SHORTAGE"
  | "FIXED_TEACHER_COLLISION"
  | "FIXED_CLASS_COLLISION"
  | "FIXED_ROOM_COLLISION"
  | "INSUFFICIENT_CONSECUTIVE_SLOTS"
  | "LOCKED_ASSIGNMENT_CONFLICT"
  | "SCHOOL_WEEK_INCOMPLETE"
  | "BREAK_CONFIGURATION_INVALID"
  | "CURRICULUM_EMPTY"
  | "CURRICULUM_EXCEEDS_CLASS_CAPACITY"
  | "CLASS_SUBJECT_UNASSIGNED"
  | "CLASS_SUBJECT_MULTIPLE_TEACHERS"
  | "TEACHER_WORKLOAD_MISMATCH"
  | "NON_MAIN_DAILY_CAPACITY_SHORTAGE"
  | "DOUBLE_REQUIRED_BUT_DISABLED"
  | "MAIN_DOUBLE_ADJACENCY_SHORTAGE"
  | "MAIN_DAILY_CAPACITY_SHORTAGE";

export type ReadinessIssue = {
  code: ReadinessIssueCode;
  summary: string;
  entityIds: string[];
  required?: number;
  available?: number;
  suggestions: string[];
};

export type ReadinessResult = {
  ready: boolean;
  issues: ReadinessIssue[];
};

type Requirement = LegacySolverSnapshot["requirements"][number];
type Position = { dayIndex: number; periodIndex: number };

const positionKey = (dayIndex: number, periodIndex: number) =>
  `${String(dayIndex)}:${String(periodIndex)}`;

function entityName(
  snapshot: LegacySolverSnapshot,
  type: "teacher" | "class" | "room" | "requirement",
  id: string,
) {
  if (type === "teacher") {
    return snapshot.teachers.find((item) => item.id === id)?.name ?? id;
  }
  if (type === "class") {
    return snapshot.classSections.find((item) => item.id === id)?.name ?? id;
  }
  if (type === "room") {
    return snapshot.rooms.find((item) => item.id === id)?.name ?? id;
  }
  const requirement = snapshot.requirements.find((item) => item.id === id);
  const subject = snapshot.subjects.find(
    (item) => item.id === requirement?.subjectId,
  );
  return subject?.name ?? id;
}

function unavailableSet(
  snapshot: SolverSnapshot,
  entityType: "TEACHER" | "CLASS_SECTION" | "ROOM",
  entityId: string,
) {
  return new Set(
    snapshot.availability
      .filter(
        (rule) =>
          rule.entityType === entityType &&
          rule.entityId === entityId &&
          rule.state === "UNAVAILABLE",
      )
      .map((rule) => positionKey(rule.dayIndex, rule.periodIndex)),
  );
}

function teachingPositions(snapshot: SolverSnapshot): Position[] {
  const workingDays = new Set(
    snapshot.calendar.days
      .filter((day) => day.isWorking)
      .map((day) => day.index),
  );
  const teachingPeriods = new Set(
    snapshot.calendar.periods
      .filter((period) => period.isTeaching)
      .map((period) => period.index),
  );
  return snapshot.calendar.enabledSlots
    .filter(
      (slot) =>
        workingDays.has(slot.dayIndex) && teachingPeriods.has(slot.periodIndex),
    )
    .map(({ dayIndex, periodIndex }) => ({ dayIndex, periodIndex }));
}

function hasCompatibleAdjacentDouble(
  snapshot: SupervisorSolverSnapshot,
  requirement: SupervisorSolverSnapshot["requirements"][number],
) {
  if (!snapshot.weekConfiguration || !requirement.teacherId) {
    return false;
  }
  const workingDays = snapshot.calendar.days
    .filter((day) => day.isWorking)
    .map((day) => day.index);
  const teachingPeriods = snapshot.calendar.periods
    .filter((period) => period.isTeaching)
    .map((period) => period.index)
    .sort((left, right) => left - right);
  const enabled = new Set(
    snapshot.calendar.enabledSlots.map((slot) =>
      positionKey(slot.dayIndex, slot.periodIndex),
    ),
  );
  const teacherUnavailable = unavailableSet(
    snapshot,
    "TEACHER",
    requirement.teacherId,
  );
  const classUnavailable = unavailableSet(
    snapshot,
    "CLASS_SECTION",
    requirement.classSectionId,
  );
  const forbidden = new Set(
    requirement.forbiddenSlots.map((slot) =>
      positionKey(slot.dayIndex, slot.periodIndex),
    ),
  );
  const classSection = snapshot.classSections.find(
    (item) => item.id === requirement.classSectionId,
  );
  const breakAfterSession =
    classSection?.recessAfterSession ??
    snapshot.weekConfiguration.breakAfterSession;

  for (const dayIndex of workingDays) {
    for (let rank = 0; rank < teachingPeriods.length - 1; rank += 1) {
      const left = teachingPeriods[rank];
      const right = teachingPeriods[rank + 1];
      if (left === undefined || right === undefined) {
        continue;
      }
      if (rank + 1 === breakAfterSession) {
        continue;
      }
      const leftKey = positionKey(dayIndex, left);
      const rightKey = positionKey(dayIndex, right);
      if (
        enabled.has(leftKey) &&
        enabled.has(rightKey) &&
        !teacherUnavailable.has(leftKey) &&
        !teacherUnavailable.has(rightKey) &&
        !classUnavailable.has(leftKey) &&
        !classUnavailable.has(rightKey) &&
        !forbidden.has(leftKey) &&
        !forbidden.has(rightKey)
      ) {
        return true;
      }
    }
  }
  return false;
}

function capacityWithDailyLimit(
  positions: Position[],
  unavailable: Set<string>,
  dailyLimit: number | null,
) {
  const availableByDay = new Map<number, number>();
  for (const position of positions) {
    if (unavailable.has(positionKey(position.dayIndex, position.periodIndex))) {
      continue;
    }
    availableByDay.set(
      position.dayIndex,
      (availableByDay.get(position.dayIndex) ?? 0) + 1,
    );
  }
  return Array.from(availableByDay.values()).reduce(
    (total, available) =>
      total +
      (dailyLimit === null ? available : Math.min(available, dailyLimit)),
    0,
  );
}

function teacherCapacity(
  positions: Position[],
  unavailable: Set<string>,
  dailyLimit: number | null,
  consecutiveLimit: number | null,
  breakAfterSession: number | null,
) {
  if (consecutiveLimit === null) {
    return capacityWithDailyLimit(positions, unavailable, dailyLimit);
  }
  const periodsByDay = new Map<number, number[]>();
  for (const position of positions) {
    if (unavailable.has(positionKey(position.dayIndex, position.periodIndex))) {
      continue;
    }
    const periods = periodsByDay.get(position.dayIndex) ?? [];
    periods.push(position.periodIndex);
    periodsByDay.set(position.dayIndex, periods);
  }
  let weekly = 0;
  for (const periods of periodsByDay.values()) {
    let daily = 0;
    let run = 0;
    let previous: number | null = null;
    const finishRun = () => {
      daily += run - Math.floor(run / (consecutiveLimit + 1));
      run = 0;
    };
    for (const period of periods.sort((left, right) => left - right)) {
      const crossesBreak =
        breakAfterSession !== null &&
        previous === breakAfterSession - 1 &&
        period === breakAfterSession;
      if (previous !== null && (period !== previous + 1 || crossesBreak)) {
        finishRun();
      }
      run += 1;
      previous = period;
    }
    finishRun();
    weekly += dailyLimit === null ? daily : Math.min(daily, dailyLimit);
  }
  return weekly;
}

function compatibleStarts(
  snapshot: LegacySolverSnapshot,
  requirement: Requirement,
): Position[] {
  const positions = teachingPositions(snapshot);
  const enabled = new Set(
    positions.map((position) =>
      positionKey(position.dayIndex, position.periodIndex),
    ),
  );
  const teacherUnavailable = unavailableSet(
    snapshot,
    "TEACHER",
    requirement.teacherId,
  );
  const classUnavailable = unavailableSet(
    snapshot,
    "CLASS_SECTION",
    requirement.classSectionId,
  );
  const roomUnavailable = requirement.requiredRoomId
    ? unavailableSet(snapshot, "ROOM", requirement.requiredRoomId)
    : new Set<string>();
  const forbidden = new Set(
    requirement.forbiddenSlots.map((slot) =>
      positionKey(slot.dayIndex, slot.periodIndex),
    ),
  );

  return positions.filter((start) => {
    if (forbidden.has(positionKey(start.dayIndex, start.periodIndex))) {
      return false;
    }
    for (let offset = 0; offset < requirement.durationPeriods; offset += 1) {
      const key = positionKey(start.dayIndex, start.periodIndex + offset);
      if (
        !enabled.has(key) ||
        teacherUnavailable.has(key) ||
        classUnavailable.has(key) ||
        roomUnavailable.has(key)
      ) {
        return false;
      }
    }
    return true;
  });
}

function addCollisionIssues(
  snapshot: LegacySolverSnapshot,
  issues: ReadinessIssue[],
  assignments: SnapshotAssignment[],
) {
  const occupancy = new Map<
    string,
    { assignment: SnapshotAssignment; requirement: Requirement }
  >();
  for (const assignment of assignments) {
    const requirement = snapshot.requirements.find(
      (item) => item.id === assignment.requirementId,
    );
    if (!requirement) continue;
    for (let offset = 0; offset < assignment.durationPeriods; offset += 1) {
      const slot = positionKey(
        assignment.dayIndex,
        assignment.periodIndex + offset,
      );
      const resources = [
        {
          kind: "TEACHER",
          id: requirement.teacherId,
          code: "FIXED_TEACHER_COLLISION" as const,
        },
        {
          kind: "CLASS",
          id: requirement.classSectionId,
          code: "FIXED_CLASS_COLLISION" as const,
        },
        ...(assignment.roomId
          ? [
              {
                kind: "ROOM",
                id: assignment.roomId,
                code: "FIXED_ROOM_COLLISION" as const,
              },
            ]
          : []),
      ];
      for (const resource of resources) {
        const key = `${resource.kind}:${resource.id}:${slot}`;
        const previous = occupancy.get(key);
        if (
          previous &&
          previous.assignment.requirementId !== assignment.requirementId
        ) {
          const label =
            resource.kind === "TEACHER"
              ? entityName(snapshot, "teacher", resource.id)
              : resource.kind === "CLASS"
                ? entityName(snapshot, "class", resource.id)
                : entityName(snapshot, "room", resource.id);
          issues.push({
            code: resource.code,
            summary: `${label} has two fixed lessons at the same time.`,
            entityIds: [
              resource.id,
              previous.assignment.requirementId,
              assignment.requirementId,
            ],
            required: 2,
            available: 1,
            suggestions: [
              "Move or remove one of the conflicting fixed lessons.",
            ],
          });
        } else {
          occupancy.set(key, { assignment, requirement });
        }
      }
    }
  }
}

function validateLegacyReadiness(
  snapshot: LegacySolverSnapshot,
): ReadinessResult {
  const issues: ReadinessIssue[] = [];
  const positions = teachingPositions(snapshot);

  for (const classSection of snapshot.classSections) {
    const required = snapshot.requirements
      .filter((item) => item.classSectionId === classSection.id)
      .reduce(
        (total, item) => total + item.weeklyOccurrences * item.durationPeriods,
        0,
      );
    const unavailable = unavailableSet(
      snapshot,
      "CLASS_SECTION",
      classSection.id,
    );
    const available = capacityWithDailyLimit(
      positions,
      unavailable,
      classSection.maxLessonsPerDay,
    );
    if (required > available) {
      issues.push({
        code: "CLASS_CAPACITY_SHORTAGE",
        summary: `${classSection.name} needs ${String(required)} periods but has ${String(available)} available.`,
        entityIds: [classSection.id],
        required,
        available,
        suggestions: [
          "Reduce the class lesson demand.",
          "Enable more teaching slots for this class.",
        ],
      });
    }
  }

  for (const teacher of snapshot.teachers) {
    const required = snapshot.requirements
      .filter((item) => item.teacherId === teacher.id)
      .reduce(
        (total, item) => total + item.weeklyOccurrences * item.durationPeriods,
        0,
      );
    const unavailable = unavailableSet(snapshot, "TEACHER", teacher.id);
    const available = capacityWithDailyLimit(
      positions,
      unavailable,
      teacher.maxLessonsPerDay,
    );
    if (required > available) {
      issues.push({
        code: "TEACHER_CAPACITY_SHORTAGE",
        summary: `${teacher.name} needs ${String(required)} periods but has ${String(available)} available.`,
        entityIds: [teacher.id],
        required,
        available,
        suggestions: [
          `Increase ${teacher.name}'s availability by at least ${String(required - available)} periods.`,
          "Assign one or more requirements to another teacher.",
        ],
      });
    }
  }

  for (const requirement of snapshot.requirements) {
    const starts = compatibleStarts(snapshot, requirement);
    const subjectName = entityName(snapshot, "requirement", requirement.id);
    const availableDays = new Set(starts.map((start) => start.dayIndex)).size;
    if (starts.length < requirement.weeklyOccurrences) {
      issues.push({
        code:
          requirement.durationPeriods > 1
            ? "INSUFFICIENT_CONSECUTIVE_SLOTS"
            : "REQUIREMENT_COMPATIBILITY_SHORTAGE",
        summary: `${subjectName} needs ${String(requirement.weeklyOccurrences)} compatible starts but has ${String(starts.length)}.`,
        entityIds: [
          requirement.id,
          requirement.teacherId,
          requirement.classSectionId,
        ],
        required: requirement.weeklyOccurrences,
        available: starts.length,
        suggestions: [
          "Relax availability or forbidden-slot restrictions.",
          "Reduce the required weekly occurrences.",
        ],
      });
    }
    const dailyCapacity = requirement.maxOccurrencesPerDay * availableDays;
    if (requirement.weeklyOccurrences > dailyCapacity) {
      issues.push({
        code: "DAILY_CAPACITY_SHORTAGE",
        summary: `${subjectName} cannot fit its weekly sessions within the daily limit.`,
        entityIds: [requirement.id],
        required: requirement.weeklyOccurrences,
        available: dailyCapacity,
        suggestions: [
          "Increase the maximum occurrences per day.",
          "Make another compatible day available.",
        ],
      });
    }
    if (requirement.minimumDistinctDays > availableDays) {
      issues.push({
        code: "DISTINCT_DAYS_SHORTAGE",
        summary: `${subjectName} needs ${String(requirement.minimumDistinctDays)} distinct days but has ${String(availableDays)}.`,
        entityIds: [requirement.id],
        required: requirement.minimumDistinctDays,
        available: availableDays,
        suggestions: [
          "Reduce the distinct-day requirement.",
          "Make the lesson compatible with more days.",
        ],
      });
    }
    if (
      snapshot.options.roomsEnabled &&
      (requirement.requiredRoomId || requirement.requiredRoomType)
    ) {
      const compatibleRooms = snapshot.rooms.filter(
        (room) =>
          (!requirement.requiredRoomId ||
            room.id === requirement.requiredRoomId) &&
          (!requirement.requiredRoomType ||
            room.type === requirement.requiredRoomType),
      );
      if (compatibleRooms.length === 0) {
        issues.push({
          code: "ROOM_CAPACITY_SHORTAGE",
          summary: `${subjectName} has no compatible room.`,
          entityIds: [requirement.id],
          required: 1,
          available: 0,
          suggestions: [
            "Add a compatible room.",
            "Change or remove the room requirement.",
          ],
        });
      }
    }
  }

  if (snapshot.options.roomsEnabled) {
    const roomKeys = new Set(
      snapshot.requirements.flatMap((requirement) => [
        ...(requirement.requiredRoomId
          ? [`id:${requirement.requiredRoomId}`]
          : []),
        ...(requirement.requiredRoomType
          ? [`type:${requirement.requiredRoomType}`]
          : []),
      ]),
    );
    for (const roomKey of roomKeys) {
      const [kind, value] = roomKey.split(":");
      if (!kind || !value) continue;
      const matchingRooms = snapshot.rooms.filter((room) =>
        kind === "id" ? room.id === value : room.type === value,
      );
      const required = snapshot.requirements
        .filter((requirement) =>
          kind === "id"
            ? requirement.requiredRoomId === value
            : !requirement.requiredRoomId &&
              requirement.requiredRoomType === value,
        )
        .reduce(
          (total, requirement) =>
            total + requirement.weeklyOccurrences * requirement.durationPeriods,
          0,
        );
      const available = matchingRooms.reduce(
        (total, room) =>
          total +
          capacityWithDailyLimit(
            positions,
            unavailableSet(snapshot, "ROOM", room.id),
            null,
          ),
        0,
      );
      if (required > available) {
        const label =
          kind === "id"
            ? entityName(snapshot, "room", value)
            : value.replaceAll("_", " ").toLowerCase();
        issues.push({
          code: "ROOM_CAPACITY_SHORTAGE",
          summary: `${label} room demand needs ${String(required)} periods but has ${String(available)} available.`,
          entityIds: matchingRooms.map((room) => room.id),
          required,
          available,
          suggestions: [
            "Add or enable another compatible room.",
            "Reduce room-specific demand or broaden room compatibility.",
          ],
        });
      }
    }
  }

  const fixedAssignments = snapshot.requirements.flatMap((requirement) =>
    requirement.fixedSlots.map((slot) => ({
      requirementId: requirement.id,
      dayIndex: slot.dayIndex,
      periodIndex: slot.periodIndex,
      durationPeriods: requirement.durationPeriods,
      roomId: requirement.requiredRoomId,
    })),
  );
  addCollisionIssues(snapshot, issues, fixedAssignments);
  addCollisionIssues(snapshot, issues, snapshot.lockedAssignments);

  for (const assignment of snapshot.lockedAssignments) {
    const requirement = snapshot.requirements.find(
      (item) => item.id === assignment.requirementId,
    );
    if (
      !requirement ||
      !compatibleStarts(snapshot, requirement).some(
        (start) =>
          start.dayIndex === assignment.dayIndex &&
          start.periodIndex === assignment.periodIndex,
      )
    ) {
      issues.push({
        code: "LOCKED_ASSIGNMENT_CONFLICT",
        summary: `A locked ${entityName(snapshot, "requirement", assignment.requirementId)} lesson conflicts with current availability.`,
        entityIds: [assignment.requirementId],
        suggestions: [
          "Unlock or move the assignment.",
          "Restore the availability used when it was locked.",
        ],
      });
    }
  }

  const uniqueIssues = Array.from(
    new Map(
      issues.map((issue) => [
        `${issue.code}:${issue.entityIds.join(":")}`,
        issue,
      ]),
    ).values(),
  ).sort((left, right) =>
    `${left.code}:${left.entityIds.join(":")}`.localeCompare(
      `${right.code}:${right.entityIds.join(":")}`,
    ),
  );
  return { ready: uniqueIssues.length === 0, issues: uniqueIssues };
}

function validateSupervisorReadiness(
  snapshot: SupervisorSolverSnapshot,
): ReadinessResult {
  const issues: ReadinessIssue[] = [];
  const workingDays = snapshot.calendar.days.filter((day) => day.isWorking);
  const teachingPeriods = snapshot.calendar.periods.filter(
    (period) => period.isTeaching,
  );
  const week = snapshot.weekConfiguration;

  if (
    !week ||
    week.workingDayCount <= 0 ||
    week.sessionsPerDay <= 0 ||
    week.sessionDurationMinutes <= 0 ||
    workingDays.length !== week.workingDayCount ||
    teachingPeriods.length !== week.sessionsPerDay
  ) {
    issues.push({
      code: "SCHOOL_WEEK_INCOMPLETE",
      summary: "Complete the school week before generating a timetable.",
      entityIds: [snapshot.term.id],
      suggestions: ["/setup"],
    });
  } else if (
    week.breakAfterSession <= 0 ||
    week.breakAfterSession >= week.sessionsPerDay ||
    week.breakDurationMinutes <= 0
  ) {
    issues.push({
      code: "BREAK_CONFIGURATION_INVALID",
      summary: "The break must be between two teaching sessions.",
      entityIds: [snapshot.term.id],
      suggestions: ["/setup"],
    });
  }

  if (snapshot.requirements.length === 0) {
    issues.push({
      code: "CURRICULUM_EMPTY",
      summary: "Add subjects and weekly sessions to the class curriculum.",
      entityIds: [snapshot.term.id],
      suggestions: ["/subjects"],
    });
  }

  const workingDayCount = workingDays.length;
  const weeklyClassCapacity = workingDayCount * teachingPeriods.length;
  for (const classSection of snapshot.classSections) {
    const curriculum = snapshot.requirements.filter(
      (item) => item.classSectionId === classSection.id,
    );
    const required = curriculum.reduce(
      (total, item) => total + item.weeklySessions,
      0,
    );
    const dailyLimit = classSection.maxLessonsPerDay ?? teachingPeriods.length;
    const available = Math.min(
      weeklyClassCapacity,
      workingDayCount * dailyLimit,
    );
    if (required > available) {
      issues.push({
        code: "CURRICULUM_EXCEEDS_CLASS_CAPACITY",
        summary: `${classSection.name} needs ${String(required)} sessions but can fit ${String(available)}.`,
        entityIds: [classSection.id],
        required,
        available,
        suggestions: ["/subjects", "/setup"],
      });
    }
  }

  for (const requirement of snapshot.requirements) {
    const classSection = snapshot.classSections.find(
      (item) => item.id === requirement.classSectionId,
    );
    const subject = snapshot.subjects.find(
      (item) => item.id === requirement.subjectId,
    );
    const label = `${classSection?.name ?? requirement.classSectionId} ${subject?.name ?? requirement.subjectId}`;
    if (!requirement.teacherId) {
      issues.push({
        code: "CLASS_SUBJECT_UNASSIGNED",
        summary: `${label} does not have a teacher.`,
        entityIds: [requirement.classSectionId, requirement.subjectId],
        required: 1,
        available: 0,
        suggestions: ["/teachers"],
      });
    }
    if (
      !requirement.isMainSubject &&
      requirement.weeklySessions >
        workingDayCount + (requirement.allowDoubleSession ? 1 : 0)
    ) {
      issues.push({
        code: "NON_MAIN_DAILY_CAPACITY_SHORTAGE",
        summary: `${label} needs ${String(requirement.weeklySessions)} sessions but a non-main subject can use at most one same-day double per week.`,
        entityIds: [
          requirement.id,
          requirement.classSectionId,
          requirement.subjectId,
        ],
        required: requirement.weeklySessions,
        available: workingDayCount + (requirement.allowDoubleSession ? 1 : 0),
        suggestions: ["/subjects"],
      });
    }
    if (
      requirement.isMainSubject &&
      !requirement.allowDoubleSession &&
      requirement.weeklySessions >= 2
    ) {
      issues.push({
        code: "DOUBLE_REQUIRED_BUT_DISABLED",
        summary: `${label} needs at least one consecutive same-day pair, but double sessions are disabled.`,
        entityIds: [
          requirement.id,
          requirement.classSectionId,
          requirement.subjectId,
        ],
        required: requirement.weeklySessions,
        available: workingDayCount,
        suggestions: ["/subjects"],
      });
    }
    if (
      requirement.isMainSubject &&
      requirement.allowDoubleSession &&
      requirement.weeklySessions >= 2 &&
      !hasCompatibleAdjacentDouble(snapshot, requirement)
    ) {
      issues.push({
        code: "MAIN_DOUBLE_ADJACENCY_SHORTAGE",
        summary: `${label} needs at least one consecutive same-day pair, but no compatible pair is available.`,
        entityIds: [
          requirement.id,
          requirement.classSectionId,
          requirement.subjectId,
          ...(requirement.teacherId ? [requirement.teacherId] : []),
        ],
        required: 1,
        available: 0,
        suggestions: ["/teachers", "/subjects", "/setup"],
      });
    }
    if (
      requirement.isMainSubject &&
      requirement.weeklySessions > workingDayCount * 2
    ) {
      issues.push({
        code: "MAIN_DAILY_CAPACITY_SHORTAGE",
        summary: `${label} exceeds the two-session daily maximum.`,
        entityIds: [
          requirement.id,
          requirement.classSectionId,
          requirement.subjectId,
        ],
        required: requirement.weeklySessions,
        available: workingDayCount * 2,
        suggestions: ["/subjects"],
      });
    }
  }

  const ownership = new Map<string, string[]>();
  for (const requirement of snapshot.requirements) {
    const key = `${requirement.classSectionId}:${requirement.subjectId}`;
    const teacherIds = ownership.get(key) ?? [];
    if (requirement.teacherId && !teacherIds.includes(requirement.teacherId)) {
      teacherIds.push(requirement.teacherId);
    }
    ownership.set(key, teacherIds);
  }
  for (const [key, teacherIds] of ownership) {
    if (teacherIds.length <= 1) continue;
    const [classSectionId = "", subjectId = ""] = key.split(":");
    issues.push({
      code: "CLASS_SUBJECT_MULTIPLE_TEACHERS",
      summary: "A class-subject is assigned to more than one teacher.",
      entityIds: [classSectionId, subjectId, ...teacherIds],
      required: 1,
      available: teacherIds.length,
      suggestions: ["/teachers"],
    });
  }

  const positions = teachingPositions(snapshot);
  for (const teacher of snapshot.teachers) {
    const countedSharedGroups = new Set<string>();
    const allocated = snapshot.requirements
      .filter((item) => item.teacherId === teacher.id)
      .reduce((total, item) => {
        if (item.sharedTeachingGroupId) {
          if (countedSharedGroups.has(item.sharedTeachingGroupId)) {
            return total;
          }
          countedSharedGroups.add(item.sharedTeachingGroupId);
        }
        return total + item.weeklySessions;
      }, 0);
    if (allocated !== teacher.weeklyTeachingSessions) {
      issues.push({
        code: "TEACHER_WORKLOAD_MISMATCH",
        summary: `${teacher.name} declares ${String(teacher.weeklyTeachingSessions)} sessions but is allocated ${String(allocated)}.`,
        entityIds: [teacher.id],
        required: teacher.weeklyTeachingSessions,
        available: allocated,
        suggestions: ["/teachers"],
      });
    }
    const available = teacherCapacity(
      positions,
      unavailableSet(snapshot, "TEACHER", teacher.id),
      teacher.maxLessonsPerDay,
      teacher.maxConsecutiveLessons,
      week?.breakAfterSession ?? null,
    );
    if (teacher.weeklyTeachingSessions > available) {
      issues.push({
        code: "TEACHER_CAPACITY_SHORTAGE",
        summary: `${teacher.name} declares ${String(teacher.weeklyTeachingSessions)} sessions but only ${String(available)} are available.`,
        entityIds: [teacher.id],
        required: teacher.weeklyTeachingSessions,
        available,
        suggestions: ["/availability", "/teachers"],
      });
    }
  }

  const uniqueIssues = Array.from(
    new Map(
      issues.map((issue) => [
        `${issue.code}:${issue.entityIds.join(":")}`,
        issue,
      ]),
    ).values(),
  ).sort((left, right) =>
    `${left.code}:${left.entityIds.join(":")}`.localeCompare(
      `${right.code}:${right.entityIds.join(":")}`,
    ),
  );
  return { ready: uniqueIssues.length === 0, issues: uniqueIssues };
}

export function validateReadiness(snapshot: SolverSnapshot): ReadinessResult {
  return snapshot.schemaVersion === 1
    ? validateLegacyReadiness(snapshot)
    : validateSupervisorReadiness(snapshot);
}

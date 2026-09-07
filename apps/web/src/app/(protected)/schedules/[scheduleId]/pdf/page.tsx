import { getDatabase, type SolverSnapshot } from "@school-timetable/database";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Fragment } from "react";
import { z } from "zod";

import { PrintButton } from "@/components/print-button";
import { buttonClass } from "@/components/setup-ui";
import { verifySession } from "@/lib/auth/dal";
import {
  assignmentSessionLabel,
  classBreakLabel,
  classSessionLabel,
} from "@/lib/session-times";

const paramsSchema = z.object({ scheduleId: z.uuid() });
const searchSchema = z.object({
  type: z
    .enum([
      "school",
      "class",
      "teacher",
      "teacher-full-time",
      "teacher-part-time",
      "subject-counts",
      "restrictions",
      "shared",
      "summary",
    ])
    .default("school"),
  entity: z.uuid().optional(),
});

type ScheduleAssignment = {
  id: string;
  teachingRequirementId: string;
  classSectionId: string;
  teacherId: string;
  startDayIndex: number | null;
  startPeriodIndex: number | null;
  durationPeriods: number;
  isLocked: boolean;
  classSection: {
    id: string;
    grade: string;
    sectionName: string;
    shortCode: string;
  };
  teacher: {
    id: string;
    name: string;
    employmentType: "FULL_TIME" | "PART_TIME";
    weeklyTeachingSessions: number;
    maxLessonsPerDay: number | null;
    maxConsecutiveLessons: number | null;
  };
  teachingRequirement: {
    sharedTeachingGroupId: string | null;
    subject: { name: string; shortCode: string };
    sharedTeachingGroup: {
      members: { classSection: { shortCode: string } }[];
    } | null;
  };
};
type RuleBriefMainSubject = {
  subjectName: string;
  hasConsecutivePair: boolean;
};
type RuleBriefTripleSubject = {
  dayName: string;
  subjectName: string;
  sessions: number[];
};
type ClassRuleBrief = {
  maxSocialStudiesPerDay: number;
  mainSubjects: RuleBriefMainSubject[];
  tripleSubjects: RuleBriefTripleSubject[];
};

type ExportType = z.infer<typeof searchSchema>["type"];
type ExportEntity = {
  id: string;
  name: string;
  shortCode?: string;
  employmentType?: "FULL_TIME" | "PART_TIME";
};
type AvailabilityNote = {
  entityId: string;
  dayIndex: number;
  periodIndex: number;
  state: "AVAILABLE" | "PREFERRED" | "DISLIKED" | "UNAVAILABLE";
  reason: string | null;
};
type Day = { dayIndex: number; name: string };
type Period = {
  id: string;
  periodIndex: number;
  name: string;
  isTeaching: boolean;
};
type SubjectCountRow = {
  classCode: string;
  displayOrder: number;
  sectionLabel: string;
  subjectName: string;
  weeklySessions: number;
};
type RestrictionRow = {
  teacherName: string;
  employmentType: "FULL_TIME" | "PART_TIME";
  weeklyTeachingSessions: number;
  maxLessonsPerDay: number | null;
  maxConsecutiveLessons: number | null;
  notes: AvailabilityNote[];
};
type SharedSessionRow = {
  teacherName: string;
  subjectName: string;
  weeklySessions: number;
  classes: string[];
};
type SummaryIssueRow = {
  classCode?: string;
  teacherName?: string;
  dayName: string;
  subjectName?: string;
  value: string;
  situation: string;
};
type SummarySection = {
  title: string;
  limit: string;
  rows: SummaryIssueRow[];
};

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  return Array.from(new Map(items.map((item) => [item.id, item])).values());
}

function downloadHref(
  scheduleId: string,
  query: { type: ExportType; entity?: string },
) {
  const params = new URLSearchParams({ type: query.type });
  if (query.entity) params.set("entity", query.entity);
  return `/schedules/${scheduleId}/pdf/download?${params.toString()}`;
}

function formatSessionList(sessions: number[]): string {
  return sessions.length > 0
    ? sessions.map((session) => `S${String(session)}`).join(", ")
    : "None";
}

const baseSocialStudyNames = new Set([
  "history",
  "geography",
  "civics",
  "religion",
  "تاريخ",
  "جغرافيا",
  "تربية",
  "دين",
]);
const upperSecondarySocialStudyNames = new Set([
  "sociology",
  "social studies",
  "economics",
  "philosophy",
  "اجتماع",
  "اقتصاد",
  "فلسفة",
]);
const baseSocialStudyCodes = new Set([
  "HISTORY",
  "GEOGRAPHY",
  "CIVICS",
  "RELIGION",
  "S016",
  "S017",
  "S005",
  "S001",
]);
const upperSecondarySocialStudyCodes = new Set([
  "SOCIOLOGY",
  "SOCIAL_STUDIES",
  "ECONOMICS",
  "PHILOSOPHY",
  "S013",
  "S014",
  "S019",
]);

function subjectKey(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]+/gu, "_")
    .replace(/^_+|_+$/gu, "");
}

function subjectLabel(value: string): string {
  return value.toLocaleLowerCase().trim().replace(/\s+/gu, " ");
}

function isGradeTenOrEleven(classSection: ScheduleAssignment["classSection"]) {
  return [classSection.grade, classSection.shortCode, classSection.sectionName]
    .filter((value) => value.length > 0)
    .some((value) =>
      ["G10", "G11"].some((prefix) => subjectKey(value).startsWith(prefix)),
    );
}

function gradeNumber(classSection: ScheduleAssignment["classSection"]) {
  const grade = /G(\d+)/u.exec(classSection.grade)?.[1];
  if (grade) return Number(grade);
  const elementary = /EB(\d+)/u.exec(classSection.grade)?.[1];
  if (elementary) return Number(elementary);
  const shortCode = /^(\d+)/u.exec(classSection.shortCode)?.[1];
  return shortCode ? Number(shortCode) : null;
}

function isGradeOneThroughNine(classSection: ScheduleAssignment["classSection"]) {
  const grade = gradeNumber(classSection);
  return grade !== null && grade >= 1 && grade <= 9;
}

function isClassCode(assignment: ScheduleAssignment, classCodes: string[]) {
  return classCodes.includes(assignment.classSection.shortCode);
}

function isSocialStudiesSubject(assignment: ScheduleAssignment): boolean {
  const subject = assignment.teachingRequirement.subject;
  const code = subjectKey(subject.shortCode);
  const nameKey = subjectKey(subject.name);
  const nameLabel = subjectLabel(subject.name);
  const isBase =
    baseSocialStudyCodes.has(code) ||
    baseSocialStudyCodes.has(nameKey) ||
    baseSocialStudyNames.has(nameLabel);
  if (isBase) return true;
  return (
    isGradeTenOrEleven(assignment.classSection) &&
    (upperSecondarySocialStudyCodes.has(code) ||
      upperSecondarySocialStudyCodes.has(nameKey) ||
      upperSecondarySocialStudyNames.has(nameLabel))
  );
}

function hasConsecutivePair(periods: number[]): boolean {
  const ordered = Array.from(new Set(periods)).sort(
    (left, right) => left - right,
  );
  return ordered.some(
    (period, index) => index > 0 && period === ordered[index - 1] + 1,
  );
}

function dayName(dayIndex: number, days: Day[]) {
  return (
    days.find((day) => day.dayIndex === dayIndex)?.name ??
    `Day ${String(dayIndex + 1)}`
  );
}

function sortSummaryRows(left: SummaryIssueRow, right: SummaryIssueRow): number {
  return (
    (left.classCode ?? "").localeCompare(right.classCode ?? "", undefined, {
      numeric: true,
    }) ||
    left.dayName.localeCompare(right.dayName) ||
    (left.teacherName ?? "").localeCompare(right.teacherName ?? "") ||
    (left.subjectName ?? "").localeCompare(right.subjectName ?? "")
  );
}

function buildSummarySections({
  assignments,
  days,
  periodIndexes,
  snapshot,
}: {
  assignments: ScheduleAssignment[];
  days: Day[];
  periodIndexes: number[];
  snapshot: SolverSnapshot;
}): SummarySection[] {
  const requirementById = new Map(
    snapshot.requirements.map((requirement) => [requirement.id, requirement]),
  );
  const sections: SummarySection[] = [];

  const socialRowsFor = ({
    title,
    limit,
    matchesClass,
    maxAllowed,
  }: {
    title: string;
    limit: string;
    matchesClass: (assignment: ScheduleAssignment) => boolean;
    maxAllowed: number;
  }): SummarySection => {
    const byClassDay = new Map<
      string,
      { classCode: string; dayIndex: number; subjects: string[] }
    >();
    for (const assignment of assignments) {
      if (
        assignment.startDayIndex === null ||
        assignment.startPeriodIndex === null ||
        !matchesClass(assignment) ||
        !isSocialStudiesSubject(assignment)
      ) {
        continue;
      }
      const key = `${assignment.classSectionId}:${String(assignment.startDayIndex)}`;
      const row = byClassDay.get(key) ?? {
        classCode: assignment.classSection.shortCode,
        dayIndex: assignment.startDayIndex,
        subjects: [],
      };
      row.subjects.push(
        `${assignment.teachingRequirement.subject.name} S${String(
          assignment.startPeriodIndex + 1,
        )}`,
      );
      byClassDay.set(key, row);
    }
    return {
      title,
      limit,
      rows: Array.from(byClassDay.values())
        .filter((row) => row.subjects.length > maxAllowed)
        .map((row) => ({
          classCode: row.classCode,
          dayName: dayName(row.dayIndex, days),
          subjectName: row.subjects.join(", "),
          value: String(row.subjects.length),
          situation: `${row.classCode} has ${String(
            row.subjects.length,
          )} social-studies sessions on ${dayName(row.dayIndex, days)}.`,
        }))
        .sort(sortSummaryRows),
    };
  };

  sections.push(
    socialRowsFor({
      title: "Grades 1-9 social studies above one per day",
      limit: "Soft target: max 1 per class day",
      matchesClass: (assignment) =>
        isGradeOneThroughNine(assignment.classSection),
      maxAllowed: 1,
    }),
  );

  const mainByRequirement = new Map<
    string,
    {
      classCode: string;
      subjectName: string;
      total: number;
      periodsByDay: Map<number, number[]>;
    }
  >();
  for (const assignment of assignments) {
    if (assignment.startDayIndex === null || assignment.startPeriodIndex === null) {
      continue;
    }
    const requirement = requirementById.get(assignment.teachingRequirementId);
    if (
      snapshot.schemaVersion !== 2 ||
      !requirement ||
      !("isMainSubject" in requirement) ||
      !requirement.isMainSubject
    ) {
      continue;
    }
    const row = mainByRequirement.get(assignment.teachingRequirementId) ?? {
      classCode: assignment.classSection.shortCode,
      subjectName: assignment.teachingRequirement.subject.name,
      total: 0,
      periodsByDay: new Map<number, number[]>(),
    };
    const periods = row.periodsByDay.get(assignment.startDayIndex) ?? [];
    for (let offset = 0; offset < assignment.durationPeriods; offset += 1) {
      periods.push(assignment.startPeriodIndex + offset);
      row.total += 1;
    }
    row.periodsByDay.set(assignment.startDayIndex, periods);
    mainByRequirement.set(assignment.teachingRequirementId, row);
  }
  sections.push({
    title: "Main subjects missing a weekly consecutive pair",
    limit: "Soft target: at least one 2-session consecutive pair per week",
    rows: Array.from(mainByRequirement.values())
      .filter(
        (row) =>
          row.total >= 2 &&
          !Array.from(row.periodsByDay.values()).some(hasConsecutivePair),
      )
      .map((row) => ({
        classCode: row.classCode,
        dayName: "Week",
        subjectName: row.subjectName,
        value: "No pair",
        situation: `${row.classCode} ${row.subjectName} has no consecutive pair this week.`,
      }))
      .sort(sortSummaryRows),
  });

  const subjectDayRows = new Map<
    string,
    {
      classCode: string;
      dayIndex: number;
      subjectName: string;
      periods: number[];
    }
  >();
  for (const assignment of assignments) {
    if (assignment.startDayIndex === null || assignment.startPeriodIndex === null) {
      continue;
    }
    const key = `${assignment.classSectionId}:${assignment.teachingRequirement.subject.name}:${String(
      assignment.startDayIndex,
    )}`;
    const row = subjectDayRows.get(key) ?? {
      classCode: assignment.classSection.shortCode,
      dayIndex: assignment.startDayIndex,
      subjectName: assignment.teachingRequirement.subject.name,
      periods: [],
    };
    for (let offset = 0; offset < assignment.durationPeriods; offset += 1) {
      row.periods.push(assignment.startPeriodIndex + offset + 1);
    }
    subjectDayRows.set(key, row);
  }
  sections.push({
    title: "Same subject 3 or more sessions in one day",
    limit: "Soft target: avoid 3+ sessions of one subject in a class day",
    rows: Array.from(subjectDayRows.values())
      .filter((row) => row.periods.length >= 3)
      .map((row) => ({
        classCode: row.classCode,
        dayName: dayName(row.dayIndex, days),
        subjectName: row.subjectName,
        value: formatSessionList(row.periods.sort((left, right) => left - right)),
        situation: `${row.classCode} has ${row.subjectName} ${String(
          row.periods.length,
        )} times on ${dayName(row.dayIndex, days)}.`,
      }))
      .sort(sortSummaryRows),
  });

  const teacherDayRows = new Map<
    string,
    {
      teacherName: string;
      dayIndex: number;
      periods: Set<number>;
      classes: Set<string>;
    }
  >();
  for (const assignment of assignments) {
    if (assignment.startDayIndex === null || assignment.startPeriodIndex === null) {
      continue;
    }
    const key = `${assignment.teacherId}:${String(assignment.startDayIndex)}`;
    const row = teacherDayRows.get(key) ?? {
      teacherName: assignment.teacher.name,
      dayIndex: assignment.startDayIndex,
      periods: new Set<number>(),
      classes: new Set<string>(),
    };
    for (let offset = 0; offset < assignment.durationPeriods; offset += 1) {
      row.periods.add(assignment.startPeriodIndex + offset);
    }
    row.classes.add(assignment.classSection.shortCode);
    teacherDayRows.set(key, row);
  }
  sections.push({
    title: "Teacher daily gaps above two",
    limit: "Hard check: max 2 internal free sessions per teacher day",
    rows: Array.from(teacherDayRows.values())
      .map((row) => {
        const occupied = row.periods;
        const ordered = Array.from(occupied).sort((left, right) => left - right);
        const first = ordered[0];
        const last = ordered[ordered.length - 1];
        const gaps =
          first === undefined || last === undefined
            ? 0
            : periodIndexes.filter(
                (period) =>
                  first < period && period < last && !occupied.has(period),
              ).length;
        return { ...row, gaps };
      })
      .filter((row) => row.gaps > 2)
      .map((row) => ({
        teacherName: row.teacherName,
        dayName: dayName(row.dayIndex, days),
        value: `${String(row.gaps)} gaps`,
        situation: `${row.teacherName} has ${String(row.gaps)} gaps on ${dayName(
          row.dayIndex,
          days,
        )}. Classes: ${Array.from(row.classes).sort().join(", ")}`,
      }))
      .sort(sortSummaryRows),
  });

  sections.push(
    socialRowsFor({
      title: "Grade 10/11 social studies above two per day",
      limit: "Hard rule: max 2 social-studies group sessions per class day",
      matchesClass: (assignment) => isGradeTenOrEleven(assignment.classSection),
      maxAllowed: 2,
    }),
  );

  sections.push(
    socialRowsFor({
      title: "ES/SE social studies above three per day",
      limit: "Future generation rule target: max 3 social-studies sessions per class day",
      matchesClass: (assignment) => isClassCode(assignment, ["ES", "SE"]),
      maxAllowed: 3,
    }),
  );

  sections.push(
    socialRowsFor({
      title: "LS/SV social studies above one per day",
      limit: "Future generation rule target: max 1 social-studies session per class day",
      matchesClass: (assignment) => isClassCode(assignment, ["LS", "SV"]),
      maxAllowed: 1,
    }),
  );

  return sections;
}

function buildClassRuleBrief({
  classSectionId,
  assignments,
  days,
  snapshot,
}: {
  classSectionId: string;
  assignments: ScheduleAssignment[];
  days: Day[];
  snapshot: SolverSnapshot;
}): ClassRuleBrief {
  const requirementById = new Map(
    snapshot.requirements.map((requirement) => [requirement.id, requirement]),
  );
  const dayNameByIndex = new Map(days.map((day) => [day.dayIndex, day.name]));
  const socialStudyCountsByDay = new Map<number, number>();
  const periodsBySubjectDay = new Map<
    string,
    { dayIndex: number; subjectName: string; periods: number[] }
  >();
  const periodsByMainRequirementDay = new Map<string, Map<number, number[]>>();
  const mainSubjectByRequirementId = new Map<string, string>();

  for (const assignment of assignments) {
    if (assignment.classSectionId !== classSectionId) continue;
    const requirement = requirementById.get(assignment.teachingRequirementId);
    const periods = Array.from(
      { length: assignment.durationPeriods },
      (_, offset) => (assignment.startPeriodIndex ?? 0) + offset,
    );

    if (isSocialStudiesSubject(assignment) && assignment.startDayIndex !== null) {
      socialStudyCountsByDay.set(
        assignment.startDayIndex,
        (socialStudyCountsByDay.get(assignment.startDayIndex) ?? 0) +
          periods.length,
      );
    }

    if (assignment.startDayIndex !== null) {
      const subjectDayKey = `${assignment.teachingRequirement.subject.name}:${String(
        assignment.startDayIndex,
      )}`;
      const subjectDay = periodsBySubjectDay.get(subjectDayKey) ?? {
        dayIndex: assignment.startDayIndex,
        subjectName: assignment.teachingRequirement.subject.name,
        periods: [],
      };
      subjectDay.periods.push(...periods);
      periodsBySubjectDay.set(subjectDayKey, subjectDay);
    }

    if (
      snapshot.schemaVersion === 2 &&
      requirement &&
      "isMainSubject" in requirement &&
      requirement.isMainSubject &&
      assignment.startDayIndex !== null
    ) {
      mainSubjectByRequirementId.set(
        assignment.teachingRequirementId,
        assignment.teachingRequirement.subject.name,
      );
      const daysByRequirement =
        periodsByMainRequirementDay.get(assignment.teachingRequirementId) ??
        new Map<number, number[]>();
      const dailyPeriods = daysByRequirement.get(assignment.startDayIndex) ?? [];
      dailyPeriods.push(...periods);
      daysByRequirement.set(assignment.startDayIndex, dailyPeriods);
      periodsByMainRequirementDay.set(
        assignment.teachingRequirementId,
        daysByRequirement,
      );
    }
  }

  const mainSubjects = Array.from(periodsByMainRequirementDay.entries())
    .map(([requirementId, daysByRequirement]) => {
      const hasConsecutivePair = Array.from(daysByRequirement.values()).some(
        (periods) => {
          const ordered = Array.from(new Set(periods)).sort(
            (left, right) => left - right,
          );
          return ordered.some(
            (period, index) => index > 0 && period === ordered[index - 1] + 1,
          );
        },
      );
      return {
        subjectName:
          mainSubjectByRequirementId.get(requirementId) ?? requirementId,
        hasConsecutivePair,
      };
    })
    .sort((left, right) => left.subjectName.localeCompare(right.subjectName));

  const tripleSubjects = Array.from(periodsBySubjectDay.values())
    .filter((item) => item.periods.length >= 3)
    .map((item) => ({
      dayName:
        dayNameByIndex.get(item.dayIndex) ?? `Day ${String(item.dayIndex + 1)}`,
      subjectName: item.subjectName,
      sessions: Array.from(new Set(item.periods))
        .sort((left, right) => left - right)
        .map((period) => period + 1),
    }))
    .sort(
      (left, right) =>
        left.dayName.localeCompare(right.dayName) ||
        left.subjectName.localeCompare(right.subjectName),
    );

  return {
    maxSocialStudiesPerDay:
      socialStudyCountsByDay.size > 0
        ? Math.max(...socialStudyCountsByDay.values())
        : 0,
    mainSubjects,
    tripleSubjects,
  };
}

function formatAvailabilityByDay({
  days,
  periodIndexes,
  notes,
  mode,
}: {
  days: Day[];
  periodIndexes: number[];
  notes: AvailabilityNote[];
  mode: "available" | "unavailable";
}): string {
  const unavailable = new Set(
    notes
      .filter((note) => note.state === "UNAVAILABLE")
      .map((note) => `${String(note.dayIndex)}:${String(note.periodIndex)}`),
  );
  const parts = days.map((day) => {
    const sessions = periodIndexes
      .filter((periodIndex) => {
        const isUnavailable = unavailable.has(
          `${String(day.dayIndex)}:${String(periodIndex)}`,
        );
        return mode === "available" ? !isUnavailable : isUnavailable;
      })
      .map((periodIndex) => periodIndex + 1);
    return `${day.name}: ${formatSessionList(sessions)}`;
  });
  return parts.join("; ");
}

function cycleName(displayOrder: number): string {
  if (displayOrder <= 3) return "Cycle 1";
  if (displayOrder <= 6) return "Cycle 2";
  if (displayOrder <= 9) return "Cycle 3";
  return "Secondary";
}

function sectionRank(sectionLabel: string, classCode: string): number {
  if (sectionLabel === "EB" || classCode.startsWith("EB")) return 0;
  if (sectionLabel === "A" || classCode.endsWith("A")) return 1;
  if (sectionLabel === "B" || classCode.endsWith("B")) return 2;
  if (sectionLabel === "C" || classCode.endsWith("C")) return 3;
  if (sectionLabel === "LS" || classCode === "LS") return 1;
  if (sectionLabel === "ES" || classCode === "ES") return 2;
  if (sectionLabel === "SV" || classCode === "SV") return 3;
  return 10;
}

function subjectCountClassCompare(
  left: Pick<SubjectCountRow, "classCode" | "displayOrder" | "sectionLabel">,
  right: Pick<SubjectCountRow, "classCode" | "displayOrder" | "sectionLabel">,
): number {
  if (left.displayOrder !== right.displayOrder) {
    return left.displayOrder - right.displayOrder;
  }
  const sectionDifference =
    sectionRank(left.sectionLabel, left.classCode) -
    sectionRank(right.sectionLabel, right.classCode);
  return sectionDifference !== 0
    ? sectionDifference
    : left.classCode.localeCompare(right.classCode);
}

function teacherAvailabilitySummary({
  teacher,
  notes,
  days,
  periodIndexes,
}: {
  teacher: ScheduleAssignment["teacher"];
  notes: AvailabilityNote[];
  days: { dayIndex: number; name: string }[];
  periodIndexes: number[];
}): string[] {
  const lines = [
    teacher.employmentType === "PART_TIME"
      ? "Part-time teacher"
      : "Full-time teacher",
    `Declared weekly sessions: ${String(teacher.weeklyTeachingSessions)}`,
  ];
  if (teacher.maxLessonsPerDay !== null) {
    lines.push(
      `Hard max per day: ${String(teacher.maxLessonsPerDay)} sessions`,
    );
  }
  if (teacher.maxConsecutiveLessons !== null) {
    lines.push(
      `Hard max consecutive: ${String(teacher.maxConsecutiveLessons)} sessions`,
    );
  }

  if (notes.some((note) => note.state === "UNAVAILABLE")) {
    lines.push(
      teacher.employmentType === "PART_TIME"
        ? `Available: ${formatAvailabilityByDay({
            days,
            periodIndexes,
            notes,
            mode: "available",
          })}`
        : `Unavailable: ${formatAvailabilityByDay({
            days,
            periodIndexes,
            notes,
            mode: "unavailable",
          })}`,
    );
  }

  const softNotes = notes
    .filter((note) => note.state === "PREFERRED" || note.state === "DISLIKED")
    .map((note) => {
      const day = days.find((item) => item.dayIndex === note.dayIndex);
      const label = note.state === "PREFERRED" ? "Preferred" : "Avoid";
      return `${label}: ${day?.name ?? `Day ${String(note.dayIndex + 1)}`} S${String(
        note.periodIndex + 1,
      )}${note.reason ? ` (${note.reason})` : ""}`;
    });
  return [...lines, ...softNotes];
}

function assignmentCell(
  assignment: ScheduleAssignment | undefined,
  snapshot: SolverSnapshot,
  type: "class" | "teacher",
) {
  if (!assignment) return <span className="pdf-empty">Free</span>;
  if (type === "teacher") {
    const sharedClasses =
      assignment.teachingRequirement.sharedTeachingGroup?.members
        .map((member) => member.classSection.shortCode)
        .sort((left, right) => left.localeCompare(right)) ?? [];
    return (
      <div className="pdf-lesson">
        <strong>{assignment.teachingRequirement.subject.name}</strong>
        <span className={sharedClasses.length > 1 ? "pdf-shared-label" : ""}>
          {sharedClasses.length > 1
            ? `Shared: ${sharedClasses.join(" + ")}`
            : assignment.classSection.shortCode}
        </span>
        <small>
          {assignmentSessionLabel(
            snapshot,
            assignment.teachingRequirementId,
            assignment.startPeriodIndex ?? 0,
            assignment.durationPeriods,
          )}
        </small>
      </div>
    );
  }
  return (
    <div className="pdf-lesson">
      <strong>{assignment.teachingRequirement.subject.name}</strong>
      <span>{assignment.teacher.name}</span>
      {assignment.isLocked ? <small>Locked</small> : null}
    </div>
  );
}

function wholeSchoolCell(
  assignment: ScheduleAssignment,
  snapshot: SolverSnapshot,
) {
  return (
    <div className="pdf-school-lesson">
      <strong>
        {assignment.classSection.shortCode} -{" "}
        {assignment.teachingRequirement.subject.name}
      </strong>
      <span>{assignment.teacher.name}</span>
      <small>
        {assignmentSessionLabel(
          snapshot,
          assignment.teachingRequirementId,
          assignment.startPeriodIndex ?? 0,
          assignment.durationPeriods,
        )}
      </small>
    </div>
  );
}

function WholeSchoolGrid({
  days,
  periods,
  assignments,
  snapshot,
}: {
  days: Day[];
  periods: Period[];
  assignments: ScheduleAssignment[];
  snapshot: SolverSnapshot;
}) {
  return (
    <section className="pdf-school-page">
      <table className="pdf-school-grid">
        <thead>
          <tr>
            <th className="pdf-school-period">Period</th>
            {days.map((day) => (
              <th key={day.dayIndex}>{day.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {periods.map((period) => (
            <tr key={period.id}>
              <th className="pdf-school-period">{period.name}</th>
              {days.map((day) => {
                const cellAssignments = assignments.filter(
                  (assignment) =>
                    assignment.startDayIndex === day.dayIndex &&
                    assignment.startPeriodIndex === period.periodIndex,
                );
                return (
                  <td
                    className={period.isTeaching ? "" : "pdf-school-muted"}
                    key={`${period.id}:${String(day.dayIndex)}`}
                  >
                    <div className="pdf-school-stack">
                      {cellAssignments.map((assignment) => (
                        <Fragment key={assignment.id}>
                          {wholeSchoolCell(assignment, snapshot)}
                        </Fragment>
                      ))}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Timetable({
  title,
  subtitle,
  days,
  periodIndexes,
  assignments,
  snapshot,
  type,
  classSectionId,
  notes,
  ruleBrief,
}: {
  title: string;
  subtitle?: string;
  days: { dayIndex: number; name: string }[];
  periodIndexes: number[];
  assignments: ScheduleAssignment[];
  snapshot: SolverSnapshot;
  type: "class" | "teacher";
  classSectionId?: string;
  notes?: string[];
  ruleBrief?: ClassRuleBrief;
}) {
  const breakLabel =
    type === "class" && classSectionId
      ? classBreakLabel(snapshot, classSectionId)
      : null;
  const breakAfter =
    snapshot.schemaVersion === 2 && classSectionId
      ? (snapshot.classSections.find((item) => item.id === classSectionId)
          ?.recessAfterSession ?? snapshot.weekConfiguration?.breakAfterSession)
      : null;

  return (
    <section className="pdf-page">
      <header className="pdf-page-header">
        <div>
          <h2>{title}</h2>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
      </header>
      <table className="pdf-grid">
        <thead>
          <tr>
            <th>Session</th>
            {days.map((day) => (
              <th key={day.dayIndex}>{day.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {periodIndexes.map((periodIndex) => (
            <Fragment key={`session-${String(periodIndex)}`}>
              <tr>
                <th>
                  <span>Session {String(periodIndex + 1)}</span>
                  {type === "class" && classSectionId ? (
                    <small>
                      {classSessionLabel(snapshot, classSectionId, periodIndex)}
                    </small>
                  ) : null}
                </th>
                {days.map((day) => {
                  const assignment = assignments.find(
                    (item) =>
                      item.startDayIndex === day.dayIndex &&
                      item.startPeriodIndex === periodIndex,
                  );
                  return (
                    <td key={`${String(day.dayIndex)}-${String(periodIndex)}`}>
                      {assignmentCell(assignment, snapshot, type)}
                    </td>
                  );
                })}
              </tr>
              {breakLabel && breakAfter === periodIndex + 1 ? (
                <tr className="pdf-break">
                  <th>Break</th>
                  <td colSpan={days.length}>{breakLabel}</td>
                </tr>
              ) : null}
            </Fragment>
          ))}
        </tbody>
      </table>
      {ruleBrief ? (
        <section className="pdf-rule-brief">
          <h3>Schedule rule brief</h3>
          <div className="pdf-rule-brief-grid">
            <div>
              <strong>Max social studies in one day</strong>
              <span>{String(ruleBrief.maxSocialStudiesPerDay)}</span>
            </div>
            <div>
              <strong>Main subjects consecutive pair</strong>
              {ruleBrief.mainSubjects.length > 0 ? (
                <ul>
                  {ruleBrief.mainSubjects.map((subject) => (
                    <li key={subject.subjectName}>
                      {subject.subjectName}:{" "}
                      {subject.hasConsecutivePair ? "Yes" : "No"}
                    </li>
                  ))}
                </ul>
              ) : (
                <span>None</span>
              )}
            </div>
            <div>
              <strong>Same subject 3 sessions in a day</strong>
              {ruleBrief.tripleSubjects.length > 0 ? (
                <ul>
                  {ruleBrief.tripleSubjects.map((item) => (
                    <li
                      key={`${item.dayName}:${item.subjectName}:${item.sessions.join(",")}`}
                    >
                      {item.subjectName} on {item.dayName}:{" "}
                      {formatSessionList(item.sessions)}
                    </li>
                  ))}
                </ul>
              ) : (
                <span>None</span>
              )}
            </div>
          </div>
        </section>
      ) : null}
      {notes && notes.length > 0 ? (
        <footer className="pdf-notes">
          <h3>Teacher notes</h3>
          <dl>
            {notes.map((note) => (
              <div key={note}>
                <dt>{note.includes(":") ? note.split(":")[0] : "Note"}</dt>
                <dd>
                  {note.includes(":")
                    ? note.slice(note.indexOf(":") + 1).trim()
                    : note}
                </dd>
              </div>
            ))}
          </dl>
        </footer>
      ) : null}
    </section>
  );
}

function SubjectCountsReport({
  rows,
  schoolName,
  scheduleName,
}: {
  rows: SubjectCountRow[];
  schoolName: string;
  scheduleName: string;
}) {
  const cycleNames = ["Cycle 1", "Cycle 2", "Cycle 3", "Secondary"];
  return (
    <>
      {cycleNames.map((name) => {
        const cycleRows = rows.filter(
          (row) => cycleName(row.displayOrder) === name,
        );
        if (cycleRows.length === 0) return null;
        const classes = uniqueById(
          cycleRows.map((row) => ({
            id: row.classCode,
            classCode: row.classCode,
            displayOrder: row.displayOrder,
            sectionLabel: row.sectionLabel,
          })),
        ).sort(subjectCountClassCompare);
        const subjectNames = Array.from(
          new Set(cycleRows.map((row) => row.subjectName)),
        ).sort((left, right) => left.localeCompare(right));
        const sessionsBySubjectAndClass = new Map(
          cycleRows.map((row) => [
            `${row.subjectName}:${row.classCode}`,
            row.weeklySessions,
          ]),
        );
        return (
          <section className="pdf-page pdf-report" key={name}>
            <header className="pdf-page-header">
              <div>
                <h2>{name} subject counts</h2>
                <p>
                  {schoolName} - {scheduleName}
                </p>
              </div>
              <span>Sessions per class</span>
            </header>
            <table className="pdf-report-table pdf-subject-counts-table">
              <thead>
                <tr>
                  <th>Subject / Class</th>
                  {classes.map((classSection) => (
                    <th key={classSection.classCode}>
                      {classSection.classCode}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {subjectNames.map((subjectName) => (
                  <tr key={subjectName}>
                    <th>{subjectName}</th>
                    {classes.map((classSection) => (
                      <td key={`${subjectName}:${classSection.classCode}`}>
                        {String(
                          sessionsBySubjectAndClass.get(
                            `${subjectName}:${classSection.classCode}`,
                          ) ?? 0,
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        );
      })}
    </>
  );
}

function RestrictionsReport({
  rows,
  days,
  periodIndexes,
  schoolName,
  scheduleName,
}: {
  rows: RestrictionRow[];
  days: Day[];
  periodIndexes: number[];
  schoolName: string;
  scheduleName: string;
}) {
  return (
    <section className="pdf-page pdf-report">
      <header className="pdf-page-header">
        <div>
          <h2>Teacher restrictions</h2>
          <p>
            {schoolName} - {scheduleName}
          </p>
        </div>
        <span>All teachers</span>
      </header>
      <table className="pdf-report-table">
        <thead>
          <tr>
            <th>Teacher</th>
            <th>Type</th>
            <th>Load</th>
            <th>Hard availability</th>
            <th>Limits</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.teacherName}>
              <td>{row.teacherName}</td>
              <td>
                {row.employmentType === "PART_TIME" ? "Part-time" : "Full-time"}
              </td>
              <td>{String(row.weeklyTeachingSessions)}</td>
              <td>
                {row.notes.some((note) => note.state === "UNAVAILABLE")
                  ? row.employmentType === "PART_TIME"
                    ? `Available: ${formatAvailabilityByDay({
                        days,
                        periodIndexes,
                        notes: row.notes,
                        mode: "available",
                      })}`
                    : `Unavailable: ${formatAvailabilityByDay({
                        days,
                        periodIndexes,
                        notes: row.notes,
                        mode: "unavailable",
                      })}`
                  : "No hard restrictions"}
              </td>
              <td>
                {[
                  row.maxLessonsPerDay === null
                    ? null
                    : `Max/day ${String(row.maxLessonsPerDay)}`,
                  row.maxConsecutiveLessons === null
                    ? null
                    : `Max consecutive ${String(row.maxConsecutiveLessons)}`,
                ]
                  .filter((item): item is string => item !== null)
                  .join("; ") || "None"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function SummaryReport({
  sections,
  schoolName,
  scheduleName,
}: {
  sections: SummarySection[];
  schoolName: string;
  scheduleName: string;
}) {
  return (
    <section className="pdf-page pdf-report">
      <header className="pdf-page-header">
        <div>
          <h2>Schedule summary</h2>
          <p>
            {schoolName} - {scheduleName}
          </p>
        </div>
        <span>Rules watchlist</span>
      </header>
      {sections.map((section) => (
        <section className="pdf-summary-section" key={section.title}>
          <h3>{section.title}</h3>
          <p>{section.limit}</p>
          <table className="pdf-report-table pdf-summary-table">
            <thead>
              <tr>
                <th>Class / Teacher</th>
                <th>Day</th>
                <th>Subject</th>
                <th>Value</th>
                <th>Situation</th>
              </tr>
            </thead>
            <tbody>
              {section.rows.length > 0 ? (
                section.rows.map((row) => (
                  <tr
                    key={`${section.title}:${row.classCode ?? row.teacherName}:${row.dayName}:${row.subjectName ?? row.value}`}
                  >
                    <td>{row.classCode ?? row.teacherName}</td>
                    <td>{row.dayName}</td>
                    <td>{row.subjectName ?? "-"}</td>
                    <td>{row.value}</td>
                    <td>{row.situation}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5}>No issues found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      ))}
    </section>
  );
}

function SharedSessionsReport({
  rows,
  schoolName,
  scheduleName,
}: {
  rows: SharedSessionRow[];
  schoolName: string;
  scheduleName: string;
}) {
  return (
    <section className="pdf-page pdf-report">
      <header className="pdf-page-header">
        <div>
          <h2>Shared sessions</h2>
          <p>
            {schoolName} - {scheduleName}
          </p>
        </div>
        <span>دمج</span>
      </header>
      <table className="pdf-report-table">
        <thead>
          <tr>
            <th>Teacher</th>
            <th>Subject</th>
            <th>Classes</th>
            <th>Sessions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={`${row.teacherName}:${row.subjectName}:${row.classes.join("+")}`}
            >
              <td>{row.teacherName}</td>
              <td>{row.subjectName}</td>
              <td>{row.classes.join(" + ")}</td>
              <td>{String(row.weeklySessions)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export default async function SchedulePdfPage({
  params,
  searchParams,
}: {
  params: Promise<{ scheduleId: string }>;
  searchParams: Promise<{ type?: string; entity?: string }>;
}) {
  const user = await verifySession();
  const { scheduleId } = paramsSchema.parse(await params);
  const query = searchSchema.parse(await searchParams);
  const db = getDatabase();
  const schedule = await db.schedule.findFirst({
    where: { id: scheduleId, schoolId: user.schoolId },
    include: {
      assignments: {
        include: {
          teachingRequirement: {
            include: {
              subject: true,
              sharedTeachingGroup: {
                include: {
                  members: { include: { classSection: true } },
                },
              },
            },
          },
          classSection: true,
          teacher: true,
        },
      },
      term: { include: { days: true, periods: true } },
      school: true,
    },
  });
  if (!schedule) notFound();

  const snapshot = schedule.inputSnapshot as unknown as SolverSnapshot;
  const days = schedule.term.days
    .filter((day) => day.isWorking)
    .sort((left, right) => left.dayIndex - right.dayIndex)
    .map((day) => ({ dayIndex: day.dayIndex, name: day.name }));
  const periodIndexes = snapshot.calendar.periods
    .filter((period) => period.isTeaching)
    .map((period) => period.index)
    .sort((left, right) => left - right);
  const periods: Period[] =
    snapshot.schemaVersion === 2
      ? snapshot.calendar.periods
          .map((period) => ({
            id: period.id,
            periodIndex: period.index,
            name: period.name,
            isTeaching: period.isTeaching,
          }))
          .sort((left, right) => left.periodIndex - right.periodIndex)
      : schedule.term.periods
          .map((period) => ({
            id: period.id,
            periodIndex: period.periodIndex,
            name: period.name,
            isTeaching: period.isTeaching,
          }))
          .sort((left, right) => left.periodIndex - right.periodIndex);
  const teachingSessionIndexByPhysicalPeriod = new Map(
    schedule.term.periods
      .filter((period) => period.isTeaching)
      .sort((left, right) => left.periodIndex - right.periodIndex)
      .map((period, index) => [period.periodIndex, index]),
  );
  const assignments = schedule.assignments.filter(
    (
      item,
    ): item is typeof item & {
      startDayIndex: number;
      startPeriodIndex: number;
    } => item.startDayIndex !== null && item.startPeriodIndex !== null,
  );
  const classEntities: ExportEntity[] = uniqueById(
    assignments.map((assignment) => ({
      id: assignment.classSection.id,
      name: assignment.classSection.sectionName,
      shortCode: assignment.classSection.shortCode,
    })),
  ).sort((left, right) =>
    (left.shortCode ?? left.name).localeCompare(right.shortCode ?? right.name),
  );
  const allTeachers = await db.teacher.findMany({
    where: { schoolId: user.schoolId, isActive: true, deletedAt: null },
    orderBy: { name: "asc" },
  });
  const teacherEntities: ExportEntity[] = allTeachers.map((teacher) => ({
    id: teacher.id,
    name: teacher.name,
    employmentType: teacher.employmentType,
  }));
  const teacherIds =
    (query.type === "teacher" ||
      query.type === "teacher-full-time" ||
      query.type === "teacher-part-time") &&
    query.entity
      ? [query.entity]
      : teacherEntities.map((teacher) => teacher.id);
  const availability = await db.availabilityRule.findMany({
    where: {
      schoolId: user.schoolId,
      termId: schedule.termId,
      entityType: "TEACHER",
      entityId: { in: teacherIds },
    },
    orderBy: [{ entityId: "asc" }, { dayIndex: "asc" }, { periodIndex: "asc" }],
  });
  const availabilityNotes: AvailabilityNote[] = availability
    .map((note) => {
      const sessionIndex = teachingSessionIndexByPhysicalPeriod.get(
        note.periodIndex,
      );
      return sessionIndex === undefined
        ? null
        : {
            entityId: note.entityId,
            dayIndex: note.dayIndex,
            periodIndex: sessionIndex,
            state: note.state,
            reason: note.reason,
          };
    })
    .filter((note): note is AvailabilityNote => note !== null);

  const selectedClasses =
    query.type === "class" && query.entity
      ? classEntities.filter((item) => item.id === query.entity)
      : classEntities;
  const selectedTeachers =
    query.type === "teacher" && query.entity
      ? teacherEntities.filter((item) => item.id === query.entity)
      : query.type === "teacher-full-time"
        ? teacherEntities.filter((item) => item.employmentType === "FULL_TIME")
        : query.type === "teacher-part-time"
          ? teacherEntities.filter(
              (item) => item.employmentType === "PART_TIME",
            )
          : teacherEntities;
  if (
    (query.type === "class" && selectedClasses.length === 0) ||
    (query.type === "teacher" && selectedTeachers.length === 0)
  ) {
    notFound();
  }
  const subjectCountRows: SubjectCountRow[] =
    query.type === "subject-counts"
      ? (
          await db.classCurriculum.findMany({
            where: {
              schoolId: user.schoolId,
              termId: schedule.termId,
              isActive: true,
            },
            include: {
              classSection: { include: { gradeLevel: true } },
              subject: true,
            },
            orderBy: [
              { classSection: { gradeLevel: { displayOrder: "asc" } } },
              { classSection: { shortCode: "asc" } },
              { subject: { name: "asc" } },
            ],
          })
        ).map((row) => ({
          classCode: row.classSection.shortCode,
          displayOrder:
            row.classSection.gradeLevel?.displayOrder ??
            Number(row.classSection.grade.match(/\d+/u)?.[0] ?? 99),
          sectionLabel:
            row.classSection.sectionLabel ?? row.classSection.shortCode,
          subjectName: row.subject.name,
          weeklySessions: row.weeklySessions,
        }))
      : [];
  const restrictionTeachers =
    query.type === "restrictions"
      ? await db.teacher.findMany({
          where: { schoolId: user.schoolId, isActive: true, deletedAt: null },
          orderBy: { name: "asc" },
        })
      : [];
  const restrictionAvailability =
    query.type === "restrictions" && restrictionTeachers.length > 0
      ? await db.availabilityRule.findMany({
          where: {
            schoolId: user.schoolId,
            termId: schedule.termId,
            entityType: "TEACHER",
            entityId: { in: restrictionTeachers.map((teacher) => teacher.id) },
          },
          orderBy: [
            { entityId: "asc" },
            { dayIndex: "asc" },
            { periodIndex: "asc" },
          ],
        })
      : [];
  const restrictionRows: RestrictionRow[] = restrictionTeachers
    .map((teacher) => ({
      teacherName: teacher.name,
      employmentType: teacher.employmentType,
      weeklyTeachingSessions: teacher.weeklyTeachingSessions,
      maxLessonsPerDay: teacher.maxLessonsPerDay,
      maxConsecutiveLessons: teacher.maxConsecutiveLessons,
      notes: restrictionAvailability
        .filter((note) => note.entityId === teacher.id)
        .map((note) => {
          const sessionIndex = teachingSessionIndexByPhysicalPeriod.get(
            note.periodIndex,
          );
          return sessionIndex === undefined
            ? null
            : {
                entityId: note.entityId,
                dayIndex: note.dayIndex,
                periodIndex: sessionIndex,
                state: note.state,
                reason: note.reason,
              };
        })
        .filter((note): note is AvailabilityNote => note !== null),
    }))
    .filter(
      (teacher) =>
        teacher.notes.length > 0 ||
        teacher.maxLessonsPerDay !== null ||
        teacher.maxConsecutiveLessons !== null,
    );
  const sharedSessionRows: SharedSessionRow[] =
    query.type === "shared"
      ? (
          await db.sharedTeachingGroup.findMany({
            where: { schoolId: user.schoolId, termId: schedule.termId },
            include: {
              teacher: true,
              subject: true,
              members: { include: { classSection: true } },
            },
            orderBy: [
              { teacher: { name: "asc" } },
              { subject: { name: "asc" } },
            ],
          })
        ).map((group) => ({
          teacherName: group.teacher.name,
          subjectName: group.subject.name,
          weeklySessions: group.weeklySessions,
          classes: group.members
            .map((member) => member.classSection.shortCode)
            .sort((left, right) => left.localeCompare(right)),
        }))
      : [];
  const titlePrefix =
    query.type === "school"
      ? "Whole School"
      : query.type === "class"
        ? "Class"
        : query.type === "teacher" ||
            query.type === "teacher-full-time" ||
            query.type === "teacher-part-time"
          ? "Teacher"
          : query.type === "subject-counts"
            ? "Subject Counts"
            : query.type === "restrictions"
              ? "Teacher Restrictions"
              : query.type === "summary"
                ? "Summary"
                : "Shared Sessions";
  const downloadLabel =
    query.type === "school"
      ? "Download the best"
      : query.entity
        ? "Download PDF"
        : query.type === "class"
          ? "Download class PDFs"
          : query.type === "teacher-full-time"
            ? "Download full-time teacher PDFs"
            : query.type === "teacher-part-time"
              ? "Download part-time teacher PDFs"
              : query.type === "teacher"
                ? "Download teacher PDFs"
                : query.type === "summary"
                  ? "Download summary"
                : "Download PDF";
  const browserTitle = `${schedule.school.name} - ${schedule.name} v${String(
    schedule.version,
  )} - ${titlePrefix} timetable`;
  const hasPdfBranding = query.type !== "school";

  return (
    <main
      className={
        hasPdfBranding ? "pdf-export pdf-export-branded" : "pdf-export"
      }
    >
      <title>{browserTitle}</title>
      <style>{`
        @page { size: A4 landscape; margin: 8mm; }
        .pdf-toolbar { align-items: center; background: #f7f8f5; border-bottom: 1px solid #dce1dc; display: flex; gap: 10px; justify-content: space-between; padding: 14px 18px; }
        .pdf-toolbar h1 { color: #132b24; font-size: 18px; font-weight: 700; margin: 0; }
        .pdf-toolbar p { color: #66706b; font-size: 12px; margin: 4px 0 0; }
        .pdf-actions { display: flex; gap: 8px; }
        .pdf-page { background: white; color: #1d2520; break-after: page; padding: 10mm; }
        .pdf-page:last-child { break-after: auto; }
        .pdf-export-branded .pdf-page { overflow: hidden; position: relative; }
        .pdf-export-branded .pdf-page::after { background: url("/al-massar-logo.png") center / contain no-repeat; bottom: 7mm; content: ""; height: 34mm; opacity: 0.08; pointer-events: none; position: absolute; right: 8mm; width: 34mm; z-index: 0; }
        .pdf-export-branded .pdf-page > * { position: relative; z-index: 1; }
        .pdf-page-header { align-items: end; border-bottom: 2px solid #132b24; display: flex; justify-content: space-between; margin-bottom: 10px; padding-bottom: 8px; }
        .pdf-page-header h2 { font-size: 20px; line-height: 1.2; margin: 0; }
        .pdf-page-header p, .pdf-page-header span { color: #66706b; font-size: 11px; margin: 3px 0 0; }
        .pdf-grid { border-collapse: collapse; table-layout: fixed; width: 100%; }
        .pdf-grid th, .pdf-grid td { border: 1px solid #cfd5d1; padding: 6px; vertical-align: top; }
        .pdf-grid thead th { background: #132b24; color: white; font-size: 11px; font-weight: 700; text-align: center; }
        .pdf-grid tbody th { background: #f0f2ef; width: 130px; }
        .pdf-grid tbody th span { display: block; font-size: 12px; font-weight: 700; }
        .pdf-grid tbody th small { color: #66706b; display: block; font-size: 9px; font-weight: 500; margin-top: 3px; }
        .pdf-grid td { height: 62px; }
        .pdf-lesson { background: #edf6f2; border-left: 3px solid #0e6b4f; min-height: 44px; padding: 5px; }
        .pdf-lesson strong { display: block; font-size: 11px; line-height: 1.25; }
        .pdf-lesson span { display: block; font-size: 10px; line-height: 1.3; margin-top: 2px; }
        .pdf-lesson .pdf-shared-label { color: #0e6b4f; font-weight: 700; }
        .pdf-lesson small { color: #516159; display: block; font-size: 8px; line-height: 1.25; margin-top: 3px; }
        .pdf-empty { color: #9ba59f; font-size: 10px; }
        .pdf-break th, .pdf-break td { background: #fff6db; color: #72520a; font-size: 11px; font-weight: 700; height: auto; text-align: center; }
        .pdf-rule-brief { border-top: 1px solid #dce1dc; margin-top: 10px; padding-top: 8px; page-break-inside: avoid; }
        .pdf-rule-brief h3 { color: #132b24; font-size: 12px; margin: 0 0 6px; }
        .pdf-rule-brief-grid { display: grid; gap: 8px; grid-template-columns: 0.8fr 1.2fr 1.4fr; }
        .pdf-rule-brief-grid > div { background: #f7f8f5; border: 1px solid #dce1dc; padding: 6px; }
        .pdf-rule-brief strong { color: #132b24; display: block; font-size: 9px; margin-bottom: 4px; }
        .pdf-rule-brief span, .pdf-rule-brief li { font-size: 9px; line-height: 1.35; }
        .pdf-rule-brief ul { margin: 0; padding-left: 14px; }
        .pdf-notes { border-top: 1px solid #dce1dc; margin-top: 10px; padding-top: 8px; page-break-inside: avoid; }
        .pdf-notes h3 { font-size: 12px; margin: 0 0 5px; }
        .pdf-notes dl { display: grid; font-size: 9px; gap: 4px 14px; grid-template-columns: 120px minmax(0, 1fr); line-height: 1.35; margin: 0; }
        .pdf-notes div { display: contents; }
        .pdf-notes dt { color: #132b24; font-weight: 700; white-space: nowrap; }
        .pdf-notes dd { margin: 0; overflow-wrap: anywhere; }
        .pdf-report-table { border-collapse: collapse; font-size: 10px; table-layout: fixed; width: 100%; }
        .pdf-report-table th, .pdf-report-table td { border: 1px solid #cfd5d1; padding: 5px 6px; text-align: left; vertical-align: top; word-break: normal; overflow-wrap: anywhere; }
        .pdf-report-table th { background: #132b24; color: white; font-weight: 700; }
        .pdf-report-table tbody tr:nth-child(even) td { background: #f7f8f5; }
        .pdf-report-table td:last-child, .pdf-report-table th:last-child { text-align: center; }
        .pdf-subject-counts-table { font-size: 9px; table-layout: auto; }
        .pdf-subject-counts-table th, .pdf-subject-counts-table td { padding: 4px 5px; text-align: center; }
        .pdf-subject-counts-table th:first-child { min-width: 110px; text-align: left; }
        .pdf-subject-counts-table tbody th { white-space: nowrap; }
        .pdf-summary-section { break-inside: avoid; margin-top: 12px; }
        .pdf-summary-section h3 { color: #132b24; font-size: 13px; margin: 0 0 3px; }
        .pdf-summary-section p { color: #66706b; font-size: 10px; margin: 0 0 6px; }
        .pdf-summary-table { font-size: 9px; table-layout: auto; }
        .pdf-summary-table th:nth-child(1) { width: 95px; }
        .pdf-summary-table th:nth-child(2) { width: 78px; }
        .pdf-summary-table th:nth-child(3) { width: 160px; }
        .pdf-summary-table th:nth-child(4) { width: 80px; }
        .pdf-summary-table td:last-child, .pdf-summary-table th:last-child { text-align: left; }
        .pdf-report .pdf-page-header { margin-bottom: 12px; }
        .pdf-school-page { background: white; color: #1d2520; padding: 0; }
        .pdf-school-grid { border-collapse: collapse; table-layout: fixed; width: 100%; }
        .pdf-school-grid th, .pdf-school-grid td { border: 1px solid #dce1dc; padding: 6px; vertical-align: top; }
        .pdf-school-grid thead th { background: #f0f2ef; color: #050505; font-size: 10px; font-weight: 800; text-align: center; }
        .pdf-school-period { width: 86px; }
        .pdf-school-grid tbody th { background: #fbfbf9; font-size: 10px; font-weight: 800; text-align: left; }
        .pdf-school-grid td { min-height: 90px; }
        .pdf-school-muted { background: #f3f4f2; }
        .pdf-school-stack { display: grid; gap: 4px; }
        .pdf-school-lesson { background: #edf6f2; border-left: 2px solid #0e6b4f; min-height: 38px; padding: 5px; }
        .pdf-school-lesson strong { display: block; font-size: 8px; line-height: 1.2; overflow-wrap: anywhere; }
        .pdf-school-lesson span { color: #1d2520; display: block; font-size: 7px; line-height: 1.25; margin-top: 2px; overflow-wrap: anywhere; }
        .pdf-school-lesson small { color: #516159; display: block; font-size: 6.5px; line-height: 1.2; margin-top: 2px; }
        @media print {
          body { background: white; }
          body * { visibility: hidden; }
          .pdf-export, .pdf-export * { visibility: visible; }
          .pdf-export { background: white; left: 0; position: absolute; top: 0; width: 100%; }
          .pdf-toolbar { display: none; }
          .pdf-page { box-sizing: border-box; min-height: auto; padding: 0; }
        }
      `}</style>
      <div className="pdf-toolbar print:hidden">
        <div>
          <h1>{titlePrefix} PDF export</h1>
          <p>
            {schedule.school.name} - {schedule.name} v{String(schedule.version)}
          </p>
        </div>
        <div className="pdf-actions">
          <Link className={buttonClass} href={`/schedules/${schedule.id}`}>
            Back
          </Link>
          <Link
            className={buttonClass}
            href={downloadHref(schedule.id, {
              type: query.type,
              entity: query.entity,
            })}
          >
            {downloadLabel}
          </Link>
          <PrintButton />
        </div>
      </div>
      {query.type === "subject-counts" ? (
        <SubjectCountsReport
          rows={subjectCountRows}
          scheduleName={`${schedule.name} v${String(schedule.version)}`}
          schoolName={schedule.school.name}
        />
      ) : null}
      {query.type === "restrictions" ? (
        <RestrictionsReport
          days={days}
          periodIndexes={periodIndexes}
          rows={restrictionRows}
          scheduleName={`${schedule.name} v${String(schedule.version)}`}
          schoolName={schedule.school.name}
        />
      ) : null}
      {query.type === "shared" ? (
        <SharedSessionsReport
          rows={sharedSessionRows}
          scheduleName={`${schedule.name} v${String(schedule.version)}`}
          schoolName={schedule.school.name}
        />
      ) : null}
      {query.type === "summary" ? (
        <SummaryReport
          scheduleName={`${schedule.name} v${String(schedule.version)}`}
          schoolName={schedule.school.name}
          sections={buildSummarySections({
            assignments,
            days,
            periodIndexes,
            snapshot,
          })}
        />
      ) : null}
      {query.type === "school" ? (
        <WholeSchoolGrid
          assignments={assignments}
          days={days}
          periods={periods}
          snapshot={snapshot}
        />
      ) : null}
      {(query.type === "class" ? selectedClasses : []).map((classSection) => {
        const classAssignments = assignments.filter(
          (assignment) => assignment.classSectionId === classSection.id,
        );
        return (
          <Timetable
            assignments={classAssignments}
            classSectionId={classSection.id}
            days={days}
            key={`class-${classSection.id}`}
            periodIndexes={periodIndexes}
            ruleBrief={buildClassRuleBrief({
              assignments: classAssignments,
              classSectionId: classSection.id,
              days,
              snapshot,
            })}
            snapshot={snapshot}
            title={`${classSection.shortCode ?? classSection.name} - Class timetable`}
            type="class"
          />
        );
      })}
      {(query.type === "teacher" ||
      query.type === "teacher-full-time" ||
      query.type === "teacher-part-time"
        ? selectedTeachers
        : []
      ).map((teacher) => {
        const teacherAssignments = assignments.filter(
          (assignment) => assignment.teacherId === teacher.id,
        );
        const teacherRecord = teacherAssignments[0]?.teacher;
        return (
          <Timetable
            assignments={teacherAssignments}
            days={days}
            key={`teacher-${teacher.id}`}
            notes={
              teacherRecord
                ? teacherAvailabilitySummary({
                    teacher: teacherRecord,
                    notes: availabilityNotes.filter(
                      (note) => note.entityId === teacher.id,
                    ),
                    days,
                    periodIndexes,
                  })
                : []
            }
            periodIndexes={periodIndexes}
            snapshot={snapshot}
            title={teacher.name}
            type="teacher"
          />
        );
      })}
    </main>
  );
}

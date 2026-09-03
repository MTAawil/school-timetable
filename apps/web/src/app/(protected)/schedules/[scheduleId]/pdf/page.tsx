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
  classSection: { id: string; sectionName: string; shortCode: string };
  teacher: {
    id: string;
    name: string;
    employmentType: "FULL_TIME" | "PART_TIME";
    weeklyTeachingSessions: number;
    maxLessonsPerDay: number | null;
    maxConsecutiveLessons: number | null;
  };
  teachingRequirement: { subject: { name: string; shortCode: string } };
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
type SubjectCountRow = {
  className: string;
  classCode: string;
  gradeName: string;
  displayOrder: number;
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
    return (
      <div className="pdf-lesson">
        <strong>{assignment.teachingRequirement.subject.name}</strong>
        <span>{assignment.classSection.shortCode}</span>
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
            <table className="pdf-report-table">
              <thead>
                <tr>
                  <th>Class</th>
                  <th>Grade</th>
                  <th>Subject</th>
                  <th>Sessions</th>
                </tr>
              </thead>
              <tbody>
                {cycleRows.map((row) => (
                  <tr key={`${row.classCode}:${row.subjectName}`}>
                    <td>{row.classCode}</td>
                    <td>{row.gradeName}</td>
                    <td>{row.subjectName}</td>
                    <td>{String(row.weeklySessions)}</td>
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
          teachingRequirement: { include: { subject: true } },
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
          className: row.classSection.sectionName,
          classCode: row.classSection.shortCode,
          gradeName:
            row.classSection.gradeLevel?.name ?? row.classSection.grade,
          displayOrder:
            row.classSection.gradeLevel?.displayOrder ??
            Number(row.classSection.grade.match(/\d+/u)?.[0] ?? 99),
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
              : "Shared Sessions";
  const downloadLabel =
    query.type === "school"
      ? "Download all PDFs"
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
                : "Download PDF";
  const browserTitle = `${schedule.school.name} - ${schedule.name} v${String(
    schedule.version,
  )} - ${titlePrefix} timetable`;

  return (
    <main className="pdf-export">
      <title>{browserTitle}</title>
      <style>{`
        @page { size: A4 landscape; margin: 8mm; }
        .pdf-toolbar { align-items: center; background: #f7f8f5; border-bottom: 1px solid #dce1dc; display: flex; gap: 10px; justify-content: space-between; padding: 14px 18px; }
        .pdf-toolbar h1 { color: #132b24; font-size: 18px; font-weight: 700; margin: 0; }
        .pdf-toolbar p { color: #66706b; font-size: 12px; margin: 4px 0 0; }
        .pdf-actions { display: flex; gap: 8px; }
        .pdf-page { background: white; color: #1d2520; break-after: page; padding: 10mm; }
        .pdf-page:last-child { break-after: auto; }
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
        .pdf-lesson small { color: #516159; display: block; font-size: 8px; line-height: 1.25; margin-top: 3px; }
        .pdf-empty { color: #9ba59f; font-size: 10px; }
        .pdf-break th, .pdf-break td { background: #fff6db; color: #72520a; font-size: 11px; font-weight: 700; height: auto; text-align: center; }
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
        .pdf-report .pdf-page-header { margin-bottom: 12px; }
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
      {(query.type === "school" || query.type === "class"
        ? selectedClasses
        : []
      ).map((classSection) => (
        <Timetable
          assignments={assignments.filter(
            (assignment) => assignment.classSectionId === classSection.id,
          )}
          classSectionId={classSection.id}
          days={days}
          key={`class-${classSection.id}`}
          periodIndexes={periodIndexes}
          snapshot={snapshot}
          title={`${classSection.shortCode ?? classSection.name} - Class timetable`}
          type="class"
        />
      ))}
      {(query.type === "school" ||
      query.type === "teacher" ||
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

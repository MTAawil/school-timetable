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
  type: z.enum(["school", "class", "teacher"]).default("school"),
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

type ExportEntity = { id: string; name: string; shortCode?: string };
type AvailabilityNote = {
  entityId: string;
  dayIndex: number;
  periodIndex: number;
  state: "AVAILABLE" | "PREFERRED" | "DISLIKED" | "UNAVAILABLE";
  reason: string | null;
};

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  return Array.from(new Map(items.map((item) => [item.id, item])).values());
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

  const noteKey = (dayIndex: number, periodIndex: number) =>
    `${String(dayIndex)}:${String(periodIndex)}`;
  const unavailable = new Set(
    notes
      .filter((note) => note.state === "UNAVAILABLE")
      .map((note) => noteKey(note.dayIndex, note.periodIndex)),
  );
  if (unavailable.size > 0) {
    const availableByDay = days
      .map((day) => {
        const sessions = periodIndexes
          .filter(
            (periodIndex) =>
              !unavailable.has(noteKey(day.dayIndex, periodIndex)),
          )
          .map((periodIndex) => String(periodIndex + 1));
        return sessions.length > 0
          ? `${day.name}: S${sessions.join(", S")}`
          : null;
      })
      .filter((line): line is string => line !== null);
    lines.push(
      availableByDay.length > 0
        ? `Hard availability: ${availableByDay.join("; ")}`
        : "Hard availability: no teaching slots available",
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
  subtitle: string;
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
          <p>{subtitle}</p>
        </div>
        <span>Weekly timetable</span>
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
          <ul>
            {notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </footer>
      ) : null}
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
      term: { include: { days: true } },
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
  const teacherEntities: ExportEntity[] = uniqueById(
    assignments.map((assignment) => ({
      id: assignment.teacher.id,
      name: assignment.teacher.name,
    })),
  ).sort((left, right) => left.name.localeCompare(right.name));
  const teacherIds =
    query.type === "teacher" && query.entity
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
  const availabilityNotes: AvailabilityNote[] = availability.map((note) => ({
    entityId: note.entityId,
    dayIndex: note.dayIndex,
    periodIndex: note.periodIndex,
    state: note.state,
    reason: note.reason,
  }));

  const selectedClasses =
    query.type === "class" && query.entity
      ? classEntities.filter((item) => item.id === query.entity)
      : classEntities;
  const selectedTeachers =
    query.type === "teacher" && query.entity
      ? teacherEntities.filter((item) => item.id === query.entity)
      : teacherEntities;
  if (
    (query.type === "class" && selectedClasses.length === 0) ||
    (query.type === "teacher" && selectedTeachers.length === 0)
  ) {
    notFound();
  }
  const titlePrefix =
    query.type === "school"
      ? "Whole School"
      : query.type === "class"
        ? "Class"
        : "Teacher";

  return (
    <main className="pdf-export">
      <style>{`
        @page { size: A4 landscape; margin: 10mm; }
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
        .pdf-notes { border-top: 1px solid #dce1dc; margin-top: 10px; padding-top: 8px; }
        .pdf-notes h3 { font-size: 12px; margin: 0 0 5px; }
        .pdf-notes ul { display: grid; font-size: 9px; gap: 3px 18px; grid-template-columns: repeat(2, minmax(0, 1fr)); line-height: 1.45; margin: 0; padding-left: 16px; }
        @media print {
          body { background: white; }
          body * { visibility: hidden; }
          .pdf-export, .pdf-export * { visibility: visible; }
          .pdf-export { background: white; left: 0; position: absolute; top: 0; width: 100%; }
          .pdf-toolbar { display: none; }
          .pdf-page { padding: 0; }
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
          <PrintButton />
        </div>
      </div>
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
          subtitle={`${schedule.school.name} - ${schedule.name} v${String(schedule.version)}`}
          title={`${classSection.shortCode ?? classSection.name} - Class timetable`}
          type="class"
        />
      ))}
      {(query.type === "school" || query.type === "teacher"
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
            subtitle={`${schedule.school.name} - ${schedule.name} v${String(schedule.version)}`}
            title={`${teacher.name} - Teacher timetable`}
            type="teacher"
          />
        );
      })}
    </main>
  );
}

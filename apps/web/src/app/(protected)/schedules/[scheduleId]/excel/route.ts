import { getDatabase, type SolverSnapshot } from "@school-timetable/database";
import { NextResponse } from "next/server";
import { z } from "zod";

import { verifySession } from "@/lib/auth/dal";
import { assignmentSessionLabel } from "@/lib/session-times";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const paramsSchema = z.object({ scheduleId: z.uuid() });

type ExportAssignment = {
  id: string;
  teachingRequirementId: string;
  startDayIndex: number | null;
  startPeriodIndex: number | null;
  durationPeriods: number;
  classSection: { shortCode: string };
  teacher: { name: string };
  teachingRequirement: { subject: { name: string } };
};

function neutralizeSpreadsheetFormula(value: string): string {
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

function htmlCell(value: string | number | null): string {
  const text = neutralizeSpreadsheetFormula(
    value === null ? "" : String(value),
  );
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("\r", " ")
    .replaceAll("\n", "<br />");
}

function assignmentText(
  assignment: ExportAssignment,
  snapshot: SolverSnapshot,
): string {
  return [
    `${assignment.classSection.shortCode} - ${assignment.teachingRequirement.subject.name}`,
    assignment.teacher.name,
    assignment.startPeriodIndex === null
      ? ""
      : assignmentSessionLabel(
          snapshot,
          assignment.teachingRequirementId,
          assignment.startPeriodIndex,
          assignment.durationPeriods,
        ),
  ]
    .filter((part) => part.length > 0)
    .join("\n");
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ scheduleId: string }> },
) {
  const user = await verifySession();
  const { scheduleId } = paramsSchema.parse(await context.params);
  const schedule = await getDatabase().schedule.findFirst({
    where: { id: scheduleId, schoolId: user.schoolId },
    include: {
      school: true,
      term: { include: { days: true, periods: true } },
      assignments: {
        include: {
          classSection: true,
          teacher: true,
          teachingRequirement: { include: { subject: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!schedule) {
    return NextResponse.json({ code: "SCHEDULE_NOT_FOUND" }, { status: 404 });
  }

  const snapshot = schedule.inputSnapshot as unknown as SolverSnapshot;
  const days = schedule.term.days
    .filter((day) => day.isWorking)
    .sort((left, right) => left.dayIndex - right.dayIndex);
  const periods =
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
  const rows = periods.map((period) => {
    const cells = days
      .map((day) => {
        const lessons = schedule.assignments
          .filter(
            (assignment) =>
              assignment.startDayIndex === day.dayIndex &&
              assignment.startPeriodIndex === period.periodIndex,
          )
          .map((assignment) => assignmentText(assignment, snapshot))
          .join("\n\n");
        return `<td class="${period.isTeaching ? "lesson-cell" : "muted-cell"}">${htmlCell(
          lessons,
        )}</td>`;
      })
      .join("");
    return `<tr><th>${htmlCell(period.name)}</th>${cells}</tr>`;
  });
  const workbook = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    table { border-collapse: collapse; font-family: Calibri, Arial, sans-serif; table-layout: fixed; width: 100%; }
    caption { font-size: 16px; font-weight: 700; margin-bottom: 8px; text-align: left; }
    th, td { border: 1px solid #dce1dc; padding: 6px; text-align: left; vertical-align: top; white-space: normal; }
    thead th { background: #f0f2ef; font-weight: 800; text-align: center; }
    tbody th { background: #fbfbf9; font-weight: 800; width: 95px; }
    td { min-width: 180px; }
    .lesson-cell { background: #edf6f2; color: #1d2520; }
    .muted-cell { background: #f3f4f2; color: #66706b; }
  </style>
</head>
<body>
  <table>
    <caption>${htmlCell(schedule.school.name)} - ${htmlCell(
      schedule.name,
    )} v${htmlCell(schedule.version)} - the best excel</caption>
    <thead>
      <tr>
        <th>Period</th>
        ${days.map((day) => `<th>${htmlCell(day.name)}</th>`).join("")}
      </tr>
    </thead>
    <tbody>${rows.join("")}</tbody>
  </table>
</body>
</html>`;

  return new NextResponse(`\uFEFF${workbook}`, {
    headers: {
      "Content-Disposition": `attachment; filename="the_best_excel_v${String(
        schedule.version,
      )}.xls"`,
      "Content-Type": "application/vnd.ms-excel; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

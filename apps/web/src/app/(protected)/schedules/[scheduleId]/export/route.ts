import { getDatabase, type SolverSnapshot } from "@school-timetable/database";
import { NextResponse } from "next/server";
import { z } from "zod";

import { verifySession } from "@/lib/auth/dal";
import { assignmentSessionLabel } from "@/lib/session-times";

const paramsSchema = z.object({ scheduleId: z.uuid() });

function csvCell(value: string | number | null): string {
  let text = value === null ? "" : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
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
      term: { include: { days: true, periods: true } },
      assignments: {
        include: {
          classSection: true,
          teacher: true,
          room: true,
          teachingRequirement: { include: { subject: true } },
        },
      },
    },
  });
  if (!schedule) {
    return NextResponse.json({ code: "SCHEDULE_NOT_FOUND" }, { status: 404 });
  }
  const days = new Map(
    schedule.term.days.map((day) => [day.dayIndex, day.name]),
  );
  const snapshot = schedule.inputSnapshot as unknown as SolverSnapshot;
  const rows = schedule.assignments
    .toSorted(
      (left, right) =>
        (left.startDayIndex ?? 99) - (right.startDayIndex ?? 99) ||
        (left.startPeriodIndex ?? 99) - (right.startPeriodIndex ?? 99) ||
        left.classSection.shortCode.localeCompare(right.classSection.shortCode),
    )
    .map((assignment) => [
      assignment.startDayIndex === null
        ? "Unassigned"
        : (days.get(assignment.startDayIndex) ?? assignment.startDayIndex),
      assignment.startPeriodIndex === null
        ? ""
        : assignmentSessionLabel(
            snapshot,
            assignment.teachingRequirementId,
            assignment.startPeriodIndex,
            assignment.durationPeriods,
          ),
      assignment.classSection.shortCode,
      assignment.teachingRequirement.subject.shortCode,
      assignment.teacher.name,
      assignment.room?.name ?? "",
      assignment.durationPeriods,
      assignment.isLocked ? "Yes" : "No",
    ]);
  const csv = [
    [
      "Day",
      "Period",
      "Class",
      "Subject",
      "Teacher",
      "Room",
      "Duration",
      "Locked",
    ],
    ...rows,
  ]
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n");
  return new NextResponse(`\uFEFF${csv}`, {
    headers: {
      "content-disposition": `attachment; filename="schedule-v${String(schedule.version)}.csv"`,
      "content-type": "text/csv; charset=utf-8",
      "x-content-type-options": "nosniff",
    },
  });
}

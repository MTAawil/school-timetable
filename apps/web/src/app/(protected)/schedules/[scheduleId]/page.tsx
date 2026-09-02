import { getDatabase, type SolverSnapshot } from "@school-timetable/database";
import { Lock, LockOpen, Redo2, RefreshCw, Undo2 } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  moveAssignment,
  previewMove,
  publishSchedule,
  regenerateSchedule,
  swapAssignments,
  toggleAssignmentLock,
} from "@/app/(protected)/schedules/actions";
import { PageHeading, buttonClass, inputClass } from "@/components/setup-ui";
import {
  DraggableAssignment,
  ScheduleDropCell,
} from "@/components/schedule-drag";
import { PrintButton } from "@/components/print-button";
import { verifySession } from "@/lib/auth/dal";
import { assignmentSessionLabel } from "@/lib/session-times";

type ViewType = "school" | "class" | "teacher" | "room";

export default async function SchedulePage({
  params,
  searchParams,
}: {
  params: Promise<{ scheduleId: string }>;
  searchParams: Promise<{
    view?: string;
    entity?: string;
    error?: string;
    previewAssignment?: string;
    previewTarget?: string;
    previewDay?: string;
    previewPeriod?: string;
    previewDelta?: string;
    regenerated?: string;
    published?: string;
  }>;
}) {
  const user = await verifySession();
  const { scheduleId } = await params;
  const query = await searchParams;
  const db = getDatabase();
  const schedule = await db.schedule.findFirst({
    where: { id: scheduleId, schoolId: user.schoolId },
    include: {
      assignments: {
        include: {
          teachingRequirement: { include: { subject: true } },
          classSection: true,
          teacher: true,
          room: true,
        },
        orderBy: { createdAt: "asc" },
      },
      parentSchedule: true,
      derivedSchedules: { orderBy: { version: "desc" }, take: 1 },
      auditLogs: { orderBy: { createdAt: "desc" }, take: 1 },
      term: { include: { days: true, periods: true } },
    },
  });
  if (!schedule) notFound();

  const view: ViewType = ["class", "teacher", "room"].includes(query.view ?? "")
    ? (query.view as ViewType)
    : "school";
  const entities =
    view === "class"
      ? Array.from(
          new Map(
            schedule.assignments.map((item) => [
              item.classSection.id,
              item.classSection.shortCode,
            ]),
          ),
        )
      : view === "teacher"
        ? Array.from(
            new Map(
              schedule.assignments.map((item) => [
                item.teacher.id,
                item.teacher.name,
              ]),
            ),
          )
        : view === "room"
          ? Array.from(
              new Map(
                schedule.assignments
                  .filter((item) => item.room)
                  .map((item) => [item.room!.id, item.room!.name]),
              ),
            )
          : [];
  const entityId = query.entity ?? entities[0]?.[0];
  const visibleAssignments = schedule.assignments.filter((assignment) => {
    if (view === "class") return assignment.classSectionId === entityId;
    if (view === "teacher") return assignment.teacherId === entityId;
    if (view === "room") return assignment.roomId === entityId;
    return true;
  });
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
      : schedule.term.periods.sort(
          (left, right) => left.periodIndex - right.periodIndex,
        );
  const tray = schedule.assignments.filter(
    (assignment) =>
      assignment.startDayIndex === null || assignment.startPeriodIndex === null,
  );
  const editableAssignments = view === "school" ? [] : visibleAssignments;
  const latestAudit = schedule.auditLogs[0]?.details as
    | {
        scoreDelta?: number;
        movementPenalty?: number;
        movedAssignments?: unknown[];
        lockedAssignmentCount?: number;
      }
    | undefined;

  return (
    <div className="space-y-6">
      <PageHeading
        title={`${schedule.name} · v${String(schedule.version)}`}
        description={`${schedule.status.toLowerCase()} schedule · ${String(schedule.assignments.length)} assignments`}
      />
      {query.error ? (
        <div
          className="border border-[#e3b7b2] bg-[#fff5f4] px-4 py-3 text-sm text-[#8e2020]"
          role="alert"
        >
          Edit rejected: <code>{query.error}</code>. The draft was not changed.
        </div>
      ) : null}
      {query.previewAssignment ? (
        <div className="flex flex-wrap items-center gap-3 border border-[#a8cbbc] bg-[#f1f8f5] px-4 py-3 text-sm">
          <p>
            Score difference preview:{" "}
            <strong>
              {Number(query.previewDelta) >= 0 ? "+" : ""}
              {query.previewDelta}
            </strong>
          </p>
          <form action={moveAssignment} className="ml-auto flex gap-2">
            <input name="scheduleId" type="hidden" value={schedule.id} />
            <input
              name="assignmentId"
              type="hidden"
              value={query.previewAssignment}
            />
            <input
              name="target"
              type="hidden"
              value={query.previewTarget ?? "slot"}
            />
            {query.previewDay ? (
              <input name="dayIndex" type="hidden" value={query.previewDay} />
            ) : null}
            {query.previewPeriod ? (
              <input
                name="periodIndex"
                type="hidden"
                value={query.previewPeriod}
              />
            ) : null}
            <button className={buttonClass}>Confirm edit</button>
            <Link
              className="inline-flex h-10 items-center border border-[#9ba59f] bg-white px-3 font-semibold"
              href={`/schedules/${schedule.id}`}
            >
              Cancel
            </Link>
          </form>
        </div>
      ) : null}
      {query.regenerated === "1" ? (
        <div className="border border-[#a8cbbc] bg-[#f1f8f5] px-4 py-3 text-sm">
          Regeneration complete.{" "}
          <strong>
            {String(latestAudit?.movedAssignments?.length ?? 0)} assignments
            moved
          </strong>
          ; {String(latestAudit?.lockedAssignmentCount ?? 0)} locked assignments
          remained fixed.
        </div>
      ) : null}
      {query.published === "1" ? (
        <div className="border border-[#a8cbbc] bg-[#f1f8f5] px-4 py-3 text-sm">
          Schedule version {String(schedule.version)} is now published and
          immutable.
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        {(["school", "class", "teacher", "room"] as const).map((item) => (
          <Link
            className={`h-9 px-3 py-2 text-sm font-medium ${
              view === item
                ? "bg-[#132b24] text-white"
                : "border border-[#cfd5d1] bg-white"
            }`}
            href={`/schedules/${schedule.id}?view=${item}`}
            key={item}
          >
            {item === "school"
              ? "Whole school"
              : `${item[0]!.toUpperCase()}${item.slice(1)}`}
          </Link>
        ))}
        {entities.length > 0 ? (
          <form className="ml-auto flex gap-2">
            <input name="view" type="hidden" value={view} />
            <select
              aria-label={`${view} filter`}
              className={`${inputClass} min-w-48`}
              defaultValue={entityId}
              name="entity"
            >
              {entities.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
            <button className="h-10 border border-[#9ba59f] bg-white px-3 text-sm font-semibold">
              View
            </button>
          </form>
        ) : null}
      </div>

      <div className="overflow-x-auto border border-[#dce1dc] bg-white">
        <table className="w-full min-w-[900px] table-fixed border-collapse text-sm">
          <thead>
            <tr className="bg-[#f0f2ef]">
              <th className="w-28 border-b border-r border-[#dce1dc] p-3 text-left">
                Period
              </th>
              {days.map((day) => (
                <th className="border-b border-[#dce1dc] p-3" key={day.id}>
                  {day.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {periods.map((period) => (
              <tr key={period.id}>
                <th className="h-24 border-r border-t border-[#dce1dc] p-3 text-left align-top">
                  {period.name}
                </th>
                {days.map((day) => {
                  const cell = visibleAssignments.filter(
                    (assignment) =>
                      assignment.startDayIndex === day.dayIndex &&
                      assignment.startPeriodIndex === period.periodIndex,
                  );
                  return (
                    <td
                      className={`h-24 border-t border-l border-[#e7eae7] p-2 align-top ${
                        period.isTeaching ? "" : "bg-[#f3f4f2]"
                      }`}
                      key={day.id}
                    >
                      <ScheduleDropCell
                        dayIndex={day.dayIndex}
                        disabled={
                          !period.isTeaching || schedule.status !== "DRAFT"
                        }
                        periodIndex={period.periodIndex}
                        scheduleId={schedule.id}
                      >
                        <div className="space-y-1">
                          {cell.map((assignment) => (
                            <DraggableAssignment
                              assignmentId={assignment.id}
                              disabled={
                                schedule.status !== "DRAFT" ||
                                assignment.isLocked
                              }
                              key={assignment.id}
                            >
                              <a
                                className="block cursor-grab border-l-2 border-[#0e6b4f] bg-[#edf6f2] px-2 py-1.5 text-xs"
                                href={`#assignment-${assignment.id}`}
                              >
                                <span className="font-semibold">
                                  {assignment.classSection.shortCode} ·{" "}
                                  {
                                    assignment.teachingRequirement.subject
                                      .shortCode
                                  }
                                </span>
                                <span className="mt-0.5 block text-[#66706b]">
                                  {assignment.teacher.name}
                                  {assignment.isLocked ? " · Locked" : ""}
                                </span>
                                <span className="mt-0.5 block text-[#66706b]">
                                  {assignmentSessionLabel(
                                    snapshot,
                                    assignment.teachingRequirementId,
                                    assignment.startPeriodIndex ?? 0,
                                    assignment.durationPeriods,
                                  )}
                                </span>
                              </a>
                            </DraggableAssignment>
                          ))}
                        </div>
                      </ScheduleDropCell>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="border border-[#dce1dc] bg-white p-4">
        <h2 className="font-semibold">Unassigned tray ({tray.length})</h2>
        <ScheduleDropCell
          disabled={schedule.status !== "DRAFT"}
          scheduleId={schedule.id}
        >
          <div className="mt-3 flex min-h-14 flex-wrap gap-2 border border-dashed border-[#cfd5d1] p-2">
            {tray.length === 0 ? (
              <p className="text-sm text-[#66706b]">
                Drop lessons here to unassign them.
              </p>
            ) : (
              tray.map((assignment) => (
                <DraggableAssignment
                  assignmentId={assignment.id}
                  disabled={schedule.status !== "DRAFT" || assignment.isLocked}
                  key={assignment.id}
                >
                  <a
                    className="block cursor-grab border border-[#cfd5d1] px-3 py-2 text-sm"
                    href={`#assignment-${assignment.id}`}
                  >
                    {assignment.classSection.shortCode} ·{" "}
                    {assignment.teachingRequirement.subject.shortCode}
                  </a>
                </DraggableAssignment>
              ))
            )}
          </div>
        </ScheduleDropCell>
      </section>

      <div className="flex flex-wrap items-center gap-2 print:hidden">
        {schedule.status === "DRAFT" ? (
          <form action={regenerateSchedule}>
            <input name="scheduleId" type="hidden" value={schedule.id} />
            <button
              className={`${buttonClass} inline-flex items-center`}
              title="Run partial regeneration"
            >
              <RefreshCw className="mr-2" size={16} />
              Regenerate unlocked
            </button>
          </form>
        ) : null}
        {schedule.status === "DRAFT" ? (
          <form action={publishSchedule}>
            <input name="scheduleId" type="hidden" value={schedule.id} />
            <button className="h-10 border border-[#0e6b4f] bg-white px-4 text-sm font-semibold text-[#0e6b4f]">
              Publish
            </button>
          </form>
        ) : null}
        <Link
          className="inline-flex h-9 items-center border border-[#cfd5d1] bg-white px-3 text-sm"
          href={`/schedules/${schedule.id}/export`}
        >
          Export CSV
        </Link>
        <Link
          className="inline-flex h-9 items-center border border-[#cfd5d1] bg-white px-3 text-sm"
          href={`/schedules/${schedule.id}/pdf?type=school`}
        >
          PDF school
        </Link>
        {view === "class" && entityId ? (
          <Link
            className="inline-flex h-9 items-center border border-[#cfd5d1] bg-white px-3 text-sm"
            href={`/schedules/${schedule.id}/pdf?type=class&entity=${entityId}`}
          >
            PDF class
          </Link>
        ) : null}
        {view === "teacher" && entityId ? (
          <Link
            className="inline-flex h-9 items-center border border-[#cfd5d1] bg-white px-3 text-sm"
            href={`/schedules/${schedule.id}/pdf?type=teacher&entity=${entityId}`}
          >
            PDF teacher
          </Link>
        ) : null}
        <PrintButton />
        {schedule.status === "DRAFT" ? (
          <>
            {schedule.parentSchedule ? (
              <Link
                className="inline-flex h-9 items-center border border-[#cfd5d1] bg-white px-3 text-sm"
                href={`/schedules/${schedule.parentSchedule.id}`}
              >
                <Undo2 className="mr-2" size={16} />
                Undo
              </Link>
            ) : null}
            {schedule.derivedSchedules[0] ? (
              <Link
                className="inline-flex h-9 items-center border border-[#cfd5d1] bg-white px-3 text-sm"
                href={`/schedules/${schedule.derivedSchedules[0].id}`}
              >
                <Redo2 className="mr-2" size={16} />
                Redo
              </Link>
            ) : null}
          </>
        ) : null}
        {latestAudit?.scoreDelta !== undefined ? (
          <p className="ml-auto text-sm text-[#66706b]">
            Last edit score difference:{" "}
            <strong>
              {latestAudit.scoreDelta >= 0 ? "+" : ""}
              {latestAudit.scoreDelta}
            </strong>
          </p>
        ) : null}
      </div>

      {schedule.status === "DRAFT" && view === "school" ? (
        <section className="border border-[#dce1dc] bg-white p-4 text-sm text-[#66706b]">
          Choose a class, teacher, or room view to edit individual lessons.
        </section>
      ) : null}

      {schedule.status === "DRAFT" && editableAssignments.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-base font-semibold">Assignment editor</h2>
          <div className="divide-y divide-[#dce1dc] border border-[#dce1dc] bg-white">
            {editableAssignments.map((assignment) => (
              <div
                className="grid gap-3 p-4 xl:grid-cols-[220px_1fr_1fr_auto]"
                id={`assignment-${assignment.id}`}
                key={assignment.id}
              >
                <div>
                  <p className="font-semibold">
                    {assignment.classSection.shortCode} ·{" "}
                    {assignment.teachingRequirement.subject.shortCode}
                  </p>
                  <p className="mt-1 text-xs text-[#66706b]">
                    {assignment.teacher.name}
                  </p>
                </div>
                <form action={previewMove} className="flex gap-2">
                  <input name="scheduleId" type="hidden" value={schedule.id} />
                  <input
                    name="assignmentId"
                    type="hidden"
                    value={assignment.id}
                  />
                  <input name="target" type="hidden" value="slot" />
                  <select
                    aria-label="Move day"
                    className={inputClass}
                    defaultValue={assignment.startDayIndex ?? days[0]?.dayIndex}
                    name="dayIndex"
                  >
                    {days.map((day) => (
                      <option key={day.id} value={day.dayIndex}>
                        {day.name}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Move period"
                    className={inputClass}
                    defaultValue={
                      assignment.startPeriodIndex ?? periods[0]?.periodIndex
                    }
                    name="periodIndex"
                  >
                    {periods
                      .filter((period) => period.isTeaching)
                      .map((period) => (
                        <option key={period.id} value={period.periodIndex}>
                          {assignmentSessionLabel(
                            snapshot,
                            assignment.teachingRequirementId,
                            period.periodIndex,
                            assignment.durationPeriods,
                          )}
                        </option>
                      ))}
                  </select>
                  <button
                    className={`${buttonClass} shrink-0`}
                    disabled={assignment.isLocked}
                  >
                    Preview
                  </button>
                </form>
                <form action={swapAssignments} className="flex gap-2">
                  <input name="scheduleId" type="hidden" value={schedule.id} />
                  <input
                    name="assignmentId"
                    type="hidden"
                    value={assignment.id}
                  />
                  <select
                    aria-label="Swap with"
                    className={inputClass}
                    name="swapWithId"
                  >
                    {editableAssignments
                      .filter((item) => item.id !== assignment.id)
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.classSection.shortCode} ·{" "}
                          {item.teachingRequirement.subject.shortCode}
                        </option>
                      ))}
                  </select>
                  <button
                    className="h-10 shrink-0 border border-[#9ba59f] bg-white px-3 text-sm font-semibold"
                    disabled={assignment.isLocked}
                  >
                    Swap
                  </button>
                </form>
                <div className="flex gap-2">
                  <form action={previewMove}>
                    <input
                      name="scheduleId"
                      type="hidden"
                      value={schedule.id}
                    />
                    <input
                      name="assignmentId"
                      type="hidden"
                      value={assignment.id}
                    />
                    <input name="target" type="hidden" value="tray" />
                    <button
                      className="h-10 border border-[#9ba59f] bg-white px-3 text-sm"
                      disabled={assignment.isLocked}
                    >
                      Preview unassign
                    </button>
                  </form>
                  <form action={toggleAssignmentLock}>
                    <input
                      name="scheduleId"
                      type="hidden"
                      value={schedule.id}
                    />
                    <input
                      name="assignmentId"
                      type="hidden"
                      value={assignment.id}
                    />
                    <button
                      className="flex h-10 w-10 items-center justify-center border border-[#9ba59f] bg-white"
                      title={assignment.isLocked ? "Unlock" : "Lock"}
                    >
                      {assignment.isLocked ? (
                        <Lock size={16} />
                      ) : (
                        <LockOpen size={16} />
                      )}
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

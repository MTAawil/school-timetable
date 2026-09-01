import { getDatabase } from "@school-timetable/database";
import { Lock, LockOpen, Redo2, RefreshCw, Undo2 } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  applyTargetedRepair,
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
import { ScheduleSessionMenu } from "@/components/schedule-session-menu";
import { ScheduleSaveControls } from "@/components/schedule-save-controls";
import { ScheduleViewNavigation } from "@/components/schedule-view-navigation";
import { verifySession } from "@/lib/auth/dal";

type ViewType = "school" | "class" | "teacher" | "room";

const classOrder = new Intl.Collator("en", {
  numeric: true,
  sensitivity: "base",
});

export default async function SchedulePage({
  params,
  searchParams,
}: {
  params: Promise<{ scheduleId: string }>;
  searchParams: Promise<{
    view?: string;
    entity?: string;
    error?: string;
    regenerated?: string;
    published?: string;
    saved?: string;
    repairJob?: string;
    repairApplied?: string;
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
  const selectedEntityName = entities.find(([id]) => id === entityId)?.[1];
  const [selectedTeacher, teacherRestrictions] =
    view === "teacher" && entityId
      ? await Promise.all([
          db.teacher.findFirst({
            where: {
              id: entityId,
              schoolId: user.schoolId,
              deletedAt: null,
            },
          }),
          db.availabilityRule.findMany({
            where: {
              schoolId: user.schoolId,
              termId: schedule.termId,
              entityType: "TEACHER",
              entityId,
            },
          }),
        ])
      : [null, []];
  const repairJob =
    query.repairJob &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      query.repairJob,
    )
      ? await db.generationJob.findFirst({
          where: {
            id: query.repairJob,
            schoolId: user.schoolId,
            termId: schedule.termId,
          },
          include: { alternatives: true },
        })
      : null;
  const visibleAssignments = schedule.assignments.filter((assignment) => {
    if (view === "class") return assignment.classSectionId === entityId;
    if (view === "teacher") return assignment.teacherId === entityId;
    if (view === "room") return assignment.roomId === entityId;
    return true;
  });
  const days = schedule.term.days
    .filter((day) => day.isWorking)
    .sort((left, right) => left.dayIndex - right.dayIndex);
  const periods = schedule.term.periods.sort(
    (left, right) => left.periodIndex - right.periodIndex,
  );
  const slots = days.flatMap((day) =>
    periods
      .filter((period) => period.isTeaching)
      .map((period) => ({
        dayIndex: day.dayIndex,
        dayName: day.name,
        periodIndex: period.periodIndex,
        periodName: period.name,
      })),
  );
  const tray = schedule.assignments.filter(
    (assignment) =>
      assignment.startDayIndex === null || assignment.startPeriodIndex === null,
  );
  const latestAudit = schedule.auditLogs[0]?.details as
    | {
        scoreDelta?: number;
        movementPenalty?: number;
        movedAssignments?: unknown[];
        lockedAssignmentCount?: number;
      }
    | undefined;
  const isResourceView = view === "teacher" || view === "class";
  const restrictionCounts = {
    unavailable: teacherRestrictions.filter(
      (rule) => rule.state === "UNAVAILABLE",
    ).length,
    disliked: teacherRestrictions.filter((rule) => rule.state === "DISLIKED")
      .length,
    preferred: teacherRestrictions.filter((rule) => rule.state === "PREFERRED")
      .length,
  };
  const repairMetadata = repairJob?.responseMetadata as
    | {
        reason?: string;
        sourceScheduleId?: string;
        target?: { dayIndex: number; periodIndex: number };
        options?: Array<{
          alternativeId: string;
          rank: number;
          movementPenalty: number;
          additionalMoves: number;
          totalPenalty: number;
          movedAssignments: Array<{
            requirementId: string;
            before: { dayIndex: number; periodIndex: number };
            after: { dayIndex: number; periodIndex: number };
          }>;
        }>;
      }
    | undefined;
  const dayNames = new Map(days.map((day) => [day.dayIndex, day.name]));
  const periodNames = new Map(
    periods.map((period) => [period.periodIndex, period.name]),
  );

  return (
    <div className="space-y-6">
      <PageHeading
        title={schedule.name}
        description={`${schedule.status.toLowerCase()} schedule · ${String(schedule.assignments.length)} assignments${
          schedule.status === "DRAFT"
            ? schedule.isSavedDraft
              ? " · saved working draft"
              : " · pending edits"
            : ""
        }`}
      />
      {query.error ? (
        <div
          className="border border-[#e3b7b2] bg-[#fff5f4] px-4 py-3 text-sm text-[#8e2020]"
          role="alert"
        >
          Edit rejected: <code>{query.error}</code>. The draft was not changed.
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
      {query.saved ? (
        <div
          className="border border-[#a8cbbc] bg-[#f1f8f5] px-4 py-3 text-sm"
          role="status"
        >
          {query.saved === "copy"
            ? "A new saved draft copy was created."
            : "This working draft is saved."}
        </div>
      ) : null}
      {query.repairApplied === "1" ? (
        <div
          className="border border-[#a8cbbc] bg-[#f1f8f5] px-4 py-3 text-sm"
          role="status"
        >
          The repair was applied as pending edits. Review it, then press Save.
        </div>
      ) : null}
      {query.published === "1" ? (
        <div className="border border-[#a8cbbc] bg-[#f1f8f5] px-4 py-3 text-sm">
          This timetable is now published and immutable.
        </div>
      ) : null}
      <ScheduleViewNavigation
        entities={entities}
        entityId={entityId}
        scheduleId={schedule.id}
        view={view}
      />

      {repairJob ? (
        <div
          aria-label="Targeted repair options"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-4 print:hidden"
          role="dialog"
        >
          <section className="max-h-[85vh] w-full max-w-2xl overflow-y-auto border border-[#cfd5d1] bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">
                  Possible repair options
                </h2>
                <p className="mt-1 text-sm text-[#66706b]">
                  Target:{" "}
                  {repairMetadata?.target
                    ? `${dayNames.get(repairMetadata.target.dayIndex) ?? "Day"}, ${
                        periodNames.get(repairMetadata.target.periodIndex) ??
                        "Period"
                      }`
                    : "selected period"}
                </p>
              </div>
              <Link
                className="border border-[#cfd5d1] px-3 py-2 text-sm font-semibold"
                href={`/schedules/${schedule.id}?view=teacher&entity=${entityId ?? ""}`}
              >
                Cancel
              </Link>
            </div>
            {repairJob.status === "FAILED" ||
            !repairMetadata?.options?.length ? (
              <p className="mt-5 border border-[#e0c78f] bg-[#fff9e9] p-3 text-sm text-[#6e5314]">
                {repairMetadata?.reason === "REPAIR_REQUIRES_TOO_MANY_MOVES"
                  ? "A valid repair would require moving more than five additional sessions."
                  : "No valid bounded repair was found for this target."}
              </p>
            ) : (
              <div className="mt-5 space-y-3">
                {repairMetadata.options.map((option, index) => (
                  <div
                    className="border border-[#dce1dc] p-4"
                    key={option.alternativeId}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="font-semibold">
                          {index === 0
                            ? "Recommended option"
                            : `Option ${index + 1}`}
                        </h3>
                        <p className="mt-1 text-sm text-[#66706b]">
                          {option.additionalMoves} additional session
                          {option.additionalMoves === 1 ? "" : "s"} moved ·
                          quality score {option.totalPenalty}
                        </p>
                      </div>
                      <form action={applyTargetedRepair}>
                        <input
                          name="scheduleId"
                          type="hidden"
                          value={schedule.id}
                        />
                        <input
                          name="alternativeId"
                          type="hidden"
                          value={option.alternativeId}
                        />
                        <button className="h-9 bg-[#0e6b4f] px-4 text-sm font-semibold text-white">
                          Apply
                        </button>
                      </form>
                    </div>
                    <div className="mt-3 divide-y divide-[#e7eae7] border-y border-[#e7eae7]">
                      {option.movedAssignments.map(
                        (movement, movementIndex) => {
                          const assignment = schedule.assignments.find(
                            (item) =>
                              item.teachingRequirementId ===
                              movement.requirementId,
                          );
                          return (
                            <div
                              className="grid gap-1 py-2 text-sm sm:grid-cols-[minmax(0,1fr)_auto]"
                              key={`${movement.requirementId}-${movementIndex}`}
                            >
                              <span className="font-medium">
                                {assignment
                                  ? `${assignment.classSection.shortCode} · ${assignment.teachingRequirement.subject.shortCode} · ${assignment.teacher.name}`
                                  : "Affected session"}
                              </span>
                              <span className="text-[#66706b]">
                                {dayNames.get(movement.before.dayIndex)}{" "}
                                {periodNames.get(movement.before.periodIndex)} →{" "}
                                {dayNames.get(movement.after.dayIndex)}{" "}
                                {periodNames.get(movement.after.periodIndex)}
                              </span>
                            </div>
                          );
                        },
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      ) : null}

      {view === "teacher" && selectedTeacher ? (
        <section className="schedule-resource-summary border-y border-[#dce1dc] bg-white px-4 py-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <p className="text-xs font-semibold uppercase text-[#66706b]">
                Teacher timetable
              </p>
              <h2 className="mt-1 text-xl font-semibold">
                {selectedTeacher.name}
              </h2>
            </div>
            <p className="text-sm font-semibold text-[#0e6b4f]">
              {selectedTeacher.weeklyTeachingSessions} sessions per week
            </p>
          </div>
          <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <div>
              <dt className="inline text-[#66706b]">Employment: </dt>
              <dd className="inline font-medium">
                {selectedTeacher.employmentType === "FULL_TIME"
                  ? "Full-time"
                  : "Part-time"}
              </dd>
            </div>
            <div>
              <dt className="inline text-[#66706b]">Daily maximum: </dt>
              <dd className="inline font-medium">
                {selectedTeacher.maxLessonsPerDay ?? "Not set"}
              </dd>
            </div>
            <div>
              <dt className="inline text-[#66706b]">Consecutive maximum: </dt>
              <dd className="inline font-medium">
                {selectedTeacher.maxConsecutiveLessons ?? "Not set"}
              </dd>
            </div>
            <div>
              <dt className="inline text-[#66706b]">Restrictions: </dt>
              <dd className="inline font-medium">
                {restrictionCounts.unavailable} unavailable,{" "}
                {restrictionCounts.disliked} disliked,{" "}
                {restrictionCounts.preferred} preferred
              </dd>
            </div>
          </dl>
        </section>
      ) : view === "class" && selectedEntityName ? (
        <section className="schedule-resource-summary border-y border-[#dce1dc] bg-white px-4 py-3">
          <p className="text-xs font-semibold uppercase text-[#66706b]">
            Class timetable
          </p>
          <h2 className="mt-1 text-xl font-semibold">{selectedEntityName}</h2>
        </section>
      ) : null}

      <div className="schedule-table-wrap overflow-x-auto border border-[#dce1dc] bg-white">
        <table
          className={`schedule-table w-full table-fixed border-collapse text-sm ${
            isResourceView ? "min-w-[720px]" : "min-w-[900px]"
          }`}
        >
          <thead>
            <tr className="bg-[#f0f2ef]">
              <th
                className={`border-b border-r border-[#dce1dc] text-left ${
                  isResourceView ? "w-24 p-2" : "w-28 p-3"
                }`}
              >
                Period
              </th>
              {days.map((day) => (
                <th
                  className={`border-b border-[#dce1dc] ${
                    isResourceView ? "p-2" : "p-3"
                  }`}
                  key={day.id}
                >
                  {day.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {periods.map((period) => (
              <tr key={period.id}>
                <th
                  className={`border-r border-t border-[#dce1dc] text-left align-middle ${
                    isResourceView ? "h-14 p-2" : "h-24 p-3 align-top"
                  }`}
                >
                  {period.name}
                </th>
                {days.map((day) => {
                  const cell = visibleAssignments
                    .filter(
                      (assignment) =>
                        assignment.startDayIndex === day.dayIndex &&
                        assignment.startPeriodIndex === period.periodIndex,
                    )
                    .sort((left, right) =>
                      classOrder.compare(
                        left.classSection.shortCode,
                        right.classSection.shortCode,
                      ),
                    );
                  return (
                    <td
                      className={`border-t border-l border-[#e7eae7] align-top ${
                        isResourceView ? "h-14 p-1" : "h-24 p-2"
                      } ${period.isTeaching ? "" : "bg-[#f3f4f2]"}`}
                      key={day.id}
                    >
                      <ScheduleDropCell
                        compact={isResourceView}
                        dayIndex={day.dayIndex}
                        disabled={
                          !period.isTeaching || schedule.status !== "DRAFT"
                        }
                        periodIndex={period.periodIndex}
                        repairTeacherId={
                          view === "teacher" ? entityId : undefined
                        }
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
                              <div className="grid grid-cols-[minmax(0,1fr)_32px] gap-1">
                                <div className="print:hidden">
                                  <ScheduleSessionMenu
                                    assignmentId={assignment.id}
                                    disabled={
                                      schedule.status !== "DRAFT" ||
                                      assignment.isLocked
                                    }
                                    locked={assignment.isLocked}
                                    scheduleId={schedule.id}
                                    slots={slots}
                                    label={
                                      <>
                                        <span className="font-semibold">
                                          {view === "class"
                                            ? ""
                                            : `${assignment.classSection.shortCode} · `}
                                          {
                                            assignment.teachingRequirement
                                              .subject.shortCode
                                          }
                                        </span>
                                        <span className="mt-0.5 block text-[#66706b]">
                                          {view === "teacher"
                                            ? assignment.classSection.shortCode
                                            : assignment.teacher.name}
                                          {assignment.isLocked
                                            ? " · Locked"
                                            : ""}
                                        </span>
                                      </>
                                    }
                                  />
                                </div>
                                <div className="hidden px-1 py-1 text-xs print:block">
                                  <span className="font-semibold">
                                    {
                                      assignment.teachingRequirement.subject
                                        .shortCode
                                    }
                                  </span>
                                  <span className="mt-0.5 block text-[#555]">
                                    {view === "teacher"
                                      ? assignment.classSection.shortCode
                                      : view === "class"
                                        ? assignment.teacher.name
                                        : `${assignment.classSection.shortCode} · ${assignment.teacher.name}`}
                                  </span>
                                </div>
                                {schedule.status === "DRAFT" ? (
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
                                      className="flex h-8 w-8 items-center justify-center border border-[#cfd5d1] bg-white"
                                      title={
                                        assignment.isLocked ? "Unlock" : "Lock"
                                      }
                                    >
                                      {assignment.isLocked ? (
                                        <Lock size={14} />
                                      ) : (
                                        <LockOpen size={14} />
                                      )}
                                    </button>
                                  </form>
                                ) : null}
                              </div>
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

      {tray.length > 0 ? (
        <section className="border border-[#dce1dc] bg-white p-4">
          <h2 className="font-semibold">Unassigned tray ({tray.length})</h2>
          <ScheduleDropCell
            disabled={schedule.status !== "DRAFT"}
            scheduleId={schedule.id}
          >
            <div className="mt-3 flex min-h-14 flex-wrap gap-2 border border-dashed border-[#cfd5d1] p-2">
              {tray.map((assignment) => (
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
              ))}
            </div>
          </ScheduleDropCell>
        </section>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 print:hidden">
        {schedule.status === "DRAFT" ? (
          <ScheduleSaveControls
            hasPendingChanges={!schedule.isSavedDraft}
            name={schedule.name}
            scheduleId={schedule.id}
          />
        ) : null}
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

      {false && schedule ? (
        <section className="space-y-3">
          <h2 className="text-base font-semibold">Assignment editor</h2>
          <div className="divide-y divide-[#dce1dc] border border-[#dce1dc] bg-white">
            {schedule!.assignments.map((assignment) => (
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
                  <input name="scheduleId" type="hidden" value={schedule!.id} />
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
                          {period.name}
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
                  <input name="scheduleId" type="hidden" value={schedule!.id} />
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
                    {schedule!.assignments
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
                      value={schedule!.id}
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
                      value={schedule!.id}
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

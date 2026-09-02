import { AlertTriangle, CheckCircle2, ShieldCheck } from "lucide-react";
import Link from "next/link";

import { generateTimetable } from "@/app/(protected)/readiness/actions";
import { GenerationSubmitStatus } from "@/components/generation-submit-status";
import { PageHeading } from "@/components/setup-ui";
import { verifySession } from "@/lib/auth/dal";
import {
  analyzePartTimeTeacherPressure,
  buildPartTimeCheckSnapshot,
} from "@/lib/part-time-check";
import { getCurrentReadiness } from "@/lib/readiness";
import { getReadinessIssueAction } from "@/lib/readiness-navigation";

const issueDestinations: Record<string, string> = {
  CLASS_CAPACITY_SHORTAGE: "/classes",
  TEACHER_CAPACITY_SHORTAGE: "/teachers",
  REQUIREMENT_COMPATIBILITY_SHORTAGE: "/requirements",
  DAILY_CAPACITY_SHORTAGE: "/requirements",
  DISTINCT_DAYS_SHORTAGE: "/requirements",
  ROOM_CAPACITY_SHORTAGE: "/rooms",
  FIXED_TEACHER_COLLISION: "/requirements",
  FIXED_CLASS_COLLISION: "/requirements",
  FIXED_ROOM_COLLISION: "/requirements",
  INSUFFICIENT_CONSECUTIVE_SLOTS: "/requirements",
  LOCKED_ASSIGNMENT_CONFLICT: "/requirements",
  SCHOOL_WEEK_INCOMPLETE: "/setup",
  BREAK_CONFIGURATION_INVALID: "/setup",
  CURRICULUM_EMPTY: "/subjects",
  CURRICULUM_EXCEEDS_CLASS_CAPACITY: "/subjects",
  CLASS_SUBJECT_UNASSIGNED: "/teachers",
  CLASS_SUBJECT_MULTIPLE_TEACHERS: "/teachers",
  TEACHER_WORKLOAD_MISMATCH: "/teachers",
  NON_MAIN_DAILY_CAPACITY_SHORTAGE: "/subjects",
  DOUBLE_REQUIRED_BUT_DISABLED: "/subjects",
  MAIN_DAILY_CAPACITY_SHORTAGE: "/subjects",
};

export default async function ReadinessPage() {
  const user = await verifySession();
  const { snapshot, fingerprint, result } = await getCurrentReadiness(
    user.schoolId,
  );
  const teachingSlots =
    snapshot.calendar.days.filter((day) => day.isWorking).length *
    snapshot.calendar.periods.filter((period) => period.isTeaching).length;
  const partTimeSnapshot = buildPartTimeCheckSnapshot(snapshot, 60);
  const tightPartTimers = analyzePartTimeTeacherPressure(
    partTimeSnapshot,
  ).filter((teacher) => teacher.tight);

  return (
    <div className="space-y-7">
      <PageHeading
        title="Generation readiness"
        description={`Deterministic validation for ${snapshot.term.name}. No solver job is created while blocking issues remain.`}
      />

      <section
        className={`flex items-start gap-4 border p-5 ${
          result.ready
            ? "border-[#9bc8b7] bg-[#f1faf6]"
            : "border-[#e4bd73] bg-[#fff9e9]"
        }`}
      >
        {result.ready ? (
          <CheckCircle2 className="mt-0.5 shrink-0 text-[#0e6b4f]" size={22} />
        ) : (
          <AlertTriangle className="mt-0.5 shrink-0 text-[#9a6511]" size={22} />
        )}
        <div>
          <h2 className="font-semibold">
            {result.ready
              ? "Inputs are ready for generation"
              : `${String(result.issues.length)} blocking issue${result.issues.length === 1 ? "" : "s"}`}
          </h2>
          <p className="mt-1 text-sm leading-6 text-[#66706b]">
            {result.ready
              ? "The current input passes all deterministic capacity and collision checks."
              : "Correct every issue below, then return here to validate the updated input."}
          </p>
        </div>
      </section>

      <dl className="grid gap-px overflow-hidden border border-[#dce1dc] bg-[#dce1dc] sm:grid-cols-4">
        {[
          ["Teaching slots", teachingSlots],
          ["Teachers", snapshot.teachers.length],
          ["Classes", snapshot.classSections.length],
          ["Class subjects", snapshot.requirements.length],
        ].map(([label, value]) => (
          <div key={label} className="bg-white p-4">
            <dt className="text-xs uppercase text-[#66706b]">{label}</dt>
            <dd className="mt-2 text-2xl font-semibold">{value}</dd>
          </div>
        ))}
      </dl>

      {result.issues.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-base font-semibold">Blocking issues</h2>
          <div className="divide-y divide-[#dce1dc] border border-[#dce1dc] bg-white">
            {result.issues.map((issue) => {
              const action = getReadinessIssueAction(
                issue,
                snapshot.teachers,
                issueDestinations,
              );
              return (
                <article
                  key={`${issue.code}:${issue.entityIds.join(":")}`}
                  className="p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-mono text-xs font-semibold text-[#9a3d2c]">
                        {issue.code}
                      </p>
                      <h3 className="mt-1 font-semibold">{issue.summary}</h3>
                    </div>
                    {issue.required !== undefined &&
                    issue.available !== undefined ? (
                      <div className="flex gap-5 text-sm">
                        <span>
                          <span className="text-[#66706b]">Required</span>{" "}
                          <strong>{issue.required}</strong>
                        </span>
                        <span>
                          <span className="text-[#66706b]">Available</span>{" "}
                          <strong>{issue.available}</strong>
                        </span>
                      </div>
                    ) : null}
                  </div>
                  <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-[#66706b]">
                    {issue.suggestions
                      .filter((suggestion) => !suggestion.startsWith("/"))
                      .map((suggestion) => (
                        <li key={suggestion}>{suggestion}</li>
                      ))}
                  </ul>
                  <Link
                    className="mt-4 inline-flex h-9 items-center border border-[#9ba59f] bg-white px-3 text-sm font-semibold hover:bg-[#f0f2ef]"
                    href={action.href}
                  >
                    {action.label}
                  </Link>
                </article>
              );
            })}
          </div>
        </section>
      ) : (
        <section className="border border-[#dce1dc] bg-white p-5">
          {tightPartTimers.length > 0 ? (
            <div className="mb-5 border border-[#e4bd73] bg-[#fff9e9] p-4 text-sm">
              <div className="flex items-start gap-3">
                <AlertTriangle
                  className="mt-0.5 shrink-0 text-[#9a6511]"
                  size={18}
                />
                <div>
                  <h2 className="font-semibold">
                    Tight part-time availability
                  </h2>
                  <p className="mt-1 leading-6 text-[#66706b]">
                    {tightPartTimers
                      .slice(0, 4)
                      .map(
                        (teacher) =>
                          `${teacher.teacherName}: ${String(
                            teacher.weeklySessions,
                          )}/${String(teacher.availableSlots)} slots`,
                      )
                      .join("; ")}
                  </p>
                  <Link
                    className="mt-3 inline-flex h-9 items-center border border-[#9ba59f] bg-white px-3 text-sm font-semibold hover:bg-[#f0f2ef]"
                    href="/part-time-check"
                  >
                    Open part-time check
                  </Link>
                </div>
              </div>
            </div>
          ) : null}
          <div className="flex items-center gap-3">
            <ShieldCheck className="text-[#0e6b4f]" size={20} />
            <h2 className="font-semibold">Snapshot prepared</h2>
          </div>
          <p className="mt-2 text-sm text-[#66706b]">
            The immutable snapshot can now be sent to the hard-constraint
            solver.
          </p>
          <form
            action={generateTimetable}
            className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-[160px_220px_190px_auto]"
          >
            <label className="text-sm">
              <span className="mb-1 block text-[#66706b]">Alternatives</span>
              <select
                className="h-10 w-full border border-[#cfd5d1] bg-white px-3"
                defaultValue="1"
                name="alternativeCount"
              >
                {[1, 2, 3, 4, 5].map((count) => (
                  <option key={count} value={count}>
                    {count}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-[#66706b]">
                Maximum quality loss (%)
              </span>
              <input
                className="h-10 w-full border border-[#cfd5d1] bg-white px-3"
                defaultValue="20"
                max="100"
                min="0"
                name="maxQualityDegradationPercent"
                type="number"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-[#66706b]">
                Solver time limit
              </span>
              <select
                className="h-10 w-full border border-[#cfd5d1] bg-white px-3"
                defaultValue="120"
                name="timeLimitSeconds"
              >
                {[30, 60, 120, 180, 300].map((seconds) => (
                  <option key={seconds} value={seconds}>
                    {seconds} seconds
                  </option>
                ))}
              </select>
            </label>
            <GenerationSubmitStatus />
          </form>
          <form action={generateTimetable} className="mt-3">
            <input name="alternativeCount" type="hidden" value="1" />
            <input
              name="maxQualityDegradationPercent"
              type="hidden"
              value="20"
            />
            <input name="timeLimitSeconds" type="hidden" value="180" />
            <GenerationSubmitStatus label="Run 180s check" />
          </form>
        </section>
      )}

      <section className="border-t border-[#dce1dc] pt-5">
        <p className="text-xs uppercase text-[#66706b]">
          Input fingerprint | schema {snapshot.schemaVersion}
        </p>
        <code className="mt-2 block break-all text-xs text-[#3d4742]">
          {fingerprint}
        </code>
      </section>
    </div>
  );
}

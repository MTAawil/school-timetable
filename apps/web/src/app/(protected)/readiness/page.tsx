import { AlertTriangle, CheckCircle2, ShieldCheck } from "lucide-react";
import Link from "next/link";

import { generateTimetable } from "@/app/(protected)/readiness/actions";
import { PageHeading } from "@/components/setup-ui";
import { verifySession } from "@/lib/auth/dal";
import { getCurrentReadiness } from "@/lib/readiness";

const issueDestinations: Record<string, string> = {
  CLASS_CAPACITY_SHORTAGE: "/classes",
  TEACHER_CAPACITY_SHORTAGE: "/availability",
  REQUIREMENT_COMPATIBILITY_SHORTAGE: "/requirements",
  DAILY_CAPACITY_SHORTAGE: "/requirements",
  DISTINCT_DAYS_SHORTAGE: "/requirements",
  ROOM_CAPACITY_SHORTAGE: "/rooms",
  FIXED_TEACHER_COLLISION: "/requirements",
  FIXED_CLASS_COLLISION: "/requirements",
  FIXED_ROOM_COLLISION: "/requirements",
  INSUFFICIENT_CONSECUTIVE_SLOTS: "/requirements",
  LOCKED_ASSIGNMENT_CONFLICT: "/requirements",
};

export default async function ReadinessPage() {
  const user = await verifySession();
  const { snapshot, fingerprint, result } = await getCurrentReadiness(
    user.schoolId,
  );
  const teachingSlots =
    snapshot.calendar.days.filter((day) => day.isWorking).length *
    snapshot.calendar.periods.filter((period) => period.isTeaching).length;

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
          ["Requirements", snapshot.requirements.length],
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
            {result.issues.map((issue) => (
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
                <ul className="mt-3 space-y-1 text-sm text-[#66706b]">
                  {issue.suggestions.map((suggestion) => (
                    <li key={suggestion}>• {suggestion}</li>
                  ))}
                </ul>
                <Link
                  className="mt-4 inline-flex h-9 items-center border border-[#9ba59f] bg-white px-3 text-sm font-semibold hover:bg-[#f0f2ef]"
                  href={issueDestinations[issue.code] ?? "/setup"}
                >
                  Review setup
                </Link>
              </article>
            ))}
          </div>
        </section>
      ) : (
        <section className="border border-[#dce1dc] bg-white p-5">
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
            className="mt-5 grid gap-3 sm:grid-cols-[180px_220px_auto]"
          >
            <label className="text-sm">
              <span className="mb-1 block text-[#66706b]">Alternatives</span>
              <select
                className="h-10 w-full border border-[#cfd5d1] bg-white px-3"
                defaultValue="3"
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
            <button
              className="mt-auto inline-flex h-10 items-center justify-center bg-[#0e6b4f] px-4 text-sm font-semibold text-white hover:bg-[#0b5b43]"
              type="submit"
            >
              Generate timetable
            </button>
          </form>
        </section>
      )}

      <section className="border-t border-[#dce1dc] pt-5">
        <p className="text-xs uppercase text-[#66706b]">
          Input fingerprint · schema {snapshot.schemaVersion}
        </p>
        <code className="mt-2 block break-all text-xs text-[#3d4742]">
          {fingerprint}
        </code>
      </section>
    </div>
  );
}

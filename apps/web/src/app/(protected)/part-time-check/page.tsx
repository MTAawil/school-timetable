import { AlertTriangle, CheckCircle2, ClipboardCheck } from "lucide-react";
import Link from "next/link";
import { z } from "zod";

import { PageHeading, buttonClass, inputClass } from "@/components/setup-ui";
import { verifySession } from "@/lib/auth/dal";
import {
  analyzePartTimeTeacherPressure,
  buildPartTimeCheckSnapshot,
  recordPartTimeCheckAudit,
  solvePartTimeCheck,
  validatePartTimeCheckSnapshot,
} from "@/lib/part-time-check";
import { getCurrentReadiness } from "@/lib/readiness";

const querySchema = z.object({
  run: z.enum(["1"]).optional(),
  timeLimitSeconds: z.coerce.number().int().min(30).max(300).default(60),
});

export default async function PartTimeCheckPage({
  searchParams,
}: {
  searchParams: Promise<{ run?: string; timeLimitSeconds?: string }>;
}) {
  const user = await verifySession();
  const query = querySchema.parse(await searchParams);
  const { snapshot: fullSnapshot } = await getCurrentReadiness(user.schoolId);
  const snapshot = buildPartTimeCheckSnapshot(
    fullSnapshot,
    query.timeLimitSeconds,
  );
  const readiness = validatePartTimeCheckSnapshot(snapshot);
  const pressure = analyzePartTimeTeacherPressure(snapshot);
  const totalSessions = snapshot.requirements.reduce(
    (sum, requirement) => sum + requirement.weeklySessions,
    0,
  );
  const result =
    query.run === "1" && readiness.ready && snapshot.requirements.length > 0
      ? await solvePartTimeCheck(snapshot)
      : null;
  if (result) {
    await recordPartTimeCheckAudit({
      schoolId: user.schoolId,
      userId: user.id,
      snapshot,
      result,
    });
  }
  const successful =
    result?.status === "FEASIBLE" || result?.status === "OPTIMAL";

  return (
    <div className="space-y-7">
      <PageHeading
        title="Part-time mini check"
        description="Run a separate solver check for only part-time teacher availability and assignments. This does not create a timetable or generation job."
      />

      <section className="grid gap-px overflow-hidden border border-[#dce1dc] bg-[#dce1dc] sm:grid-cols-4">
        {[
          ["Part-time teachers", snapshot.teachers.length],
          ["Class subjects", snapshot.requirements.length],
          ["Weekly sessions", totalSessions],
          ["Time limit", `${String(query.timeLimitSeconds)}s`],
        ].map(([label, value]) => (
          <div className="bg-white p-4" key={label}>
            <p className="text-xs uppercase text-[#66706b]">{label}</p>
            <p className="mt-2 text-2xl font-semibold">{value}</p>
          </div>
        ))}
      </section>

      <section className="border border-[#dce1dc] bg-white p-5">
        <div className="flex items-start gap-3">
          <ClipboardCheck className="mt-0.5 text-[#0e6b4f]" size={20} />
          <div>
            <h2 className="font-semibold">Run mini solver</h2>
            <p className="mt-1 text-sm leading-6 text-[#66706b]">
              The check keeps teacher unavailability, class collisions, same-day
              subject limits, shared lessons, and the active quality weights
              from the current setup.
            </p>
          </div>
        </div>
        <form className="mt-5 flex flex-wrap items-end gap-3">
          <input name="run" type="hidden" value="1" />
          <label className="w-full max-w-56 text-sm">
            <span className="mb-1 block text-[#66706b]">Solver time limit</span>
            <select
              className={inputClass}
              defaultValue={String(query.timeLimitSeconds)}
              name="timeLimitSeconds"
            >
              {[30, 60, 120, 180, 300].map((seconds) => (
                <option key={seconds} value={seconds}>
                  {seconds} seconds
                </option>
              ))}
            </select>
          </label>
          <button
            className={buttonClass}
            disabled={snapshot.requirements.length === 0}
          >
            Check part timers
          </button>
        </form>
      </section>

      {snapshot.requirements.length === 0 ? (
        <section className="border border-[#e4bd73] bg-[#fff9e9] p-5 text-sm text-[#5f4a12]">
          No assigned part-time teacher curriculum exists in the current setup.
        </section>
      ) : null}

      {!readiness.ready ? (
        <section className="space-y-3 border border-[#e4bd73] bg-white p-5">
          <h2 className="font-semibold">Part-time setup blockers</h2>
          {readiness.issues.map((issue) => (
            <article
              className="border-t border-[#e7eae7] pt-3 first:border-t-0 first:pt-0"
              key={`${issue.code}:${issue.entityIds.join(":")}`}
            >
              <p className="font-mono text-xs font-semibold text-[#9a3d2c]">
                {issue.code}
              </p>
              <p className="mt-1 text-sm font-medium">{issue.summary}</p>
            </article>
          ))}
        </section>
      ) : null}

      {result ? (
        <section
          className={`flex items-start gap-3 border p-5 ${
            successful
              ? "border-[#9bc8b7] bg-[#f1faf6]"
              : "border-[#e3b7b2] bg-[#fff5f4]"
          }`}
        >
          {successful ? (
            <CheckCircle2 className="text-[#0e6b4f]" size={21} />
          ) : (
            <AlertTriangle className="text-[#9d2e25]" size={21} />
          )}
          <div>
            <h2 className="font-semibold">
              {successful
                ? "Part-time assignments can be scheduled"
                : "Part-time assignments need review"}
            </h2>
            <p className="mt-1 text-sm text-[#66706b]">
              {result.status} | {String(result.runtimeMs)} ms |{" "}
              {String(result.alternatives[0]?.assignments.length ?? 0)} lessons
              placed
            </p>
          </div>
        </section>
      ) : null}

      {result?.diagnostics.length ? (
        <section className="space-y-3 border border-[#e3b7b2] bg-white p-5">
          <h2 className="font-semibold">Mini-check diagnostics</h2>
          {result.diagnostics.map((diagnostic, index) => (
            <article
              className="border-t border-[#e7eae7] pt-3 first:border-t-0 first:pt-0"
              key={`${diagnostic.code ?? "diagnostic"}:${String(index)}`}
            >
              <p className="font-mono text-xs font-semibold text-[#9a3d2c]">
                {diagnostic.code ?? `SOLVER_DIAGNOSTIC_${String(index + 1)}`}
              </p>
              <p className="mt-1 text-sm">
                {diagnostic.summary ?? "The solver reported a diagnostic."}
              </p>
            </article>
          ))}
        </section>
      ) : null}

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">Part-time pressure</h2>
          <Link
            className="text-sm font-semibold text-[#0e6b4f] hover:underline"
            href="/teachers"
          >
            Review teachers
          </Link>
        </div>
        <div className="overflow-x-auto border border-[#dce1dc] bg-white">
          <table className="w-full min-w-[620px] text-left text-sm">
            <thead className="bg-[#f0f2ef] text-xs uppercase text-[#66706b]">
              <tr>
                <th className="px-4 py-3">Teacher</th>
                <th className="px-4 py-3">Weekly sessions</th>
                <th className="px-4 py-3">Available slots</th>
                <th className="px-4 py-3">Pressure</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e7eae7]">
              {pressure.map((teacher) => (
                <tr key={teacher.teacherId}>
                  <td className="px-4 py-3 font-semibold">
                    {teacher.teacherName}
                  </td>
                  <td className="px-4 py-3">{teacher.weeklySessions}</td>
                  <td className="px-4 py-3">{teacher.availableSlots}</td>
                  <td className="px-4 py-3">
                    {teacher.tight ? "Tight" : "Comfortable"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

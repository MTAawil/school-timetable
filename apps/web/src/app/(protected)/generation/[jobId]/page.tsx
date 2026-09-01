import { getDatabase, type SolverSnapshot } from "@school-timetable/database";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { openAlternativeAsDraft } from "@/app/(protected)/generation/actions";
import { PageHeading } from "@/components/setup-ui";
import { verifySession } from "@/lib/auth/dal";
import { assignmentSessionLabel } from "@/lib/session-times";

type StoredAssignment = {
  requirementId: string;
  dayIndex: number;
  periodIndex: number;
  durationPeriods: number;
  roomId: string | null;
};

const diagnosticDetailsSchema = z.object({
  conflicts: z
    .array(
      z.object({
        resourceType: z.enum(["CLASS_SECTION", "TEACHER"]),
        resourceId: z.string(),
        dayIndex: z.number().int().nonnegative(),
        periodIndex: z.number().int().nonnegative(),
        overlap: z.number().int().positive(),
      }),
    )
    .optional(),
  resourceType: z.enum(["CLASS_SECTION", "TEACHER"]).optional(),
  resourceName: z.string().optional(),
  required: z.number().int().nonnegative().optional(),
  requirementCount: z.number().int().nonnegative().optional(),
  requirements: z
    .array(
      z.object({
        requirementId: z.string(),
        className: z.string(),
        subjectName: z.string(),
        teacherName: z.string(),
        weeklySessions: z.number().int().nonnegative(),
        dailyLimit: z.number().int().positive(),
        distinctDayMinimum: z.number().int().positive(),
        compatibleStarts: z.number().int().nonnegative(),
      }),
    )
    .optional(),
});

export default async function GenerationResultPage({
  params,
  searchParams,
}: {
  params: Promise<{ jobId: string }>;
  searchParams: Promise<{ alternative?: string }>;
}) {
  const user = await verifySession();
  const { jobId } = await params;
  const db = getDatabase();
  const job = await db.generationJob.findFirst({
    where: { id: jobId, schoolId: user.schoolId },
    include: { alternatives: { orderBy: { rank: "asc" } }, diagnostics: true },
  });
  if (!job) notFound();
  const parsedDiagnostics = job.diagnostics.map((diagnostic) => ({
    ...diagnostic,
    details: diagnosticDetailsSchema.safeParse(diagnostic.details),
  }));
  const conflicts = parsedDiagnostics.flatMap((diagnostic) =>
    diagnostic.details.success ? (diagnostic.details.data.conflicts ?? []) : [],
  );
  const [conflictClasses, conflictTeachers, days, periods] = await Promise.all([
    db.classSection.findMany({
      where: {
        schoolId: user.schoolId,
        id: {
          in: conflicts
            .filter((conflict) => conflict.resourceType === "CLASS_SECTION")
            .map((conflict) => conflict.resourceId),
        },
      },
      select: { id: true, sectionName: true },
    }),
    db.teacher.findMany({
      where: {
        schoolId: user.schoolId,
        id: {
          in: conflicts
            .filter((conflict) => conflict.resourceType === "TEACHER")
            .map((conflict) => conflict.resourceId),
        },
      },
      select: { id: true, name: true },
    }),
    db.dayDefinition.findMany({
      where: { schoolId: user.schoolId, termId: job.termId },
      select: { dayIndex: true, name: true },
    }),
    db.periodDefinition.findMany({
      where: { schoolId: user.schoolId, termId: job.termId },
      select: { periodIndex: true, name: true },
    }),
  ]);

  const requestedRank = Number((await searchParams).alternative ?? "1");
  const alternative =
    job.alternatives.find((item) => item.rank === requestedRank) ??
    job.alternatives[0];
  const assignments = (alternative?.assignments ?? []) as StoredAssignment[];
  const penaltyBreakdown = (alternative?.penaltyBreakdown ?? {}) as Record<
    string,
    number
  >;
  const successful = job.status === "FEASIBLE" || job.status === "OPTIMAL";
  const timedOut = job.diagnostics.some(
    (diagnostic) => diagnostic.code === "SOLVER_TIME_LIMIT_REACHED",
  );
  const responseMetadata = z
    .object({ runtimeMs: z.number().int().nonnegative().optional() })
    .safeParse(job.responseMetadata);
  const runtimeMs =
    alternative?.runtimeMs ??
    (responseMetadata.success ? responseMetadata.data.runtimeMs : undefined) ??
    0;
  const classNames = new Map(
    conflictClasses.map((item) => [item.id, item.sectionName]),
  );
  const teacherNames = new Map(
    conflictTeachers.map((item) => [item.id, item.name]),
  );
  const dayNames = new Map(days.map((item) => [item.dayIndex, item.name]));
  const snapshot = job.inputSnapshot as unknown as SolverSnapshot;
  const periodNames = new Map(
    periods.map((item) => [item.periodIndex, item.name]),
  );

  return (
    <div className="space-y-7">
      <PageHeading
        title="Generation result"
        description={`Job ${job.id} · ${job.status.toLowerCase()}`}
      />
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
              ? `${String(assignments.length)} lessons assigned`
              : "No timetable was produced"}
          </h2>
          <p className="mt-1 text-sm text-[#66706b]">
            {job.errorMessage ??
              `${alternative?.solverStatus ?? job.status} | ${String(runtimeMs)} ms`}
          </p>
        </div>
      </section>
      {!successful && job.diagnostics.length > 0 ? (
        <section className="space-y-4 border border-[#e3b7b2] bg-white p-5">
          <div>
            <h2 className="font-semibold">
              {timedOut
                ? "The solver needs more time"
                : "Why generation failed"}
            </h2>
            <p className="mt-1 text-sm leading-6 text-[#66706b]">
              {timedOut
                ? "The search ended before the solver could prove whether a valid timetable exists. This is not an infeasibility result. Return to Generate and retry with a longer solver time limit."
                : "These are not existing bookings. They are example overlaps from the closest relaxed timetable the solver could construct. The combined hard restrictions leave no collision-free arrangement."}
            </p>
          </div>
          {parsedDiagnostics.map((diagnostic) => (
            <div key={diagnostic.id}>
              <p className="font-mono text-xs font-semibold text-[#9a3d2c]">
                {diagnostic.code}
              </p>
              <p className="mt-1 text-sm font-medium">{diagnostic.summary}</p>
              {diagnostic.details.success &&
              diagnostic.details.data.conflicts?.length ? (
                <ul
                  aria-label="Example forced overlaps"
                  className="mt-3 grid gap-2 text-sm sm:grid-cols-2"
                >
                  {diagnostic.details.data.conflicts.map((conflict) => {
                    const resourceName =
                      conflict.resourceType === "TEACHER"
                        ? (teacherNames.get(conflict.resourceId) ??
                          "Unknown teacher")
                        : (classNames.get(conflict.resourceId) ??
                          "Unknown class");
                    return (
                      <li
                        className="border border-[#e3b7b2] bg-[#fff7f5] px-3 py-2"
                        key={`${conflict.resourceType}:${conflict.resourceId}:${String(conflict.dayIndex)}:${String(conflict.periodIndex)}`}
                      >
                        <span className="font-semibold">{resourceName}</span>
                        <span className="block text-xs text-[#66706b]">
                          {conflict.resourceType === "TEACHER"
                            ? "Teacher"
                            : "Class"}{" "}
                          would be forced to overlap on{" "}
                          {dayNames.get(conflict.dayIndex) ??
                            `day ${String(conflict.dayIndex + 1)}`}
                          ,{" "}
                          {periodNames.get(conflict.periodIndex) ??
                            `session ${String(conflict.periodIndex + 1)}`}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
              {diagnostic.details.success &&
              diagnostic.details.data.requirements?.length ? (
                <div className="mt-3 overflow-x-auto border border-[#e7eae7]">
                  <table className="w-full min-w-[760px] border-collapse text-left text-xs">
                    <thead className="bg-[#f8f1ef] font-semibold text-[#66706b]">
                      <tr>
                        <th className="border-b border-[#e7eae7] px-3 py-2">
                          Class
                        </th>
                        <th className="border-b border-[#e7eae7] px-3 py-2">
                          Subject
                        </th>
                        <th className="border-b border-[#e7eae7] px-3 py-2">
                          Teacher
                        </th>
                        <th className="border-b border-[#e7eae7] px-3 py-2">
                          Sessions
                        </th>
                        <th className="border-b border-[#e7eae7] px-3 py-2">
                          Daily limit
                        </th>
                        <th className="border-b border-[#e7eae7] px-3 py-2">
                          Valid starts
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#e7eae7]">
                      {diagnostic.details.data.requirements.map(
                        (requirement) => (
                          <tr key={requirement.requirementId}>
                            <td className="px-3 py-2">
                              {requirement.className}
                            </td>
                            <td className="px-3 py-2">
                              {requirement.subjectName}
                            </td>
                            <td className="px-3 py-2">
                              {requirement.teacherName}
                            </td>
                            <td className="px-3 py-2">
                              {requirement.weeklySessions}
                            </td>
                            <td className="px-3 py-2">
                              {requirement.dailyLimit}
                            </td>
                            <td className="px-3 py-2">
                              {requirement.compatibleStarts}
                            </td>
                          </tr>
                        ),
                      )}
                    </tbody>
                  </table>
                  {diagnostic.details.data.requirementCount &&
                  diagnostic.details.data.requirementCount >
                    diagnostic.details.data.requirements.length ? (
                    <p className="border-t border-[#e7eae7] px-3 py-2 text-xs text-[#66706b]">
                      Showing {diagnostic.details.data.requirements.length} of{" "}
                      {diagnostic.details.data.requirementCount} rows.
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          ))}
          <div className="flex flex-wrap gap-2 border-t border-[#dce1dc] pt-4">
            <Link
              className="inline-flex h-9 items-center bg-[#0e6b4f] px-3 text-sm font-semibold text-white hover:bg-[#0b5b43]"
              href={timedOut ? "/readiness" : "/teachers"}
            >
              {timedOut ? "Retry with more time" : "Review teacher limits"}
            </Link>
            {!timedOut ? (
              <Link
                className="inline-flex h-9 items-center border border-[#9ba59f] bg-white px-3 text-sm font-semibold hover:bg-[#f0f2ef]"
                href="/subjects"
              >
                Review curriculum
              </Link>
            ) : null}
          </div>
        </section>
      ) : null}
      {job.alternatives.length > 1 ? (
        <nav
          aria-label="Generated alternatives"
          className="flex overflow-x-auto border border-[#dce1dc] bg-white"
        >
          {job.alternatives.map((item) => (
            <Link
              className={`min-w-40 border-r border-[#dce1dc] px-4 py-3 text-sm last:border-r-0 ${
                item.id === alternative?.id
                  ? "bg-[#e9f4ef] text-[#0e6b4f]"
                  : "hover:bg-[#f5f6f3]"
              }`}
              href={`/generation/${job.id}?alternative=${String(item.rank)}`}
              key={item.id}
            >
              <span className="block font-semibold">
                Alternative {item.rank}
              </span>
              <span className="mt-1 block text-xs text-[#66706b]">
                Score {item.totalPenalty} · Diversity {item.diversityScore ?? 0}
              </span>
            </Link>
          ))}
        </nav>
      ) : null}
      {alternative ? (
        <section className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold">Quality score</h2>
              <p className="mt-1 text-sm text-[#66706b]">
                Diversity {alternative.diversityScore ?? 0}
              </p>
            </div>
            <div className="flex items-center gap-4">
              <p className="text-2xl font-semibold">
                {alternative.totalPenalty}
              </p>
              <form action={openAlternativeAsDraft}>
                <input
                  name="alternativeId"
                  type="hidden"
                  value={alternative.id}
                />
                <button className="h-10 bg-[#0e6b4f] px-4 text-sm font-semibold text-white">
                  Open as draft
                </button>
              </form>
            </div>
          </div>
          <div className="divide-y divide-[#e7eae7] border border-[#dce1dc] bg-white">
            {Object.entries(penaltyBreakdown).map(([code, penalty]) => (
              <div
                className="flex items-center justify-between px-4 py-3 text-sm"
                key={code}
              >
                <code className="text-xs text-[#56615c]">{code}</code>
                <strong>{penalty}</strong>
              </div>
            ))}
          </div>
        </section>
      ) : null}
      {assignments.length > 0 ? (
        <div className="overflow-x-auto border border-[#dce1dc] bg-white">
          <table className="w-full min-w-[620px] text-left text-sm">
            <thead className="bg-[#f0f2ef] text-xs uppercase text-[#66706b]">
              <tr>
                <th className="px-4 py-3">Requirement</th>
                <th className="px-4 py-3">Day</th>
                <th className="px-4 py-3">Period</th>
                <th className="px-4 py-3">Duration</th>
                <th className="px-4 py-3">Room</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e7eae7]">
              {assignments.map((assignment, index) => (
                <tr key={`${assignment.requirementId}:${String(index)}`}>
                  <td className="px-4 py-3 font-mono text-xs">
                    {assignment.requirementId}
                  </td>
                  <td className="px-4 py-3">{assignment.dayIndex + 1}</td>
                  <td className="px-4 py-3">
                    {assignmentSessionLabel(
                      snapshot,
                      assignment.requirementId,
                      assignment.periodIndex,
                      assignment.durationPeriods,
                    )}
                  </td>
                  <td className="px-4 py-3">{assignment.durationPeriods}</td>
                  <td className="px-4 py-3">
                    {assignment.roomId ?? "Not required"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <code className="block break-all border-t border-[#dce1dc] pt-5 text-xs text-[#66706b]">
        {job.inputFingerprint}
      </code>
    </div>
  );
}

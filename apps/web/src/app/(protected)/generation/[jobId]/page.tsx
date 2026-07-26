import { getDatabase } from "@school-timetable/database";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeading } from "@/components/setup-ui";
import { openAlternativeAsDraft } from "@/app/(protected)/generation/actions";
import { verifySession } from "@/lib/auth/dal";

type StoredAssignment = {
  requirementId: string;
  dayIndex: number;
  periodIndex: number;
  durationPeriods: number;
  roomId: string | null;
};

export default async function GenerationResultPage({
  params,
  searchParams,
}: {
  params: Promise<{ jobId: string }>;
  searchParams: Promise<{ alternative?: string }>;
}) {
  const user = await verifySession();
  const { jobId } = await params;
  const job = await getDatabase().generationJob.findFirst({
    where: { id: jobId, schoolId: user.schoolId },
    include: { alternatives: { orderBy: { rank: "asc" } }, diagnostics: true },
  });
  if (!job) notFound();

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
              `${alternative?.solverStatus ?? job.status} · ${String(alternative?.runtimeMs ?? 0)} ms`}
          </p>
        </div>
      </section>
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
                  <td className="px-4 py-3">{assignment.periodIndex + 1}</td>
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

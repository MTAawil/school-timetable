import { getDatabase } from "@school-timetable/database";
import Link from "next/link";

import { openAlternativeAsDraft } from "@/app/(protected)/generation/actions";
import { EntityTable } from "@/components/entity-table";
import { PageHeading } from "@/components/setup-ui";
import { verifySession } from "@/lib/auth/dal";
import { getActiveTerm } from "@/lib/setup";

export default async function SchedulesPage() {
  const user = await verifySession();
  const term = await getActiveTerm(user.schoolId);
  const db = getDatabase();
  const [schedules, recentJobs] = await Promise.all([
    db.schedule.findMany({
      where: { schoolId: user.schoolId, termId: term.id },
      include: { _count: { select: { assignments: true } } },
      orderBy: { version: "desc" },
    }),
    db.generationJob.findMany({
      where: { schoolId: user.schoolId, termId: term.id },
      include: {
        alternatives: {
          orderBy: { rank: "asc" },
          select: {
            id: true,
            rank: true,
            totalPenalty: true,
            schedule: { select: { id: true, version: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);
  return (
    <div className="space-y-7">
      <PageHeading
        title="Timetables"
        description={`Draft and published schedule versions for ${term.name}.`}
      />
      <section className="space-y-3">
        <h2 className="text-base font-semibold">Schedule versions</h2>
        <EntityTable
          headers={["Version", "Name", "Status", "Assignments", "Updated"]}
          emptyMessage="No schedule versions yet."
          rows={schedules.map((schedule) => [
            <Link
              className="font-semibold text-[#0e6b4f] hover:underline"
              href={`/schedules/${schedule.id}`}
              key={schedule.id}
            >
              Version {schedule.version}
            </Link>,
            schedule.name,
            schedule.status.toLowerCase(),
            schedule._count.assignments,
            schedule.updatedAt.toLocaleString(),
          ])}
        />
      </section>
      <section className="space-y-3">
        <h2 className="text-base font-semibold">Recent generation results</h2>
        <EntityTable
          headers={["Generated", "Status", "Best score", "Result", "Draft"]}
          emptyMessage="No generation results yet."
          rows={recentJobs.map((job) => {
            const alternative = job.alternatives[0];
            const schedule = alternative?.schedule;
            const successful =
              job.status === "FEASIBLE" || job.status === "OPTIMAL";
            return [
              job.createdAt.toLocaleString(),
              job.status.toLowerCase(),
              alternative?.totalPenalty ?? "-",
              <Link
                className="font-semibold text-[#0e6b4f] hover:underline"
                href={`/generation/${job.id}`}
                key={job.id}
              >
                Open result
              </Link>,
              schedule ? (
                <Link
                  className="font-semibold text-[#0e6b4f] hover:underline"
                  href={`/schedules/${schedule.id}`}
                  key={schedule.id}
                >
                  Version {schedule.version}
                </Link>
              ) : alternative && successful ? (
                <form action={openAlternativeAsDraft} key={alternative.id}>
                  <input
                    name="alternativeId"
                    type="hidden"
                    value={alternative.id}
                  />
                  <button className="h-8 border border-[#0e6b4f] px-3 text-sm font-semibold text-[#0e6b4f] hover:bg-[#e9f4ef]">
                    Open draft
                  </button>
                </form>
              ) : (
                "-"
              ),
            ];
          })}
        />
      </section>
    </div>
  );
}

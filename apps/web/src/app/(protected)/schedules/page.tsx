import { getDatabase } from "@school-timetable/database";
import Link from "next/link";

import { EntityTable } from "@/components/entity-table";
import { PageHeading } from "@/components/setup-ui";
import { verifySession } from "@/lib/auth/dal";
import { getActiveTerm } from "@/lib/setup";

export default async function SchedulesPage() {
  const user = await verifySession();
  const term = await getActiveTerm(user.schoolId);
  const schedules = await getDatabase().schedule.findMany({
    where: { schoolId: user.schoolId, termId: term.id },
    include: { _count: { select: { assignments: true } } },
    orderBy: { version: "desc" },
  });
  return (
    <div className="space-y-7">
      <PageHeading
        title="Timetables"
        description={`Draft and published schedule versions for ${term.name}.`}
      />
      <EntityTable
        headers={["Version", "Name", "Status", "Assignments", "Updated"]}
        emptyMessage="Open a generated alternative as a draft to begin editing."
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
    </div>
  );
}

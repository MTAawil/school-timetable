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
    where: {
      schoolId: user.schoolId,
      termId: term.id,
      OR: [{ status: { not: "DRAFT" } }, { isSavedDraft: true }],
    },
    include: { _count: { select: { assignments: true } } },
    orderBy: { version: "desc" },
  });
  return (
    <div className="space-y-7">
      <PageHeading
        title="Timetables"
        description={`Saved working drafts, copies, and published timetables for ${term.name}. Internal edit history stays hidden.`}
      />
      <EntityTable
        headers={["Timetable", "Status", "Assignments", "Saved"]}
        emptyMessage="Open a generated alternative as a draft to begin editing."
        rows={schedules.map((schedule) => [
          <Link
            className="font-semibold text-[#0e6b4f] hover:underline"
            href={`/schedules/${schedule.id}`}
            key={schedule.id}
          >
            {schedule.name}
          </Link>,
          schedule.status.toLowerCase(),
          schedule._count.assignments,
          (schedule.savedAt ?? schedule.updatedAt).toLocaleString(),
        ])}
      />
    </div>
  );
}

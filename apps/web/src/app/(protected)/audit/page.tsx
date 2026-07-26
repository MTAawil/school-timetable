import { getDatabase } from "@school-timetable/database";
import Link from "next/link";

import { PageHeading } from "@/components/setup-ui";
import { verifySession } from "@/lib/auth/dal";

export default async function AuditPage() {
  const user = await verifySession();
  const events = await getDatabase().auditLog.findMany({
    where: { schoolId: user.schoolId },
    include: { user: true, schedule: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div className="space-y-6">
      <PageHeading
        title="Activity"
        description="Recent generation, editing, locking, regeneration, and publication events."
      />
      <div className="overflow-x-auto border border-[#dce1dc] bg-white">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-[#f0f2ef] text-xs uppercase text-[#66706b]">
            <tr>
              <th className="px-4 py-3">Time</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">Schedule</th>
              <th className="px-4 py-3">Administrator</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#e5e8e5]">
            {events.map((event) => (
              <tr key={event.id}>
                <td className="px-4 py-3 text-[#66706b]">
                  {event.createdAt.toLocaleString("en-GB")}
                </td>
                <td className="px-4 py-3 font-medium">
                  {event.action.replaceAll("_", " ")}
                </td>
                <td className="px-4 py-3">
                  {event.schedule ? (
                    <Link
                      className="text-[#0e6b4f] underline"
                      href={`/schedules/${event.schedule.id}`}
                    >
                      v{String(event.schedule.version)}
                    </Link>
                  ) : (
                    "-"
                  )}
                </td>
                <td className="px-4 py-3">{event.user?.name ?? "System"}</td>
              </tr>
            ))}
            {events.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-[#66706b]" colSpan={4}>
                  No activity has been recorded.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

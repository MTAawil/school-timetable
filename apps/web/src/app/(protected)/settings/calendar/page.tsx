import { getDatabase } from "@school-timetable/database";

import { EntityTable } from "@/components/entity-table";
import { PageHeading } from "@/components/setup-ui";
import { verifySession } from "@/lib/auth/dal";
import { getActiveTerm } from "@/lib/setup";

function formatTime(value: Date) {
  return value.toLocaleTimeString("en", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  });
}

export default async function CalendarPage() {
  const user = await verifySession();
  const term = await getActiveTerm(user.schoolId);
  const db = getDatabase();
  const [days, periods] = await Promise.all([
    db.dayDefinition.findMany({
      where: { schoolId: user.schoolId, termId: term.id },
      orderBy: { dayIndex: "asc" },
    }),
    db.periodDefinition.findMany({
      where: { schoolId: user.schoolId, termId: term.id },
      orderBy: { periodIndex: "asc" },
    }),
  ]);
  return (
    <div className="space-y-7">
      <PageHeading
        title="Calendar structure"
        description={`Review the teaching week for ${term.name}.`}
      />
      <dl className="grid border border-[#dce1dc] bg-white sm:grid-cols-3">
        <div className="p-4">
          <dt className="text-xs uppercase text-[#66706b]">Term</dt>
          <dd className="mt-1 font-medium">{term.name}</dd>
        </div>
        <div className="border-y border-[#dce1dc] p-4 sm:border-x sm:border-y-0">
          <dt className="text-xs uppercase text-[#66706b]">Dates</dt>
          <dd className="mt-1 font-medium">
            {term.startsOn.toLocaleDateString()} -{" "}
            {term.endsOn.toLocaleDateString()}
          </dd>
        </div>
        <div className="p-4">
          <dt className="text-xs uppercase text-[#66706b]">Rooms</dt>
          <dd className="mt-1 font-medium">
            {term.roomsEnabled ? "Enabled" : "Disabled"}
          </dd>
        </div>
      </dl>
      <section className="space-y-3">
        <h2 className="text-base font-semibold">Teaching days</h2>
        <EntityTable
          headers={["Order", "Day", "Status"]}
          emptyMessage="No days configured."
          rows={days.map((day) => [
            day.dayIndex + 1,
            day.name,
            day.isWorking ? "Working day" : "Closed",
          ])}
        />
      </section>
      <section className="space-y-3">
        <h2 className="text-base font-semibold">Daily periods</h2>
        <EntityTable
          headers={["Order", "Period", "Time", "Type"]}
          emptyMessage="No periods configured."
          rows={periods.map((period) => [
            period.periodIndex + 1,
            period.name,
            `${formatTime(period.startsAt)} - ${formatTime(period.endsAt)}`,
            period.isTeaching ? "Teaching" : "Break",
          ])}
        />
      </section>
    </div>
  );
}

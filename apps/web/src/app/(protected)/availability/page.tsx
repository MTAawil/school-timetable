import { getDatabase } from "@school-timetable/database";
import { Save } from "lucide-react";

import { saveTeacherAvailability } from "@/app/(protected)/setup/actions";
import { AvailabilityGrid } from "@/components/availability-grid";
import { PageHeading, buttonClass, inputClass } from "@/components/setup-ui";
import { verifySession } from "@/lib/auth/dal";
import { getActiveTerm } from "@/lib/setup";

export default async function AvailabilityPage({
  searchParams,
}: {
  searchParams: Promise<{ teacher?: string }>;
}) {
  const user = await verifySession();
  const term = await getActiveTerm(user.schoolId);
  const db = getDatabase();
  const teachers = await db.teacher.findMany({
    where: { schoolId: user.schoolId, deletedAt: null },
    orderBy: { name: "asc" },
  });
  const requestedTeacher = (await searchParams).teacher;
  const teacher =
    teachers.find((item) => item.id === requestedTeacher) ?? teachers[0];
  const [days, periods, rules] = await Promise.all([
    db.dayDefinition.findMany({
      where: { schoolId: user.schoolId, termId: term.id, isWorking: true },
      orderBy: { dayIndex: "asc" },
    }),
    db.periodDefinition.findMany({
      where: { schoolId: user.schoolId, termId: term.id },
      orderBy: { periodIndex: "asc" },
    }),
    teacher
      ? db.availabilityRule.findMany({
          where: {
            schoolId: user.schoolId,
            termId: term.id,
            entityType: "TEACHER",
            entityId: teacher.id,
            state: "UNAVAILABLE",
          },
        })
      : [],
  ]);
  const unavailable = new Set(
    rules.map((rule) => `${rule.dayIndex}:${rule.periodIndex}`),
  );

  return (
    <div className="space-y-7">
      <PageHeading
        title="Teacher availability"
        description="Check each lesson when the selected teacher cannot be scheduled."
      />
      {teachers.length === 0 ? (
        <p className="border border-[#dce1dc] bg-white p-5 text-sm">
          Add a teacher before setting availability.
        </p>
      ) : (
        <>
          <form className="flex max-w-lg gap-3" method="get">
            <select
              aria-label="Teacher"
              className={inputClass}
              name="teacher"
              defaultValue={teacher?.id}
            >
              {teachers.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <button className="h-10 border border-[#9ba59f] bg-white px-4 text-sm font-semibold hover:bg-[#f0f2ef]">
              View
            </button>
          </form>
          <form action={saveTeacherAvailability} className="space-y-4">
            <input name="teacherId" type="hidden" value={teacher?.id} />
            <AvailabilityGrid
              days={days}
              periods={periods}
              unavailable={unavailable}
            />
            <div className="flex justify-end">
              <button className={buttonClass}>
                <Save size={16} className="mr-2" />
                Save availability
              </button>
            </div>
          </form>
        </>
      )}
    </div>
  );
}

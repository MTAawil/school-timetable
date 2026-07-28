import { getDatabase } from "@school-timetable/database";
import { Check, SlidersHorizontal } from "lucide-react";

import { saveTeacherRestrictions } from "@/app/(protected)/availability/actions";
import { AvailabilityGrid } from "@/components/availability-grid";
import { PageHeading, inputClass } from "@/components/setup-ui";
import { verifySession } from "@/lib/auth/dal";
import { getActiveTerm } from "@/lib/setup";

export default async function AvailabilityPage({
  searchParams,
}: {
  searchParams: Promise<{ teacher?: string; saved?: string }>;
}) {
  const user = await verifySession();
  const term = await getActiveTerm(user.schoolId);
  const db = getDatabase();
  const teachers = await db.teacher.findMany({
    where: { schoolId: user.schoolId, deletedAt: null },
    orderBy: { name: "asc" },
  });
  const params = await searchParams;
  const requestedTeacher = params.teacher;
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
          },
        })
      : [],
  ]);

  return (
    <div className="space-y-8">
      <PageHeading
        title="Teacher restrictions"
        description={`Set hard restrictions and soft preferences for ${term.name}.`}
      />
      {params.saved ? (
        <div
          className="flex items-center gap-2 border border-[#9bc8b5] bg-[#eef8f3] px-4 py-3 text-sm font-medium text-[#0b5b43]"
          role="status"
        >
          <Check aria-hidden="true" size={17} />
          Teacher restrictions saved.
        </div>
      ) : null}
      {teachers.length === 0 ? (
        <p className="border border-[#e0c78f] bg-[#fff9e9] px-4 py-3 text-sm text-[#6e5314]">
          Add a teacher before setting availability.
        </p>
      ) : (
        <>
          <section className="space-y-4">
            <div className="flex items-center gap-3 border-b border-[#dce1dc] pb-3">
              <SlidersHorizontal
                aria-hidden="true"
                size={20}
                className="text-[#0e6b4f]"
              />
              <h2 className="font-semibold">Selected teacher</h2>
            </div>
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
          </section>
          {teacher ? (
            <AvailabilityGrid
              days={days}
              periods={periods}
              restrictions={rules.flatMap((rule) =>
                rule.state === "AVAILABLE"
                  ? []
                  : [
                      {
                        dayIndex: rule.dayIndex,
                        periodIndex: rule.periodIndex,
                        state: rule.state,
                      },
                    ],
              )}
              teacher={{
                id: teacher.id,
                employmentType: teacher.employmentType,
                weeklyTeachingSessions: teacher.weeklyTeachingSessions,
                maxLessonsPerDay: teacher.maxLessonsPerDay,
                maxConsecutiveLessons: teacher.maxConsecutiveLessons,
              }}
              action={saveTeacherRestrictions}
            />
          ) : null}
        </>
      )}
    </div>
  );
}

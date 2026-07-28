import {
  buildSchoolPeriods,
  defaultGradeLevels,
  getDatabase,
  gradeCode,
} from "@school-timetable/database";
import { CalendarClock, Check, GraduationCap, Save } from "lucide-react";

import {
  saveGradeSections,
  saveSchoolWeek,
  saveSectionNames,
} from "@/app/(protected)/setup/actions";
import { buttonClass, inputClass, PageHeading } from "@/components/setup-ui";
import { WorkflowNextAction } from "@/components/workflow-next-action";
import { verifySession } from "@/lib/auth/dal";
import { getActiveTerm } from "@/lib/setup";

const weekDays = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

function timeInputValue(minutes: number): string {
  return `${Math.floor(minutes / 60)
    .toString()
    .padStart(2, "0")}:${(minutes % 60).toString().padStart(2, "0")}`;
}

function displayTime(minutes: number): string {
  return timeInputValue(minutes);
}

export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const user = await verifySession();
  const term = await getActiveTerm(user.schoolId);
  const db = getDatabase();
  const [configuration, days, grades] = await Promise.all([
    db.schoolWeekConfiguration.findFirst({
      where: { schoolId: user.schoolId, termId: term.id },
    }),
    db.dayDefinition.findMany({
      where: { schoolId: user.schoolId, termId: term.id, isWorking: true },
      orderBy: { dayIndex: "asc" },
    }),
    db.gradeLevel.findMany({
      where: { schoolId: user.schoolId },
      orderBy: { displayOrder: "asc" },
      include: {
        classSections: {
          where: {
            termId: term.id,
            isActive: true,
            deletedAt: null,
          },
        },
      },
    }),
  ]);
  const params = await searchParams;
  const selectedDays =
    days.length > 0
      ? new Set(days.map((day) => day.name))
      : new Set(weekDays.slice(0, 5));
  const week = configuration ?? {
    workingDayCount: 5,
    sessionsPerDay: 8,
    sessionDurationMinutes: 50,
    firstSessionStartMinutes: 480,
    breakAfterSession: 4,
    breakDurationMinutes: 20,
  };
  const previewPeriods = buildSchoolPeriods(week);
  const gradeCounts = new Map(
    grades.map((grade) => [grade.code, grade.classSections.length]),
  );
  const gradeNames = new Map(grades.map((grade) => [grade.code, grade.name]));
  const sections = grades.flatMap((grade) =>
    grade.classSections.map((section) => ({ grade, section })),
  );

  return (
    <div className="space-y-8">
      <PageHeading
        title="School setup"
        description={`Set the weekly structure and classes for ${term.name}.`}
      />

      {params.saved ? (
        <div
          className="flex items-center gap-2 border border-[#9bc8b5] bg-[#eef8f3] px-4 py-3 text-sm font-medium text-[#0b5b43]"
          role="status"
        >
          <Check aria-hidden="true" size={17} />
          {params.saved === "week"
            ? "School week saved."
            : params.saved === "names"
              ? "Class names saved."
              : "Grade sections saved."}
        </div>
      ) : null}

      <section className="space-y-5" aria-labelledby="week-heading">
        <div className="flex items-center gap-3 border-b border-[#dce1dc] pb-3">
          <CalendarClock
            aria-hidden="true"
            size={20}
            className="text-[#0e6b4f]"
          />
          <div>
            <h2 id="week-heading" className="font-semibold">
              School week
            </h2>
            <p className="mt-1 text-sm text-[#66706b]">
              Every selected day uses this same session structure.
            </p>
          </div>
        </div>

        <form action={saveSchoolWeek} className="space-y-5">
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Working days</legend>
            <div className="flex flex-wrap gap-x-5 gap-y-2 border border-[#dce1dc] bg-white px-4 py-3">
              {weekDays.map((day) => (
                <label
                  key={day}
                  className="flex min-h-8 items-center gap-2 text-sm"
                >
                  <input
                    type="checkbox"
                    name="workingDays"
                    value={day}
                    defaultChecked={selectedDays.has(day)}
                    className="size-4 accent-[#0e6b4f]"
                  />
                  {day}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="text-sm font-medium">
              Sessions each day
              <input
                className={`${inputClass} mt-2`}
                name="sessionsPerDay"
                type="number"
                min="2"
                max="16"
                defaultValue={week.sessionsPerDay}
                required
              />
            </label>
            <label className="text-sm font-medium">
              Session duration
              <div className="relative mt-2">
                <input
                  className={`${inputClass} pr-16`}
                  name="sessionDurationMinutes"
                  type="number"
                  min="20"
                  max="120"
                  defaultValue={week.sessionDurationMinutes}
                  required
                />
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-[#66706b]">
                  minutes
                </span>
              </div>
            </label>
            <label className="text-sm font-medium">
              First session starts
              <input
                className={`${inputClass} mt-2`}
                name="firstSessionStart"
                type="time"
                defaultValue={timeInputValue(week.firstSessionStartMinutes)}
                required
              />
            </label>
            <label className="text-sm font-medium">
              Break after session
              <input
                className={`${inputClass} mt-2`}
                name="breakAfterSession"
                type="number"
                min="1"
                max="15"
                defaultValue={week.breakAfterSession}
                required
              />
            </label>
            <label className="text-sm font-medium">
              Break duration
              <div className="relative mt-2">
                <input
                  className={`${inputClass} pr-16`}
                  name="breakDurationMinutes"
                  type="number"
                  min="5"
                  max="120"
                  defaultValue={week.breakDurationMinutes}
                  required
                />
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-[#66706b]">
                  minutes
                </span>
              </div>
            </label>
          </div>

          <div className="overflow-x-auto border-y border-[#dce1dc] bg-white">
            <div className="flex min-w-max">
              {previewPeriods.map((period) => (
                <div
                  key={period.periodIndex}
                  className={`w-32 border-r border-[#dce1dc] px-3 py-3 last:border-r-0 ${
                    period.isTeaching ? "" : "bg-[#f2f5f2]"
                  }`}
                >
                  <p className="text-xs font-semibold">{period.name}</p>
                  <p className="mt-1 text-xs text-[#66706b]">
                    {displayTime(period.startsAtMinutes)}-
                    {displayTime(period.endsAtMinutes)}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <button className={buttonClass} type="submit">
            <Save aria-hidden="true" className="mr-2" size={16} />
            Save school week
          </button>
        </form>
      </section>

      <section className="space-y-5" aria-labelledby="grades-heading">
        <div className="flex items-center gap-3 border-b border-[#dce1dc] pb-3">
          <GraduationCap
            aria-hidden="true"
            size={20}
            className="text-[#0e6b4f]"
          />
          <div>
            <h2 id="grades-heading" className="font-semibold">
              Grade sections
            </h2>
            <p className="mt-1 text-sm text-[#66706b]">
              Enter how many classes the school has in each grade.
            </p>
          </div>
        </div>

        <form action={saveGradeSections} className="space-y-5">
          <div className="grid border-l border-t border-[#dce1dc] sm:grid-cols-2 lg:grid-cols-3">
            {defaultGradeLevels.map((grade) => {
              const code = gradeCode(grade);
              return (
                <label
                  key={grade}
                  className="grid min-h-20 grid-cols-[1fr_5rem] items-center gap-3 border-r border-b border-[#dce1dc] bg-white px-4 py-3"
                >
                  <span>
                    <span className="sr-only">{grade} grade name</span>
                    <input
                      className="h-9 w-full border border-transparent bg-transparent px-2 text-sm font-medium outline-none hover:border-[#cfd5d1] focus:border-[#0e6b4f] focus:bg-white"
                      name={`gradeName:${code}`}
                      defaultValue={gradeNames.get(code) ?? grade}
                      maxLength={40}
                      required
                    />
                  </span>
                  <input
                    className="h-9 w-20 border border-[#cfd5d1] px-2 text-center text-sm outline-none focus:border-[#0e6b4f] focus:ring-2 focus:ring-[#0e6b4f]/15"
                    aria-label={`${grade} section count`}
                    name={`grade:${code}`}
                    type="number"
                    min="0"
                    max="52"
                    defaultValue={gradeCounts.get(code) ?? 0}
                    required
                  />
                </label>
              );
            })}
          </div>
          <button className={buttonClass} type="submit">
            <Save aria-hidden="true" className="mr-2" size={16} />
            Save grade sections
          </button>
        </form>
      </section>

      {sections.length > 0 ? (
        <section className="space-y-5" aria-labelledby="names-heading">
          <div className="border-b border-[#dce1dc] pb-3">
            <h2 id="names-heading" className="font-semibold">
              Class names
            </h2>
            <p className="mt-1 text-sm text-[#66706b]">
              Generated names remain editable without changing grade ownership.
            </p>
          </div>
          <form action={saveSectionNames} className="space-y-5">
            <div className="overflow-x-auto border border-[#dce1dc] bg-white">
              <table className="w-full min-w-[560px] border-collapse text-left text-sm">
                <thead className="bg-[#f2f5f2] text-xs text-[#56615c]">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Grade</th>
                    <th className="px-4 py-3 font-semibold">Class name</th>
                    <th className="px-4 py-3 font-semibold">Short code</th>
                  </tr>
                </thead>
                <tbody>
                  {sections.map(({ grade, section }) => (
                    <tr key={section.id} className="border-t border-[#dce1dc]">
                      <td className="px-4 py-3 font-medium">
                        {grade.name} / {section.sectionLabel}
                        <input
                          type="hidden"
                          name="sectionId"
                          value={section.id}
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input
                          className={inputClass}
                          name={`sectionName:${section.id}`}
                          defaultValue={section.sectionName}
                          maxLength={40}
                          required
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input
                          className={inputClass}
                          name={`shortCode:${section.id}`}
                          defaultValue={section.shortCode}
                          maxLength={20}
                          required
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button className={buttonClass} type="submit">
              <Save aria-hidden="true" className="mr-2" size={16} />
              Save class names
            </button>
          </form>
        </section>
      ) : null}
      <WorkflowNextAction
        description="Continue after the weekly structure and class sections are saved."
        href="/subjects"
        label="Continue to curriculum"
      />
    </div>
  );
}

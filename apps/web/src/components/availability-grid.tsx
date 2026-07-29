"use client";

import {
  automaticWorkloadPreference,
  teacherAvailableCapacity,
  type TeacherRestrictionState,
} from "@school-timetable/shared/teacher-restrictions";
import { AlertTriangle, Save } from "lucide-react";
import { useMemo, useState } from "react";

import { buttonClass, inputClass } from "@/components/setup-ui";

export type GridDay = { dayIndex: number; name: string };
export type GridPeriod = {
  periodIndex: number;
  name: string;
  isTeaching: boolean;
};
export type GridRestriction = {
  dayIndex: number;
  periodIndex: number;
  state: Exclude<TeacherRestrictionState, "AVAILABLE">;
};

const stateClass = {
  AVAILABLE: "border-[#cfd5d1] bg-white text-[#36413c]",
  PREFERRED: "border-[#7eb39d] bg-[#eef8f3] text-[#0b5b43]",
  DISLIKED: "border-[#d5b86d] bg-[#fff9e9] text-[#6e5314]",
  UNAVAILABLE: "border-[#d88c85] bg-[#fff1ef] text-[#8b2119]",
} as const;

export function AvailabilityGrid({
  days,
  periods,
  restrictions,
  teacher,
  action,
}: {
  days: GridDay[];
  periods: GridPeriod[];
  restrictions: GridRestriction[];
  teacher: {
    id: string;
    employmentType: "FULL_TIME" | "PART_TIME";
    weeklyTeachingSessions: number;
    maxLessonsPerDay: number | null;
    maxConsecutiveLessons: number | null;
  };
  action: (formData: FormData) => Promise<void>;
}) {
  const [states, setStates] = useState(() => {
    const initial = new Map<string, TeacherRestrictionState>();
    for (const restriction of restrictions) {
      initial.set(
        `${String(restriction.dayIndex)}:${String(restriction.periodIndex)}`,
        restriction.state,
      );
    }
    return initial;
  });
  const [maxLessonsPerDay, setMaxLessonsPerDay] = useState(
    teacher.maxLessonsPerDay?.toString() ?? "",
  );
  const teachingPeriods = periods.filter((period) => period.isTeaching);
  const availableCapacity = useMemo(
    () =>
      teacherAvailableCapacity(
        days.map((day) => day.dayIndex),
        teachingPeriods.map((period) => period.periodIndex),
        [...states].map(([key, state]) => {
          const [dayIndex, periodIndex] = key.split(":").map(Number);
          return {
            dayIndex: dayIndex ?? 0,
            periodIndex: periodIndex ?? 0,
            state,
          };
        }),
        maxLessonsPerDay ? Number(maxLessonsPerDay) : null,
      ),
    [days, maxLessonsPerDay, states, teachingPeriods],
  );
  const capacityShortage = availableCapacity < teacher.weeklyTeachingSessions;
  const preference = automaticWorkloadPreference(teacher.employmentType);

  return (
    <form action={action} className="space-y-5">
      <input name="teacherId" type="hidden" value={teacher.id} />
      <div className="grid border-l border-t border-[#dce1dc] bg-white sm:grid-cols-2 lg:grid-cols-4">
        <label className="border-r border-b border-[#dce1dc] p-4 text-xs font-medium text-[#56615c]">
          Max sessions per day
          <input
            className={`${inputClass} mt-2`}
            name="maxLessonsPerDay"
            type="number"
            min="1"
            max={teachingPeriods.length}
            value={maxLessonsPerDay}
            onChange={(event) => setMaxLessonsPerDay(event.target.value)}
            placeholder="No maximum"
          />
        </label>
        <label className="border-r border-b border-[#dce1dc] p-4 text-xs font-medium text-[#56615c]">
          Max consecutive sessions
          <input
            className={`${inputClass} mt-2`}
            name="maxConsecutiveLessons"
            type="number"
            min="1"
            max={teachingPeriods.length}
            defaultValue={teacher.maxConsecutiveLessons ?? ""}
            placeholder="No maximum"
          />
        </label>
        <div className="border-r border-b border-[#dce1dc] p-4">
          <p className="text-xs text-[#66706b]">
            Usable slots / required workload
          </p>
          <p
            className={`mt-1 text-xl font-semibold ${
              capacityShortage ? "text-[#9d2e25]" : "text-[#0e6b4f]"
            }`}
          >
            {availableCapacity} / {teacher.weeklyTeachingSessions}
          </p>
          <p className="mt-1 text-xs leading-5 text-[#66706b]">
            After hard restrictions and daily limits. This is not curriculum
            allocation.
          </p>
        </div>
        <div className="border-r border-b border-[#dce1dc] p-4">
          <p className="text-xs text-[#66706b]">Automatic soft preference</p>
          <p className="mt-1 text-sm font-semibold">
            {preference === "FULL_TIME_DAILY_BALANCE"
              ? "Balanced daily load"
              : "Compact part-time schedule"}
          </p>
        </div>
      </div>

      {capacityShortage ? (
        <p className="flex items-center gap-2 border border-[#e3b7b2] bg-[#fff1ef] px-4 py-3 text-sm font-medium text-[#8b2119]">
          <AlertTriangle aria-hidden="true" size={16} />
          Hard restrictions leave fewer slots than the exact weekly workload.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs font-medium">
        <span className="text-[#36413c]">Available</span>
        <span className="text-[#0b5b43]">Preferred</span>
        <span className="text-[#6e5314]">Avoid</span>
        <span className="text-[#8b2119]">Unavailable</span>
      </div>

      <div className="overflow-x-auto border border-[#dce1dc] bg-white">
        <table className="w-full min-w-[760px] border-collapse text-center text-sm">
          <thead>
            <tr className="bg-[#f0f2ef]">
              <th className="border-b border-r border-[#dce1dc] px-4 py-3 text-left">
                Session
              </th>
              {days.map((day) => (
                <th
                  key={day.dayIndex}
                  className="border-b border-[#dce1dc] px-4 py-3"
                >
                  {day.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {periods.map((period) => (
              <tr
                key={period.periodIndex}
                className="border-b border-[#e7eae7] last:border-0"
              >
                <th className="border-r border-[#dce1dc] px-4 py-3 text-left font-medium">
                  {period.name}
                </th>
                {days.map((day) => {
                  const key = `${String(day.dayIndex)}:${String(period.periodIndex)}`;
                  const state = states.get(key) ?? "AVAILABLE";
                  return (
                    <td key={key} className="px-2 py-2">
                      {period.isTeaching ? (
                        <>
                          <input
                            type="hidden"
                            name="restrictionSlot"
                            value={key}
                          />
                          <select
                            aria-label={`${day.name}, ${period.name} restriction`}
                            className={`h-9 w-full min-w-28 border px-2 text-xs font-medium outline-none focus:ring-2 focus:ring-[#0e6b4f]/15 ${stateClass[state]}`}
                            name={`state:${key}`}
                            value={state}
                            onChange={(event) =>
                              setStates((current) => {
                                const next = new Map(current);
                                next.set(
                                  key,
                                  event.target.value as TeacherRestrictionState,
                                );
                                return next;
                              })
                            }
                          >
                            <option value="AVAILABLE">Available</option>
                            <option value="PREFERRED">Preferred</option>
                            <option value="DISLIKED">Avoid</option>
                            <option value="UNAVAILABLE">Unavailable</option>
                          </select>
                        </>
                      ) : (
                        <span className="text-xs text-[#8a928e]">Break</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button className={buttonClass} type="submit">
        <Save aria-hidden="true" className="mr-2" size={16} />
        Save restrictions
      </button>
    </form>
  );
}

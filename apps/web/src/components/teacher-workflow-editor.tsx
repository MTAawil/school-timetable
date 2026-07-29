"use client";

import type { TeacherRestrictionState } from "@school-timetable/shared/teacher-restrictions";
import { AlertTriangle, CheckCircle2, Save } from "lucide-react";
import { useMemo, useState } from "react";

import { buttonClass, inputClass } from "@/components/setup-ui";

type CurriculumItem = {
  id: string;
  className: string;
  classCode: string;
  subjectName: string;
  subjectCode: string;
  weeklySessions: number;
  teacherId: string | null;
  teacherName: string | null;
};

type TeacherValue = {
  id: string;
  name: string;
  shortCode: string;
  employmentType: "FULL_TIME" | "PART_TIME";
  weeklyTeachingSessions: number;
  maxLessonsPerDay: number | null;
  maxConsecutiveLessons: number | null;
};

type Restriction = {
  dayIndex: number;
  periodIndex: number;
  state: Exclude<TeacherRestrictionState, "AVAILABLE">;
};

const cycleStates: TeacherRestrictionState[] = [
  "AVAILABLE",
  "PREFERRED",
  "UNAVAILABLE",
];

const statePresentation: Record<
  TeacherRestrictionState,
  { label: string; className: string }
> = {
  AVAILABLE: {
    label: "Available",
    className: "border-[#cfd5d1] bg-white text-[#36413c] hover:bg-[#f2f5f2]",
  },
  PREFERRED: {
    label: "Preferred",
    className:
      "border-[#5e9f83] bg-[#dff3e9] text-[#07563f] hover:bg-[#d2ebdf]",
  },
  DISLIKED: {
    label: "Avoid",
    className:
      "border-[#c49a35] bg-[#fff0bd] text-[#684d0b] hover:bg-[#f8e6a8]",
  },
  UNAVAILABLE: {
    label: "Unavailable",
    className:
      "border-[#c85c53] bg-[#f8d8d4] text-[#7d1e18] hover:bg-[#f3c9c4]",
  },
};

function nextState(current: TeacherRestrictionState): TeacherRestrictionState {
  const index = cycleStates.indexOf(current);
  return cycleStates[(index + 1) % cycleStates.length] ?? "AVAILABLE";
}

export function TeacherWorkflowEditor({
  teacher,
  curriculum,
  days,
  periods,
  restrictions,
  action,
}: {
  teacher?: TeacherValue;
  curriculum: CurriculumItem[];
  days: { dayIndex: number; name: string }[];
  periods: { periodIndex: number; name: string; isTeaching: boolean }[];
  restrictions: Restriction[];
  action: (formData: FormData) => Promise<void>;
}) {
  const [declaredSessions, setDeclaredSessions] = useState(
    teacher?.weeklyTeachingSessions ?? 1,
  );
  const [selectedIds, setSelectedIds] = useState(
    () =>
      new Set(
        curriculum
          .filter((item) => item.teacherId === teacher?.id)
          .map((item) => item.id),
      ),
  );
  const [reassignedIds, setReassignedIds] = useState(() => new Set<string>());
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
  const allocatedSessions = useMemo(
    () =>
      curriculum
        .filter((item) => selectedIds.has(item.id))
        .reduce((total, item) => total + item.weeklySessions, 0),
    [curriculum, selectedIds],
  );
  const remaining = Math.max(0, declaredSessions - allocatedSessions);
  const excess = Math.max(0, allocatedSessions - declaredSessions);
  const workloadExact = declaredSessions === allocatedSessions;
  const grouped = Map.groupBy(
    curriculum,
    (item) => `${item.classCode}:${item.className}`,
  );

  return (
    <form action={action} className="space-y-8">
      {teacher ? <input name="id" type="hidden" value={teacher.id} /> : null}

      <section className="space-y-4" aria-labelledby="teacher-details-heading">
        <div className="border-b border-[#dce1dc] pb-3">
          <h2 id="teacher-details-heading" className="font-semibold">
            1. Teacher details
          </h2>
        </div>
        <div className="grid gap-4 bg-white py-4 sm:grid-cols-2 xl:grid-cols-3">
          <label className="text-xs font-medium text-[#56615c]">
            Name
            <input
              className={`${inputClass} mt-1.5`}
              defaultValue={teacher?.name}
              maxLength={100}
              name="name"
              required
            />
          </label>
          <label className="text-xs font-medium text-[#56615c]">
            Code
            <input
              className={`${inputClass} mt-1.5`}
              defaultValue={teacher?.shortCode}
              maxLength={12}
              name="shortCode"
              pattern="[A-Za-z0-9_]+"
              required
            />
          </label>
          <label className="text-xs font-medium text-[#56615c]">
            Employment
            <select
              className={`${inputClass} mt-1.5`}
              defaultValue={teacher?.employmentType ?? "FULL_TIME"}
              name="employmentType"
            >
              <option value="FULL_TIME">Full time</option>
              <option value="PART_TIME">Part time</option>
            </select>
          </label>
          <label className="text-xs font-medium text-[#56615c]">
            Exact weekly sessions
            <input
              className={`${inputClass} mt-1.5`}
              defaultValue={teacher?.weeklyTeachingSessions}
              max="100"
              min="1"
              name="weeklyTeachingSessions"
              onChange={(event) =>
                setDeclaredSessions(Number(event.target.value) || 0)
              }
              required
              type="number"
            />
          </label>
          <label className="text-xs font-medium text-[#56615c]">
            Maximum sessions per day
            <input
              className={`${inputClass} mt-1.5`}
              defaultValue={teacher?.maxLessonsPerDay ?? ""}
              max="20"
              min="1"
              name="maxLessonsPerDay"
              placeholder="No maximum"
              type="number"
            />
          </label>
          <label className="text-xs font-medium text-[#56615c]">
            Maximum consecutive sessions
            <input
              className={`${inputClass} mt-1.5`}
              defaultValue={teacher?.maxConsecutiveLessons ?? ""}
              max="20"
              min="1"
              name="maxConsecutiveLessons"
              placeholder="No maximum"
              type="number"
            />
          </label>
        </div>
      </section>

      <section className="space-y-4" aria-labelledby="teaching-heading">
        <div className="border-b border-[#dce1dc] pb-3">
          <h2 id="teaching-heading" className="font-semibold">
            2. Classes and subjects
          </h2>
          <p className="mt-1 text-sm text-[#66706b]">
            Select everything this teacher teaches. Session counts come from
            curriculum.
          </p>
        </div>
        <dl className="grid border-l border-t border-[#dce1dc] bg-white sm:grid-cols-4">
          {[
            ["Declared", declaredSessions],
            ["Allocated", allocatedSessions],
            ["Remaining", remaining],
            ["Excess", excess],
          ].map(([label, value]) => (
            <div className="border-r border-b border-[#dce1dc] p-4" key={label}>
              <dt className="text-xs text-[#66706b]">{label}</dt>
              <dd className="mt-1 text-xl font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
        <p
          className={`flex items-center gap-2 border px-4 py-3 text-sm font-medium ${
            workloadExact
              ? "border-[#9bc8b5] bg-[#eef8f3] text-[#0b5b43]"
              : "border-[#e3b7b2] bg-[#fff1ef] text-[#8b2119]"
          }`}
          role="status"
        >
          {workloadExact ? (
            <CheckCircle2 aria-hidden="true" size={16} />
          ) : (
            <AlertTriangle aria-hidden="true" size={16} />
          )}
          {workloadExact
            ? "Declared and allocated sessions match."
            : "Allocated sessions must equal the declared weekly sessions."}
        </p>
        {curriculum.length === 0 ? (
          <p className="border border-[#e0c78f] bg-[#fff9e9] px-4 py-3 text-sm text-[#6e5314]">
            Add class curriculum before adding teachers.
          </p>
        ) : (
          <div className="space-y-5">
            {[...grouped.entries()].map(([key, items]) => {
              const first = items[0];
              if (!first) return null;
              return (
                <fieldset key={key}>
                  <legend className="mb-2 font-semibold">
                    {first.className}
                    <span className="ml-2 text-xs font-normal text-[#66706b]">
                      {first.classCode}
                    </span>
                  </legend>
                  <div className="grid border-l border-t border-[#dce1dc] bg-white md:grid-cols-2">
                    {items.map((item) => {
                      const initiallyOwnedByOther = Boolean(
                        item.teacherId && item.teacherId !== teacher?.id,
                      );
                      const reassigned = reassignedIds.has(item.id);
                      return (
                        <div
                          className={`flex min-h-16 items-center gap-3 border-r border-b border-[#dce1dc] px-4 py-3 ${
                            initiallyOwnedByOther && !reassigned
                              ? "bg-[#f3f4f3] text-[#7b837f]"
                              : ""
                          }`}
                          key={item.id}
                        >
                          {reassigned ? (
                            <input
                              name="reassignCurriculumId"
                              type="hidden"
                              value={item.id}
                            />
                          ) : null}
                          <input
                            aria-label={`${item.className} ${item.subjectName}`}
                            checked={selectedIds.has(item.id)}
                            disabled={initiallyOwnedByOther && !reassigned}
                            name="classCurriculumId"
                            onChange={(event) =>
                              setSelectedIds((current) => {
                                const next = new Set(current);
                                if (event.target.checked) next.add(item.id);
                                else {
                                  next.delete(item.id);
                                  setReassignedIds((confirmed) => {
                                    const remaining = new Set(confirmed);
                                    remaining.delete(item.id);
                                    return remaining;
                                  });
                                }
                                return next;
                              })
                            }
                            type="checkbox"
                            value={item.id}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block font-medium">
                              {item.subjectName}
                            </span>
                            <span className="block text-xs text-[#66706b]">
                              {item.subjectCode} · {item.weeklySessions}{" "}
                              sessions
                            </span>
                          </span>
                          {initiallyOwnedByOther && !reassigned ? (
                            <button
                              className="border border-[#9ba59f] bg-white px-2 py-1.5 text-xs font-semibold text-[#36413c]"
                              onClick={() => {
                                if (
                                  !window.confirm(
                                    `Reassign ${item.className} ${item.subjectName} from ${item.teacherName ?? "the current teacher"}?`,
                                  )
                                ) {
                                  return;
                                }
                                setReassignedIds((current) =>
                                  new Set(current).add(item.id),
                                );
                                setSelectedIds((current) =>
                                  new Set(current).add(item.id),
                                );
                              }}
                              type="button"
                            >
                              Reassign from {item.teacherName}
                            </button>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </fieldset>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-4" aria-labelledby="restrictions-heading">
        <div className="border-b border-[#dce1dc] pb-3">
          <h2 id="restrictions-heading" className="font-semibold">
            3. Weekly restrictions
          </h2>
          <p className="mt-1 text-sm text-[#66706b]">
            Click a session repeatedly to change its state.
          </p>
        </div>
        <div className="flex flex-wrap gap-3 text-xs font-semibold">
          {cycleStates.map((state) => (
            <span
              className={`border px-3 py-2 ${statePresentation[state].className}`}
              key={state}
            >
              {statePresentation[state].label}
            </span>
          ))}
        </div>
        {days.length === 0 || periods.length === 0 ? (
          <p className="border border-[#e0c78f] bg-[#fff9e9] px-4 py-3 text-sm text-[#6e5314]">
            Save the school week before adding teacher restrictions.
          </p>
        ) : (
          <div className="border border-[#dce1dc] bg-white">
            <table className="w-full table-fixed border-collapse text-center text-xs">
              <thead>
                <tr className="bg-[#f0f2ef]">
                  <th className="w-24 border-b border-r border-[#dce1dc] p-2 text-left">
                    Session
                  </th>
                  {days.map((day) => (
                    <th
                      className="border-b border-[#dce1dc] p-2"
                      key={day.dayIndex}
                    >
                      {day.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {periods.map((period) => (
                  <tr key={period.periodIndex}>
                    <th className="border-r border-t border-[#dce1dc] p-2 text-left font-medium">
                      {period.name}
                    </th>
                    {days.map((day) => {
                      const key = `${String(day.dayIndex)}:${String(period.periodIndex)}`;
                      const state = states.get(key) ?? "AVAILABLE";
                      const presentation = statePresentation[state];
                      return (
                        <td className="border-t border-[#dce1dc] p-1" key={key}>
                          {period.isTeaching ? (
                            <>
                              <input
                                name="restrictionSlot"
                                type="hidden"
                                value={key}
                              />
                              <input
                                name={`state:${key}`}
                                type="hidden"
                                value={state}
                              />
                              <button
                                aria-label={`${day.name}, ${period.name}: ${presentation.label}`}
                                className={`min-h-12 w-full border px-1 py-2 font-semibold ${presentation.className}`}
                                onClick={() =>
                                  setStates((current) => {
                                    const next = new Map(current);
                                    next.set(key, nextState(state));
                                    return next;
                                  })
                                }
                                type="button"
                              >
                                {presentation.label}
                              </button>
                            </>
                          ) : (
                            <span className="text-[#8a928e]">Break</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <button
        className={buttonClass}
        disabled={!workloadExact || curriculum.length === 0}
        type="submit"
      >
        <Save aria-hidden="true" className="mr-2" size={16} />
        {teacher ? "Save teacher" : "Add teacher"}
      </button>
    </form>
  );
}

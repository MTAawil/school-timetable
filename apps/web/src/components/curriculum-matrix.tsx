"use client";

import {
  curriculumCapacityIssue,
  formatTeachingTime,
  type CurriculumCell,
} from "@school-timetable/shared/curriculum";
import { AlertTriangle, Save } from "lucide-react";
import { useMemo, useState } from "react";

import { buttonClass } from "@/components/setup-ui";

type ClassSection = {
  id: string;
  name: string;
  shortCode: string;
  gradeCode: string;
};
type Subject = { id: string; name: string; shortCode: string };
type CellState = CurriculumCell & { classSectionId: string; subjectId: string };

const issueLabels = {
  NON_MAIN_DAILY_CAPACITY_SHORTAGE:
    "Non-main subjects cannot occur twice in one day.",
  DOUBLE_REQUIRED_BUT_DISABLED:
    "Enable optional doubles or reduce weekly sessions.",
  MAIN_DAILY_CAPACITY_SHORTAGE:
    "Main subjects cannot exceed two sessions per day.",
} as const;

export function CurriculumMatrix({
  classSections,
  subjects,
  initialCells,
  workingDayCount,
  sessionsPerDay,
  sessionDurationMinutes,
  action,
}: {
  classSections: ClassSection[];
  subjects: Subject[];
  initialCells: CellState[];
  workingDayCount: number;
  sessionsPerDay: number;
  sessionDurationMinutes: number;
  action: (formData: FormData) => Promise<void>;
}) {
  const [cells, setCells] = useState(() => {
    return new Map(
      initialCells.map((cell) => [
        `${cell.classSectionId}:${cell.subjectId}`,
        cell,
      ]),
    );
  });
  const validation = useMemo(() => {
    const cellIssues = new Map<string, string>();
    const classTotals = new Map<string, number>();
    for (const [key, cell] of cells) {
      const issue = curriculumCapacityIssue(cell, workingDayCount);
      if (issue) {
        cellIssues.set(key, issueLabels[issue]);
      }
      classTotals.set(
        cell.classSectionId,
        (classTotals.get(cell.classSectionId) ?? 0) + cell.weeklySessions,
      );
    }
    const capacity = workingDayCount * sessionsPerDay;
    const classIssues = new Set(
      [...classTotals]
        .filter(([, total]) => total > capacity)
        .map(([classSectionId]) => classSectionId),
    );
    return {
      cellIssues,
      classIssues,
      capacity,
      isValid: cellIssues.size === 0 && classIssues.size === 0,
    };
  }, [cells, sessionsPerDay, workingDayCount]);

  function updateCell(
    key: string,
    update: (current: CellState) => CellState,
  ): void {
    setCells((current) => {
      const next = new Map(current);
      const cell = next.get(key);
      if (cell) {
        next.set(key, update(cell));
      }
      return next;
    });
  }

  return (
    <form action={action} className="space-y-6">
      {classSections.map((classSection) => {
        const classTotal = [...cells.values()]
          .filter((cell) => cell.classSectionId === classSection.id)
          .reduce((total, cell) => total + cell.weeklySessions, 0);
        const overCapacity = validation.classIssues.has(classSection.id);
        return (
          <section key={classSection.id} className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#dce1dc] pb-2">
              <h3 className="font-semibold">
                {classSection.name}
                <span className="ml-2 text-xs font-normal text-[#66706b]">
                  {classSection.shortCode}
                </span>
              </h3>
              <p
                className={`text-sm ${overCapacity ? "font-semibold text-[#9d2e25]" : "text-[#66706b]"}`}
              >
                {classTotal} / {validation.capacity} sessions
              </p>
            </div>
            {overCapacity ? (
              <p className="flex items-center gap-2 text-sm text-[#9d2e25]">
                <AlertTriangle aria-hidden="true" size={16} />
                Curriculum exceeds the class&apos;s weekly capacity.
              </p>
            ) : null}
            <div className="overflow-x-auto border border-[#dce1dc] bg-white">
              <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                <thead className="bg-[#f2f5f2] text-xs text-[#56615c]">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Subject</th>
                    <th className="w-32 px-4 py-3 font-semibold">
                      Sessions/week
                    </th>
                    <th className="w-28 px-4 py-3 font-semibold">Time</th>
                    <th className="w-24 px-4 py-3 text-center font-semibold">
                      Main
                    </th>
                    <th className="w-28 px-4 py-3 text-center font-semibold">
                      Double
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {subjects.map((subject) => {
                    const key = `${classSection.id}:${subject.id}`;
                    const cell = cells.get(key)!;
                    const issue = validation.cellIssues.get(key);
                    return (
                      <tr
                        key={subject.id}
                        className="border-t border-[#dce1dc] align-top"
                      >
                        <td className="px-4 py-3">
                          <p className="font-medium">{subject.name}</p>
                          {issue ? (
                            <p className="mt-1 flex items-start gap-1 text-xs leading-5 text-[#9d2e25]">
                              <AlertTriangle
                                aria-hidden="true"
                                className="mt-0.5 shrink-0"
                                size={13}
                              />
                              {issue}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-4 py-2">
                          <input
                            className={`h-9 w-20 border px-2 text-center outline-none focus:ring-2 focus:ring-[#0e6b4f]/15 ${
                              issue
                                ? "border-[#c75b52]"
                                : "border-[#cfd5d1] focus:border-[#0e6b4f]"
                            }`}
                            name={`sessions:${key}`}
                            type="number"
                            min="0"
                            max={validation.capacity}
                            value={cell.weeklySessions}
                            onChange={(event) =>
                              updateCell(key, (current) => ({
                                ...current,
                                weeklySessions: Number(event.target.value),
                              }))
                            }
                            aria-label={`${classSection.name} ${subject.name} weekly sessions`}
                            required
                            suppressHydrationWarning
                          />
                        </td>
                        <td className="px-4 py-3 text-[#66706b]">
                          {formatTeachingTime(
                            cell.weeklySessions,
                            sessionDurationMinutes,
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <input
                            className="size-4 accent-[#0e6b4f]"
                            name={`main:${key}`}
                            type="checkbox"
                            checked={cell.isMainSubject}
                            onChange={(event) =>
                              updateCell(key, (current) => ({
                                ...current,
                                isMainSubject: event.target.checked,
                              }))
                            }
                            aria-label={`${classSection.name} ${subject.name} main subject`}
                            suppressHydrationWarning
                          />
                        </td>
                        <td className="px-4 py-3 text-center">
                          <input
                            className="size-4 accent-[#0e6b4f]"
                            name={`double:${key}`}
                            type="checkbox"
                            checked={cell.allowDoubleSession}
                            onChange={(event) =>
                              updateCell(key, (current) => ({
                                ...current,
                                allowDoubleSession: event.target.checked,
                              }))
                            }
                            aria-label={`${classSection.name} ${subject.name} optional double`}
                            suppressHydrationWarning
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
      <button
        className={`${buttonClass} disabled:cursor-not-allowed disabled:bg-[#8a928e]`}
        type="submit"
        disabled={!validation.isValid}
        suppressHydrationWarning
      >
        <Save aria-hidden="true" className="mr-2" size={16} />
        Save curriculum
      </button>
    </form>
  );
}

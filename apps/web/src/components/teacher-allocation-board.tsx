"use client";

import {
  countUncoveredCurriculum,
  summarizeTeacherWorkloads,
} from "@school-timetable/shared/teacher-allocation";
import { AlertTriangle, CheckCircle2, Save } from "lucide-react";
import { useMemo, useState } from "react";

import { buttonClass, inputClass } from "@/components/setup-ui";

type Teacher = {
  id: string;
  name: string;
  weeklyTeachingSessions: number;
};

type Allocation = {
  id: string;
  className: string;
  classCode: string;
  subjectName: string;
  subjectCode: string;
  weeklySessions: number;
  teacherId: string | null;
};

export function TeacherAllocationBoard({
  teachers,
  initialAllocations,
  action,
}: {
  teachers: Teacher[];
  initialAllocations: Allocation[];
  action: (formData: FormData) => Promise<void>;
}) {
  const [allocations, setAllocations] = useState(initialAllocations);
  const summaries = useMemo(
    () =>
      summarizeTeacherWorkloads(
        teachers.map((teacher) => ({
          teacherId: teacher.id,
          declaredWeeklySessions: teacher.weeklyTeachingSessions,
        })),
        allocations.map((allocation) => ({
          classCurriculumId: allocation.id,
          teacherId: allocation.teacherId,
          weeklySessions: allocation.weeklySessions,
        })),
      ),
    [allocations, teachers],
  );
  const uncovered = countUncoveredCurriculum(
    allocations.map((allocation) => ({
      classCurriculumId: allocation.id,
      teacherId: allocation.teacherId,
      weeklySessions: allocation.weeklySessions,
    })),
  );
  const exactTeacherCount = summaries.filter(
    (summary) => summary.status === "EXACT",
  ).length;
  const grouped = Map.groupBy(
    allocations,
    (allocation) => `${allocation.classCode}:${allocation.className}`,
  );

  return (
    <form action={action} className="space-y-6">
      <dl className="grid border-l border-t border-[#dce1dc] bg-white sm:grid-cols-2 xl:grid-cols-4">
        <div className="border-r border-b border-[#dce1dc] p-4">
          <dt className="text-xs text-[#66706b]">Class-subjects</dt>
          <dd className="mt-1 text-xl font-semibold">{allocations.length}</dd>
        </div>
        <div className="border-r border-b border-[#dce1dc] p-4">
          <dt className="text-xs text-[#66706b]">Uncovered</dt>
          <dd
            className={`mt-1 text-xl font-semibold ${
              uncovered > 0 ? "text-[#9d2e25]" : "text-[#0e6b4f]"
            }`}
          >
            {uncovered}
          </dd>
        </div>
        <div className="border-r border-b border-[#dce1dc] p-4">
          <dt className="text-xs text-[#66706b]">Exact teacher loads</dt>
          <dd className="mt-1 text-xl font-semibold">
            {exactTeacherCount} / {teachers.length}
          </dd>
        </div>
        <div className="border-r border-b border-[#dce1dc] p-4">
          <dt className="text-xs text-[#66706b]">Shared ownership</dt>
          <dd className="mt-1 text-xl font-semibold text-[#0e6b4f]">0</dd>
        </div>
      </dl>

      <div className="overflow-x-auto border border-[#dce1dc] bg-white">
        <table className="w-full min-w-[720px] border-collapse text-left text-sm">
          <thead className="bg-[#f2f5f2] text-xs text-[#56615c]">
            <tr>
              <th className="px-4 py-3 font-semibold">Teacher</th>
              <th className="px-4 py-3 text-center font-semibold">Declared</th>
              <th className="px-4 py-3 text-center font-semibold">Allocated</th>
              <th className="px-4 py-3 text-center font-semibold">Remaining</th>
              <th className="px-4 py-3 text-center font-semibold">Excess</th>
              <th className="px-4 py-3 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {teachers.map((teacher) => {
              const summary = summaries.find(
                (item) => item.teacherId === teacher.id,
              );
              if (!summary) {
                return null;
              }
              return (
                <tr key={teacher.id} className="border-t border-[#dce1dc]">
                  <td className="px-4 py-3 font-medium">{teacher.name}</td>
                  <td className="px-4 py-3 text-center">
                    {summary.declaredWeeklySessions}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {summary.allocatedWeeklySessions}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {summary.remainingSessions}
                  </td>
                  <td
                    className={`px-4 py-3 text-center ${
                      summary.excessSessions > 0
                        ? "font-semibold text-[#9d2e25]"
                        : ""
                    }`}
                  >
                    {summary.excessSessions}
                  </td>
                  <td className="px-4 py-3">
                    {summary.status === "EXACT" ? (
                      <span className="inline-flex items-center gap-1.5 text-[#0e6b4f]">
                        <CheckCircle2 aria-hidden="true" size={15} />
                        Exact
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-[#9d2e25]">
                        <AlertTriangle aria-hidden="true" size={15} />
                        {summary.status === "UNDER"
                          ? "Needs allocation"
                          : "Over allocated"}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {[...grouped.entries()].map(([classKey, classAllocations]) => {
        const firstAllocation = classAllocations[0];
        if (!firstAllocation) {
          return null;
        }
        return (
          <section key={classKey} className="space-y-2">
            <h3 className="border-b border-[#dce1dc] pb-2 font-semibold">
              {firstAllocation.className}
              <span className="ml-2 text-xs font-normal text-[#66706b]">
                {firstAllocation.classCode}
              </span>
            </h3>
            <div className="overflow-x-auto border border-[#dce1dc] bg-white">
              <table className="w-full min-w-[580px] border-collapse text-left text-sm">
                <thead className="bg-[#f2f5f2] text-xs text-[#56615c]">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Subject</th>
                    <th className="w-28 px-4 py-3 text-center font-semibold">
                      Sessions
                    </th>
                    <th className="w-72 px-4 py-3 font-semibold">Teacher</th>
                  </tr>
                </thead>
                <tbody>
                  {classAllocations.map((allocation) => (
                    <tr
                      key={allocation.id}
                      className="border-t border-[#dce1dc]"
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium">{allocation.subjectName}</p>
                        <p className="mt-0.5 text-xs text-[#66706b]">
                          {allocation.subjectCode}
                        </p>
                        <input
                          type="hidden"
                          name="classCurriculumId"
                          value={allocation.id}
                        />
                      </td>
                      <td className="px-4 py-3 text-center">
                        {allocation.weeklySessions}
                      </td>
                      <td className="px-4 py-2">
                        <select
                          className={`${inputClass} ${
                            allocation.teacherId
                              ? ""
                              : "border-[#c75b52] bg-[#fff8f7]"
                          }`}
                          name={`teacher:${allocation.id}`}
                          value={allocation.teacherId ?? ""}
                          onChange={(event) =>
                            setAllocations((current) =>
                              current.map((item) =>
                                item.id === allocation.id
                                  ? {
                                      ...item,
                                      teacherId: event.target.value || null,
                                    }
                                  : item,
                              ),
                            )
                          }
                          aria-label={`${allocation.className} ${allocation.subjectName} teacher`}
                        >
                          <option value="">Unassigned</option>
                          {teachers.map((teacher) => (
                            <option key={teacher.id} value={teacher.id}>
                              {teacher.name}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}

      <button className={buttonClass} type="submit">
        <Save aria-hidden="true" className="mr-2" size={16} />
        Save teaching assignments
      </button>
    </form>
  );
}

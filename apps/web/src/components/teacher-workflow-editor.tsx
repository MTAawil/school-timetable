"use client";

import type { TeacherRestrictionState } from "@school-timetable/shared/teacher-restrictions";
import { AlertTriangle, CheckCircle2, Link2, Save } from "lucide-react";
import { useMemo, useState } from "react";

import { buttonClass, inputClass } from "@/components/setup-ui";

type CurriculumItem = {
  id: string;
  subjectId: string;
  className: string;
  classCode: string;
  subjectName: string;
  subjectCode: string;
  weeklySessions: number;
  teacherId: string | null;
  teacherName: string | null;
  sharedTeachingGroupId?: string | null;
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
  const initiallyAssigned = curriculum.filter(
    (item) => item.teacherId === teacher?.id,
  );
  const [teachingSubjectId, setTeachingSubjectId] = useState(
    initiallyAssigned[0]?.subjectId ?? "",
  );
  const [selectedIds, setSelectedIds] = useState(
    () => new Set(initiallyAssigned.map((item) => item.id)),
  );
  const [reassignedIds, setReassignedIds] = useState(() => new Set<string>());
  const [sharedIds, setSharedIds] = useState(() => new Set<string>());
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
  const sharedGroupLabels = useMemo(() => {
    const groups = new Map<string, CurriculumItem[]>();
    for (const item of curriculum) {
      if (!item.sharedTeachingGroupId) continue;
      const groupItems = groups.get(item.sharedTeachingGroupId) ?? [];
      groupItems.push(item);
      groups.set(item.sharedTeachingGroupId, groupItems);
    }

    return new Map(
      [...groups.entries()].map(([groupId, items]) => [
        groupId,
        [...new Set(items.map((item) => item.classCode))].sort().join(" + "),
      ]),
    );
  }, [curriculum]);
  const teacherSharedGroups = useMemo(() => {
    const groups = new Map<
      string,
      { label: string; subjectName: string; weeklySessions: number }
    >();
    for (const item of curriculum) {
      if (item.teacherId !== teacher?.id || !item.sharedTeachingGroupId) {
        continue;
      }
      groups.set(item.sharedTeachingGroupId, {
        label:
          sharedGroupLabels.get(item.sharedTeachingGroupId) ?? item.classCode,
        subjectName: item.subjectName,
        weeklySessions: item.weeklySessions,
      });
    }
    return [...groups.values()].sort((left, right) =>
      left.label.localeCompare(right.label),
    );
  }, [curriculum, sharedGroupLabels, teacher?.id]);
  const allocatedSessions = useMemo(() => {
    const countedGroups = new Set<string>();
    return curriculum
      .filter((item) => selectedIds.has(item.id))
      .reduce((total, item) => {
        const groupId = item.sharedTeachingGroupId;
        if (groupId) {
          if (countedGroups.has(groupId)) return total;
          countedGroups.add(groupId);
        }
        return total + (sharedIds.has(item.id) ? 0 : item.weeklySessions);
      }, 0);
  }, [curriculum, selectedIds, sharedIds]);
  const remaining = Math.max(0, declaredSessions - allocatedSessions);
  const excess = Math.max(0, allocatedSessions - declaredSessions);
  const workloadExact = declaredSessions === allocatedSessions;
  const subjects = Array.from(
    new Map(
      curriculum.map((item) => [
        item.subjectId,
        { id: item.subjectId, name: item.subjectName, code: item.subjectCode },
      ]),
    ).values(),
  ).sort((left, right) => left.name.localeCompare(right.name));
  const subjectCoverage = subjects.map((subject) => {
    const items = curriculum.filter((item) => item.subjectId === subject.id);
    const requiredSessions = items.reduce(
      (total, item) => total + item.weeklySessions,
      0,
    );
    const isAssigned = (item: CurriculumItem) =>
      selectedIds.has(item.id) ||
      Boolean(item.teacherId && item.teacherId !== teacher?.id);
    const assignedSessions = items
      .filter(isAssigned)
      .reduce((total, item) => total + item.weeklySessions, 0);

    return {
      ...subject,
      assignedSessions,
      requiredSessions,
      missingItems: items.filter((item) => !isAssigned(item)),
    };
  });
  const selectedCoverage = subjectCoverage.find(
    (subject) => subject.id === teachingSubjectId,
  );
  const visibleCurriculum = teachingSubjectId
    ? curriculum.filter((item) => item.subjectId === teachingSubjectId)
    : [];
  const anchor = visibleCurriculum.find(
    (item) => item.teacherId === teacher?.id,
  );
  const shareCandidates = anchor
    ? visibleCurriculum.filter(
        (item) =>
          item.id !== anchor.id &&
          item.teacherId === null &&
          item.sharedTeachingGroupId === null &&
          item.weeklySessions === anchor.weeklySessions,
      )
    : [];
  const grouped = Map.groupBy(
    visibleCurriculum,
    (item) => `${item.classCode}:${item.className}`,
  );

  return (
    <form action={action} className="space-y-8">
      {teacher ? <input name="id" type="hidden" value={teacher.id} /> : null}

      <div
        aria-label="Teacher coverage by subject"
        className="border border-[#dce1dc] bg-white"
        role="region"
      >
        <div className="border-b border-[#dce1dc] px-4 py-3">
          <h3 className="font-semibold">Teacher coverage</h3>
          <p className="mt-1 text-xs text-[#66706b]">
            Assigned sessions compared with all sessions required by the
            curriculum.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 xl:grid-cols-3">
          {subjectCoverage.map((subject) => {
            const remainingSessions =
              subject.requiredSessions - subject.assignedSessions;
            const isComplete = remainingSessions === 0;
            const isEmpty = subject.assignedSessions === 0;
            const missingSummary = subject.missingItems
              .slice(0, 4)
              .map((item) => ({
                id: item.id,
                className: item.className,
                sessions: item.weeklySessions,
              }));
            const tooltipId = `coverage-tooltip-${subject.id}`;

            return (
              <button
                aria-describedby={tooltipId}
                aria-pressed={teachingSubjectId === subject.id}
                className={`group relative min-h-24 border-r border-b border-[#dce1dc] px-4 py-3 text-left ${
                  teachingSubjectId === subject.id
                    ? "outline-2 -outline-offset-2 outline-[#0e6b4f]"
                    : ""
                } ${
                  isComplete
                    ? "bg-[#eef8f3]"
                    : isEmpty
                      ? "bg-[#fff1ef]"
                      : "bg-[#fff9e9]"
                }`}
                key={subject.id}
                onClick={() => setTeachingSubjectId(subject.id)}
                type="button"
              >
                <span className="block font-semibold">
                  {subject.name} ({subject.code})
                </span>
                <span className="mt-1 block text-sm">
                  {subject.assignedSessions} / {subject.requiredSessions}{" "}
                  sessions assigned
                </span>
                <span
                  className={`mt-1 block text-xs font-semibold ${
                    isComplete
                      ? "text-[#0b5b43]"
                      : isEmpty
                        ? "text-[#8b2119]"
                        : "text-[#6e5314]"
                  }`}
                >
                  {isComplete
                    ? "Complete"
                    : `${String(remainingSessions)} sessions remaining`}
                </span>
                <span
                  className="pointer-events-none absolute inset-x-2 top-[calc(100%-0.5rem)] z-20 hidden border border-[#b8c0bb] bg-[#24312c] p-3 text-left text-white shadow-lg group-hover:block group-focus-visible:block"
                  id={tooltipId}
                  role="tooltip"
                >
                  <span className="block text-sm font-semibold">
                    {subject.name} coverage
                  </span>
                  <span className="mt-1 block text-xs text-[#dbe4df]">
                    {subject.assignedSessions} of {subject.requiredSessions}{" "}
                    required sessions assigned
                  </span>
                  {isComplete ? (
                    <span className="mt-3 block border-t border-[#53615b] pt-2 text-xs font-medium text-[#bde6d3]">
                      All classes have teachers.
                    </span>
                  ) : (
                    <>
                      <span className="mt-3 block border-t border-[#53615b] pt-2 text-xs font-semibold">
                        Still needs a teacher
                      </span>
                      <span className="mt-1 block space-y-1">
                        {missingSummary.map((item) => (
                          <span
                            className="flex justify-between gap-3 text-xs"
                            key={item.id}
                          >
                            <span>{item.className}</span>
                            <span className="text-[#dbe4df]">
                              {item.sessions} sessions
                            </span>
                          </span>
                        ))}
                      </span>
                      {subject.missingItems.length > missingSummary.length ? (
                        <span className="mt-2 block text-xs text-[#bfc9c3]">
                          +{" "}
                          {subject.missingItems.length - missingSummary.length}{" "}
                          more classes
                        </span>
                      ) : null}
                    </>
                  )}
                </span>
              </button>
            );
          })}
        </div>
        {selectedCoverage ? (
          <div
            aria-live="polite"
            className="border-t border-[#dce1dc] px-4 py-3"
          >
            <h4 className="text-sm font-semibold">
              Classes still needing a {selectedCoverage.name} teacher
            </h4>
            {selectedCoverage.missingItems.length === 0 ? (
              <p className="mt-2 text-sm text-[#0b5b43]">
                All classes are covered.
              </p>
            ) : (
              <ul className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {selectedCoverage.missingItems.map((item) => (
                  <li
                    className="border border-[#e3b7b2] bg-[#fff7f5] px-3 py-2 text-sm"
                    key={item.id}
                  >
                    <span className="font-medium">{item.className}</span>
                    <span className="ml-2 text-[#66706b]">
                      {item.weeklySessions} sessions
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </div>

      {teacher && !workloadExact ? (
        <section
          aria-labelledby="workload-correction-heading"
          className="border border-[#c85c53] bg-[#fff1ef] p-5"
          role="alert"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle
              aria-hidden="true"
              className="mt-0.5 shrink-0 text-[#9d2e25]"
              size={20}
            />
            <div className="min-w-0 flex-1">
              <h2 id="workload-correction-heading" className="font-semibold">
                {teacher.name}&apos;s workload needs correction
              </h2>
              <p className="mt-1 text-sm text-[#6f302a]">
                Declared: <strong>{declaredSessions}</strong> sessions.
                Allocated from selected classes:{" "}
                <strong>{allocatedSessions}</strong> sessions.
              </p>
              <p className="mt-2 text-sm text-[#6f302a]">
                Either make the declared workload match the current allocation,
                or change the selected classes and subjects below.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  className="inline-flex h-9 items-center bg-[#9d2e25] px-3 text-sm font-semibold text-white hover:bg-[#84251f]"
                  onClick={() => setDeclaredSessions(allocatedSessions)}
                  type="button"
                >
                  Set declared to {allocatedSessions}
                </button>
                <a
                  className="inline-flex h-9 items-center border border-[#b77b74] bg-white px-3 text-sm font-semibold text-[#6f302a] hover:bg-[#fff8f7]"
                  href="#teaching-heading"
                >
                  Review class allocations
                </a>
              </div>
            </div>
          </div>
        </section>
      ) : null}

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
              id="weekly-teaching-sessions"
              max="100"
              min="1"
              name="weeklyTeachingSessions"
              onChange={(event) =>
                setDeclaredSessions(Number(event.target.value) || 0)
              }
              required
              type="number"
              value={declaredSessions}
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
            2. Subjects and classes
          </h2>
          <p className="mt-1 text-sm text-[#66706b]">
            Choose a subject to filter the class list. Switching subjects keeps
            the classes already selected for this teacher.
          </p>
        </div>
        <label className="block max-w-lg text-xs font-medium text-[#56615c]">
          Subject filter
          <select
            className={`${inputClass} mt-1.5`}
            onChange={(event) => setTeachingSubjectId(event.target.value)}
            required
            value={teachingSubjectId}
          >
            <option value="">Select subject</option>
            {subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name} ({subject.code})
              </option>
            ))}
          </select>
        </label>
        {[...selectedIds].map((id) => (
          <input key={id} name="classCurriculumId" type="hidden" value={id} />
        ))}
        {[...reassignedIds].map((id) => (
          <input
            key={id}
            name="reassignCurriculumId"
            type="hidden"
            value={id}
          />
        ))}
        {[...sharedIds].map((id) => (
          <input key={id} name="sharedCurriculumId" type="hidden" value={id} />
        ))}
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
        ) : !teachingSubjectId ? (
          <p className="border border-[#dce1dc] bg-[#f8f9f7] px-4 py-3 text-sm text-[#56615c]">
            Select a teaching subject to see its classes.
          </p>
        ) : (
          <div className="space-y-5">
            {teacherSharedGroups.length > 0 ? (
              <div className="border border-[#9bc8b5] bg-[#eef8f3] px-4 py-3">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-[#0b5b43]">
                  <Link2 aria-hidden="true" size={16} />
                  Combined classes
                </h3>
                <ul className="mt-2 grid gap-2 text-sm sm:grid-cols-2 xl:grid-cols-3">
                  {teacherSharedGroups.map((group) => (
                    <li
                      className="border border-[#b8d8c9] bg-white px-3 py-2"
                      key={`${group.subjectName}:${group.label}`}
                    >
                      <span className="block font-medium">{group.label}</span>
                      <span className="mt-0.5 block text-xs text-[#56615c]">
                        {group.subjectName} - {group.weeklySessions} sessions
                        counted once
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {shareCandidates.length > 0 ? (
              <label className="block max-w-xl text-xs font-medium text-[#56615c]">
                Combine unassigned classes with {anchor?.className}
                <select
                  className={`${inputClass} mt-1.5 min-h-28`}
                  multiple
                  value={[...sharedIds]}
                  onChange={(event) => {
                    const next = new Set(
                      Array.from(
                        event.target.selectedOptions,
                        (option) => option.value,
                      ),
                    );
                    setSharedIds(next);
                    setSelectedIds((current) => {
                      const updated = new Set(current);
                      shareCandidates.forEach((item) => {
                        if (next.has(item.id)) updated.add(item.id);
                        else updated.delete(item.id);
                      });
                      return updated;
                    });
                  }}
                >
                  {shareCandidates.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.className} ({item.classCode}) -{" "}
                      {item.weeklySessions} sessions
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
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
                      const sharedGroupLabel = item.sharedTeachingGroupId
                        ? sharedGroupLabels.get(item.sharedTeachingGroupId)
                        : null;
                      return (
                        <div
                          className={`flex min-h-16 items-center gap-3 border-r border-b border-[#dce1dc] px-4 py-3 ${
                            initiallyOwnedByOther && !reassigned
                              ? "bg-[#f3f4f3] text-[#7b837f]"
                              : ""
                          }`}
                          key={item.id}
                        >
                          <input
                            aria-label={`${item.className} ${item.subjectName}`}
                            checked={selectedIds.has(item.id)}
                            disabled={initiallyOwnedByOther && !reassigned}
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
                          {sharedGroupLabel ? (
                            <span className="inline-flex items-center gap-1 border border-[#9bc8b5] bg-[#eef8f3] px-2 py-1 text-xs font-semibold text-[#0b5b43]">
                              <Link2 aria-hidden="true" size={12} />
                              Combined: {sharedGroupLabel}
                            </span>
                          ) : null}
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
        disabled={
          !workloadExact || curriculum.length === 0 || !teachingSubjectId
        }
        type="submit"
      >
        <Save aria-hidden="true" className="mr-2" size={16} />
        {teacher ? "Save teacher" : "Add teacher"}
      </button>
    </form>
  );
}

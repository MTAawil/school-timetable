"use client";

import { useState } from "react";

type CoverageItem = {
  id: string;
  subjectId: string;
  subjectName: string;
  subjectCode: string;
  className: string;
  weeklySessions: number;
  teacherId: string | null;
};

export function TeacherCoverageOverview({
  curriculum,
}: {
  curriculum: CoverageItem[];
}) {
  const subjects = Array.from(
    new Map(
      curriculum.map((item) => [
        item.subjectId,
        {
          id: item.subjectId,
          name: item.subjectName,
          code: item.subjectCode,
        },
      ]),
    ).values(),
  ).sort((left, right) => left.name.localeCompare(right.name));
  const [selectedSubjectId, setSelectedSubjectId] = useState(
    subjects[0]?.id ?? "",
  );
  const coverage = subjects.map((subject) => {
    const items = curriculum.filter((item) => item.subjectId === subject.id);
    return {
      ...subject,
      assigned: items
        .filter((item) => item.teacherId)
        .reduce((sum, item) => sum + item.weeklySessions, 0),
      required: items.reduce((sum, item) => sum + item.weeklySessions, 0),
      missing: items.filter((item) => !item.teacherId),
    };
  });
  const selected = coverage.find((subject) => subject.id === selectedSubjectId);

  return (
    <section
      aria-label="Teacher coverage by subject"
      className="border border-[#dce1dc] bg-white"
    >
      <div className="border-b border-[#dce1dc] px-5 py-4">
        <h2 className="text-lg font-semibold">Teacher coverage</h2>
        <p className="mt-1 text-sm text-[#66706b]">
          Assigned sessions compared with all sessions required by the
          curriculum.
        </p>
      </div>
      <div className="grid sm:grid-cols-2 xl:grid-cols-3">
        {coverage.map((subject) => {
          const remaining = subject.required - subject.assigned;
          const complete = remaining === 0;
          return (
            <button
              aria-describedby={`coverage-overview-${subject.id}`}
              aria-pressed={selectedSubjectId === subject.id}
              className={`group relative min-h-24 border-r border-b border-[#dce1dc] px-5 py-4 text-left ${
                complete
                  ? "bg-[#eef8f3]"
                  : subject.assigned === 0
                    ? "bg-[#fff1ef]"
                    : "bg-[#fff9e9]"
              } ${
                selectedSubjectId === subject.id
                  ? "outline-2 -outline-offset-2 outline-[#0e6b4f]"
                  : ""
              }`}
              key={subject.id}
              onClick={() => setSelectedSubjectId(subject.id)}
              type="button"
            >
              <span className="block font-semibold">
                {subject.name} ({subject.code})
              </span>
              <span className="mt-1 block text-sm">
                {subject.assigned} / {subject.required} sessions assigned
              </span>
              <span
                className={`mt-1 block text-xs font-semibold ${
                  complete ? "text-[#0b5b43]" : "text-[#8b2119]"
                }`}
              >
                {complete
                  ? "Complete"
                  : `${String(remaining)} sessions remaining`}
              </span>
              <span
                className="pointer-events-none absolute inset-x-2 top-[calc(100%-0.5rem)] z-20 hidden border border-[#b8c0bb] bg-[#24312c] p-3 text-left text-white shadow-lg group-hover:block group-focus-visible:block"
                id={`coverage-overview-${subject.id}`}
                role="tooltip"
              >
                <span className="block text-sm font-semibold">
                  {subject.name} coverage
                </span>
                <span className="mt-1 block text-xs text-[#dbe4df]">
                  {subject.assigned} of {subject.required} required sessions
                  assigned
                </span>
                <span className="mt-2 block text-xs">
                  {complete
                    ? "All classes have teachers."
                    : `${subject.missing.length} classes still need a teacher.`}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      {selected ? (
        <div className="px-5 py-4" aria-live="polite">
          <h3 className="text-sm font-semibold">
            Classes still needing a {selected.name} teacher
          </h3>
          {selected.missing.length === 0 ? (
            <p className="mt-2 text-sm text-[#0b5b43]">
              All classes are covered.
            </p>
          ) : (
            <ul className="mt-2 flex flex-wrap gap-2">
              {selected.missing.map((item) => (
                <li
                  className="border border-[#e3b7b2] bg-[#fff7f5] px-3 py-2 text-sm"
                  key={item.id}
                >
                  {item.className} · {item.weeklySessions} sessions
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </section>
  );
}

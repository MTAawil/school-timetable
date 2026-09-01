import { getDatabase } from "@school-timetable/database";
import {
  defaultMainSubject,
  starterSubjects,
} from "@school-timetable/shared/curriculum";
import { BookPlus, Check, LibraryBig, Save } from "lucide-react";

import {
  addCustomSubject,
  installStarterSubjects,
  saveCurriculumMatrix,
  saveSubjectCatalogue,
} from "@/app/(protected)/subjects/actions";
import { CurriculumMatrix } from "@/components/curriculum-matrix";
import { buttonClass, inputClass, PageHeading } from "@/components/setup-ui";
import { WorkflowNextAction } from "@/components/workflow-next-action";
import { verifySession } from "@/lib/auth/dal";
import { getActiveTerm } from "@/lib/setup";

export default async function SubjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const user = await verifySession();
  const term = await getActiveTerm(user.schoolId);
  const db = getDatabase();
  const [configuration, classSections, subjects, curriculum] =
    await Promise.all([
      db.schoolWeekConfiguration.findFirst({
        where: { schoolId: user.schoolId, termId: term.id },
      }),
      db.classSection.findMany({
        where: {
          schoolId: user.schoolId,
          termId: term.id,
          isActive: true,
          deletedAt: null,
          gradeLevelId: { not: null },
        },
        include: { gradeLevel: true },
        orderBy: [
          { gradeLevel: { displayOrder: "asc" } },
          { sectionLabel: "asc" },
          { shortCode: "asc" },
        ],
      }),
      db.subject.findMany({
        where: { schoolId: user.schoolId, deletedAt: null },
        orderBy: [{ isActive: "desc" }, { name: "asc" }],
      }),
      db.classCurriculum.findMany({
        where: { schoolId: user.schoolId, termId: term.id, isActive: true },
      }),
    ]);
  const params = await searchParams;
  const activeSubjects = subjects.filter((subject) => subject.isActive);
  const curriculumByCell = new Map(
    curriculum.map((item) => [
      `${item.classSectionId}:${item.subjectId}`,
      item,
    ]),
  );
  const installedCodes = new Set(subjects.map((subject) => subject.shortCode));
  const missingStarterCount = starterSubjects.filter(
    ([code]) => !installedCodes.has(code),
  ).length;

  return (
    <div className="space-y-8">
      <PageHeading
        title="Subjects and curriculum"
        description={`Define what every class studies during ${term.name}.`}
      />

      {params.saved ? (
        <div
          className="flex items-center gap-2 border border-[#9bc8b5] bg-[#eef8f3] px-4 py-3 text-sm font-medium text-[#0b5b43]"
          role="status"
        >
          <Check aria-hidden="true" size={17} />
          {params.saved === "curriculum"
            ? "Class curriculum saved."
            : "Subject catalogue saved."}
        </div>
      ) : null}

      <section className="space-y-5" aria-labelledby="catalogue-heading">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#dce1dc] pb-3">
          <div className="flex items-center gap-3">
            <LibraryBig
              aria-hidden="true"
              size={20}
              className="text-[#0e6b4f]"
            />
            <div>
              <h2 id="catalogue-heading" className="font-semibold">
                Subject catalogue
              </h2>
              <p className="mt-1 text-sm text-[#66706b]">
                Names and codes are editable. Inactive subjects stay in history.
              </p>
            </div>
          </div>
          {missingStarterCount > 0 ? (
            <form action={installStarterSubjects}>
              <button className={buttonClass} type="submit">
                <BookPlus aria-hidden="true" className="mr-2" size={16} />
                Add starter subjects
              </button>
            </form>
          ) : null}
        </div>

        {subjects.length > 0 ? (
          <form action={saveSubjectCatalogue} className="space-y-4">
            <div className="overflow-x-auto border border-[#dce1dc] bg-white">
              <table className="w-full min-w-[620px] border-collapse text-left text-sm">
                <thead className="bg-[#f2f5f2] text-xs text-[#56615c]">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Subject</th>
                    <th className="px-4 py-3 font-semibold">Code</th>
                    <th className="w-28 px-4 py-3 text-center font-semibold">
                      Active
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {subjects.map((subject) => (
                    <tr key={subject.id} className="border-t border-[#dce1dc]">
                      <td className="px-4 py-2">
                        <input
                          type="hidden"
                          name="subjectId"
                          value={subject.id}
                        />
                        <input
                          className={inputClass}
                          name={`name:${subject.id}`}
                          defaultValue={subject.name}
                          maxLength={100}
                          required
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input
                          className={inputClass}
                          name={`shortCode:${subject.id}`}
                          defaultValue={subject.shortCode}
                          maxLength={24}
                          pattern="[A-Za-z0-9_]+"
                          required
                        />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <input
                          className="size-4 accent-[#0e6b4f]"
                          name={`active:${subject.id}`}
                          type="checkbox"
                          defaultChecked={subject.isActive}
                          aria-label={`${subject.name} active`}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button className={buttonClass} type="submit">
              <Save aria-hidden="true" className="mr-2" size={16} />
              Save catalogue
            </button>
          </form>
        ) : (
          <p className="border border-dashed border-[#cfd5d1] bg-white px-5 py-8 text-center text-sm text-[#66706b]">
            Add the starter catalogue or create the first custom subject.
          </p>
        )}

        <form
          action={addCustomSubject}
          className="grid gap-3 border-y border-[#dce1dc] bg-white px-4 py-4 sm:grid-cols-[1fr_12rem_auto]"
        >
          <label className="text-sm font-medium">
            New subject
            <input
              className={`${inputClass} mt-2`}
              name="name"
              placeholder="Subject name"
              maxLength={100}
              required
            />
          </label>
          <label className="text-sm font-medium">
            Code
            <input
              className={`${inputClass} mt-2`}
              name="shortCode"
              placeholder="CODE"
              pattern="[A-Za-z0-9_]+"
              maxLength={24}
              required
            />
          </label>
          <button className={`${buttonClass} self-end`} type="submit">
            <BookPlus aria-hidden="true" className="mr-2" size={16} />
            Add subject
          </button>
        </form>
      </section>

      <section className="space-y-5" aria-labelledby="curriculum-heading">
        <div className="border-b border-[#dce1dc] pb-3">
          <h2 id="curriculum-heading" className="font-semibold">
            Weekly curriculum
          </h2>
          <p className="mt-1 text-sm text-[#66706b]">
            Enter physical sessions per week. Time is calculated from the school
            session duration.
          </p>
        </div>

        {!configuration ? (
          <p className="border border-[#e0c78f] bg-[#fff9e9] px-4 py-3 text-sm text-[#6e5314]">
            Save the school week before entering curriculum.
          </p>
        ) : classSections.length === 0 ? (
          <p className="border border-[#e0c78f] bg-[#fff9e9] px-4 py-3 text-sm text-[#6e5314]">
            Add at least one class section in School Setup.
          </p>
        ) : activeSubjects.length === 0 ? (
          <p className="border border-[#e0c78f] bg-[#fff9e9] px-4 py-3 text-sm text-[#6e5314]">
            Activate at least one subject to build the curriculum.
          </p>
        ) : (
          <CurriculumMatrix
            classSections={classSections.flatMap((classSection) =>
              classSection.gradeLevel
                ? [
                    {
                      id: classSection.id,
                      name: classSection.sectionName,
                      shortCode: classSection.shortCode,
                      gradeCode: classSection.gradeLevel.code,
                    },
                  ]
                : [],
            )}
            subjects={activeSubjects.map(({ id, name, shortCode }) => ({
              id,
              name,
              shortCode,
            }))}
            initialCells={classSections.flatMap((classSection) =>
              activeSubjects.map((subject) => {
                const existing = curriculumByCell.get(
                  `${classSection.id}:${subject.id}`,
                );
                const isMainSubject =
                  existing?.isMainSubject ??
                  defaultMainSubject(
                    classSection.gradeLevel?.code ?? "",
                    subject.shortCode,
                  );
                return {
                  classSectionId: classSection.id,
                  subjectId: subject.id,
                  weeklySessions: existing?.weeklySessions ?? 0,
                  isMainSubject,
                  allowDoubleSession:
                    existing?.allowDoubleSession ?? isMainSubject,
                };
              }),
            )}
            workingDayCount={configuration.workingDayCount}
            sessionsPerDay={configuration.sessionsPerDay}
            sessionDurationMinutes={configuration.sessionDurationMinutes}
            action={saveCurriculumMatrix}
          />
        )}
      </section>
      <WorkflowNextAction
        description="Continue after every active class has its weekly subject sessions."
        href="/teachers"
        label="Continue to teachers"
      />
    </div>
  );
}

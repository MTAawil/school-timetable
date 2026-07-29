import { getDatabase } from "@school-timetable/database";
import { summarizeTeacherWorkloads } from "@school-timetable/shared/teacher-allocation";
import { Check, Pencil, Plus, Users } from "lucide-react";
import Link from "next/link";

import { saveTeacherWorkflow } from "@/app/(protected)/teachers/actions";
import { buttonClass, PageHeading } from "@/components/setup-ui";
import { TeacherWorkflowEditor } from "@/components/teacher-workflow-editor";
import { WorkflowNextAction } from "@/components/workflow-next-action";
import { verifySession } from "@/lib/auth/dal";
import { getActiveTerm } from "@/lib/setup";

export default async function TeachersPage({
  searchParams,
}: {
  searchParams: Promise<{
    saved?: string;
    teacher?: string;
    error?: string;
    declared?: string;
    allocated?: string;
  }>;
}) {
  const user = await verifySession();
  const term = await getActiveTerm(user.schoolId);
  const db = getDatabase();
  const params = await searchParams;
  const [teachers, curriculum, days, periods] = await Promise.all([
    db.teacher.findMany({
      where: { schoolId: user.schoolId, isActive: true, deletedAt: null },
      orderBy: { name: "asc" },
    }),
    db.classCurriculum.findMany({
      where: {
        schoolId: user.schoolId,
        termId: term.id,
        isActive: true,
        classSection: { isActive: true, deletedAt: null },
      },
      include: { classSection: true, subject: true, teacher: true },
      orderBy: [
        { classSection: { shortCode: "asc" } },
        { subject: { name: "asc" } },
      ],
    }),
    db.dayDefinition.findMany({
      where: { schoolId: user.schoolId, termId: term.id, isWorking: true },
      orderBy: { dayIndex: "asc" },
    }),
    db.periodDefinition.findMany({
      where: { schoolId: user.schoolId, termId: term.id },
      orderBy: { periodIndex: "asc" },
    }),
  ]);
  const selectedTeacher =
    params.teacher === "new"
      ? undefined
      : (teachers.find((teacher) => teacher.id === params.teacher) ??
        teachers[0]);
  const restrictions = selectedTeacher
    ? await db.availabilityRule.findMany({
        where: {
          schoolId: user.schoolId,
          termId: term.id,
          entityType: "TEACHER",
          entityId: selectedTeacher.id,
        },
      })
    : [];
  const workload = summarizeTeacherWorkloads(
    teachers.map((teacher) => ({
      teacherId: teacher.id,
      declaredWeeklySessions: teacher.weeklyTeachingSessions,
    })),
    curriculum.map((item) => ({
      classCurriculumId: item.id,
      teacherId: item.teacherId,
      weeklySessions: item.weeklySessions,
    })),
  );
  const uncovered = curriculum.filter((item) => !item.teacherId).length;

  return (
    <div className="space-y-8">
      <PageHeading
        title="Teachers"
        description={`Complete one teacher at a time for ${term.name}.`}
      />

      {params.saved ? (
        <div
          className="flex items-center gap-2 border border-[#9bc8b5] bg-[#eef8f3] px-4 py-3 text-sm font-medium text-[#0b5b43]"
          role="status"
        >
          <Check aria-hidden="true" size={17} />
          Teacher details, classes, subjects, and restrictions saved.
        </div>
      ) : null}
      {params.error ? (
        <div
          className="border border-[#e3b7b2] bg-[#fff1ef] px-4 py-3 text-sm font-medium text-[#8b2119]"
          role="alert"
        >
          {params.error === "CLASS_SUBJECT_ALREADY_ASSIGNED"
            ? "A selected class-subject was assigned to another teacher. Review the locked assignments and try again."
            : `Declared sessions (${params.declared ?? "0"}) must equal allocated sessions (${params.allocated ?? "0"}).`}
        </div>
      ) : null}

      <section className="space-y-4" aria-labelledby="teacher-list-heading">
        <div className="flex flex-wrap items-center gap-3 border-b border-[#dce1dc] pb-3">
          <Users aria-hidden="true" className="text-[#0e6b4f]" size={20} />
          <div>
            <h2 id="teacher-list-heading" className="font-semibold">
              Teachers and coverage
            </h2>
            <p className="mt-1 text-sm text-[#66706b]">
              {uncovered} class-subjects remain unassigned.
            </p>
          </div>
          <Link
            className={`${buttonClass} ml-auto`}
            href="/teachers?teacher=new"
          >
            <Plus aria-hidden="true" className="mr-2" size={16} />
            Add teacher
          </Link>
        </div>

        {teachers.length === 0 ? (
          <p className="border border-[#e0c78f] bg-[#fff9e9] px-4 py-3 text-sm text-[#6e5314]">
            No teachers yet. Complete the form below to add the first teacher.
          </p>
        ) : (
          <div className="overflow-x-auto border border-[#dce1dc] bg-white">
            <table className="w-full min-w-[680px] border-collapse text-left text-sm">
              <thead className="bg-[#f2f5f2] text-xs text-[#56615c]">
                <tr>
                  <th className="px-4 py-3 font-semibold">Teacher</th>
                  <th className="px-4 py-3 font-semibold">Employment</th>
                  <th className="px-4 py-3 text-center font-semibold">
                    Declared
                  </th>
                  <th className="px-4 py-3 text-center font-semibold">
                    Allocated
                  </th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="w-20 px-4 py-3">
                    <span className="sr-only">Edit</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {teachers.map((teacher) => {
                  const summary = workload.find(
                    (item) => item.teacherId === teacher.id,
                  );
                  return (
                    <tr className="border-t border-[#dce1dc]" key={teacher.id}>
                      <td className="px-4 py-3 font-medium">{teacher.name}</td>
                      <td className="px-4 py-3">
                        {teacher.employmentType === "FULL_TIME"
                          ? "Full time"
                          : "Part time"}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {summary?.declaredWeeklySessions ?? 0}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {summary?.allocatedWeeklySessions ?? 0}
                      </td>
                      <td
                        className={`px-4 py-3 font-medium ${
                          summary?.status === "EXACT"
                            ? "text-[#0e6b4f]"
                            : "text-[#9d2e25]"
                        }`}
                      >
                        {summary?.status === "EXACT"
                          ? "Exact"
                          : summary?.status === "OVER"
                            ? "Over allocated"
                            : "Needs allocation"}
                      </td>
                      <td className="px-4 py-2">
                        <Link
                          aria-label={`Edit ${teacher.name}`}
                          className="inline-flex h-9 w-9 items-center justify-center border border-[#9ba59f] bg-white hover:bg-[#f0f2ef]"
                          href={`/teachers?teacher=${teacher.id}`}
                          title="Edit teacher"
                        >
                          <Pencil aria-hidden="true" size={15} />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-4" aria-labelledby="teacher-editor-heading">
        <div className="border-b border-[#dce1dc] pb-3">
          <h2 id="teacher-editor-heading" className="font-semibold">
            {selectedTeacher ? `Edit ${selectedTeacher.name}` : "Add teacher"}
          </h2>
          <p className="mt-1 text-sm text-[#66706b]">
            Finish all three sections before saving this teacher.
          </p>
        </div>
        <TeacherWorkflowEditor
          action={saveTeacherWorkflow}
          curriculum={curriculum.map((item) => ({
            id: item.id,
            subjectId: item.subjectId,
            className: item.classSection.sectionName,
            classCode: item.classSection.shortCode,
            subjectName: item.subject.name,
            subjectCode: item.subject.shortCode,
            weeklySessions: item.weeklySessions,
            teacherId: item.teacherId,
            teacherName: item.teacher?.name ?? null,
          }))}
          days={days.map((day) => ({
            dayIndex: day.dayIndex,
            name: day.name,
          }))}
          periods={periods.map((period) => ({
            periodIndex: period.periodIndex,
            name: period.name,
            isTeaching: period.isTeaching,
          }))}
          restrictions={restrictions.flatMap((rule) =>
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
          key={selectedTeacher?.id ?? "new"}
          teacher={
            selectedTeacher
              ? {
                  id: selectedTeacher.id,
                  name: selectedTeacher.name,
                  shortCode: selectedTeacher.shortCode,
                  employmentType: selectedTeacher.employmentType,
                  weeklyTeachingSessions:
                    selectedTeacher.weeklyTeachingSessions,
                  maxLessonsPerDay: selectedTeacher.maxLessonsPerDay,
                  maxConsecutiveLessons: selectedTeacher.maxConsecutiveLessons,
                }
              : undefined
          }
        />
      </section>

      <WorkflowNextAction
        description="Continue after every class-subject is assigned and every teacher workload is exact."
        href="/readiness"
        label="Review and generate"
      />
    </div>
  );
}

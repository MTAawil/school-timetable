import { getDatabase } from "@school-timetable/database";
import { Check, Save, UserPlus, Users } from "lucide-react";

import {
  saveTeacherProfile,
  saveTeachingAllocations,
} from "@/app/(protected)/teachers/actions";
import { buttonClass, inputClass, PageHeading } from "@/components/setup-ui";
import { TeacherAllocationBoard } from "@/components/teacher-allocation-board";
import { WorkflowNextAction } from "@/components/workflow-next-action";
import { verifySession } from "@/lib/auth/dal";
import { getActiveTerm } from "@/lib/setup";

export default async function TeachersPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const user = await verifySession();
  const term = await getActiveTerm(user.schoolId);
  const db = getDatabase();
  const [teachers, curriculum] = await Promise.all([
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
      include: { classSection: true, subject: true },
      orderBy: [
        { classSection: { shortCode: "asc" } },
        { subject: { name: "asc" } },
      ],
    }),
  ]);
  const params = await searchParams;

  return (
    <div className="space-y-8">
      <PageHeading
        title="Teachers and assignments"
        description={`Add teachers and assign every class-subject for ${term.name}.`}
      />

      {params.saved ? (
        <div
          className="flex items-center gap-2 border border-[#9bc8b5] bg-[#eef8f3] px-4 py-3 text-sm font-medium text-[#0b5b43]"
          role="status"
        >
          <Check aria-hidden="true" size={17} />
          {params.saved === "allocations"
            ? "Teaching assignments saved."
            : "Teacher saved."}
        </div>
      ) : null}

      <section className="space-y-5" aria-labelledby="add-teacher-heading">
        <div className="flex items-center gap-3 border-b border-[#dce1dc] pb-3">
          <UserPlus aria-hidden="true" size={20} className="text-[#0e6b4f]" />
          <div>
            <h2 id="add-teacher-heading" className="font-semibold">
              Add teacher
            </h2>
            <p className="mt-1 text-sm text-[#66706b]">
              Weekly teaching sessions are an exact required total.
            </p>
          </div>
        </div>
        <TeacherForm />
      </section>

      {teachers.length > 0 ? (
        <section className="space-y-5" aria-labelledby="staff-heading">
          <div className="flex items-center gap-3 border-b border-[#dce1dc] pb-3">
            <Users aria-hidden="true" size={20} className="text-[#0e6b4f]" />
            <div>
              <h2 id="staff-heading" className="font-semibold">
                Teacher profiles
              </h2>
              <p className="mt-1 text-sm text-[#66706b]">
                Edit identity, employment type, exact workload, and hard daily
                limits.
              </p>
            </div>
          </div>
          <div className="space-y-3">
            {teachers.map((teacher) => (
              <TeacherForm key={teacher.id} teacher={teacher} />
            ))}
          </div>
        </section>
      ) : null}

      <section className="space-y-5" aria-labelledby="assignments-heading">
        <div className="border-b border-[#dce1dc] pb-3">
          <h2 id="assignments-heading" className="font-semibold">
            Teaching assignments
          </h2>
          <p className="mt-1 text-sm text-[#66706b]">
            Every class-subject accepts one teacher. Session totals come from
            curriculum and cannot be changed here.
          </p>
        </div>
        {teachers.length === 0 ? (
          <Notice>Add at least one teacher before assigning curriculum.</Notice>
        ) : curriculum.length === 0 ? (
          <Notice>
            Save grade curriculum before creating teaching assignments.
          </Notice>
        ) : (
          <TeacherAllocationBoard
            teachers={teachers.map(({ id, name, weeklyTeachingSessions }) => ({
              id,
              name,
              weeklyTeachingSessions,
            }))}
            initialAllocations={curriculum.map((item) => ({
              id: item.id,
              className: item.classSection.sectionName,
              classCode: item.classSection.shortCode,
              subjectName: item.subject.name,
              subjectCode: item.subject.shortCode,
              weeklySessions: item.weeklySessions,
              teacherId: item.teacherId,
            }))}
            action={saveTeachingAllocations}
          />
        )}
      </section>
      <WorkflowNextAction
        description="Continue after all class-subjects are assigned and every workload matches."
        href="/availability"
        label="Continue to restrictions"
      />
    </div>
  );
}

type TeacherFormValue = {
  id: string;
  name: string;
  shortCode: string;
  employmentType: "FULL_TIME" | "PART_TIME";
  weeklyTeachingSessions: number;
  maxLessonsPerDay: number | null;
  maxConsecutiveLessons: number | null;
};

function TeacherForm({ teacher }: { teacher?: TeacherFormValue }) {
  return (
    <form
      action={saveTeacherProfile}
      className="grid gap-3 border-y border-[#dce1dc] bg-white px-4 py-4 sm:grid-cols-2 xl:grid-cols-[1.3fr_8rem_10rem_9rem_9rem_9rem_auto]"
    >
      {teacher ? <input type="hidden" name="id" value={teacher.id} /> : null}
      <label className="text-xs font-medium text-[#56615c]">
        Name
        <input
          className={`${inputClass} mt-1.5`}
          name="name"
          defaultValue={teacher?.name}
          maxLength={100}
          required
        />
      </label>
      <label className="text-xs font-medium text-[#56615c]">
        Code
        <input
          className={`${inputClass} mt-1.5`}
          name="shortCode"
          defaultValue={teacher?.shortCode}
          pattern="[A-Za-z0-9_]+"
          maxLength={12}
          required
        />
      </label>
      <label className="text-xs font-medium text-[#56615c]">
        Employment
        <select
          className={`${inputClass} mt-1.5`}
          name="employmentType"
          defaultValue={teacher?.employmentType ?? "FULL_TIME"}
        >
          <option value="FULL_TIME">Full time</option>
          <option value="PART_TIME">Part time</option>
        </select>
      </label>
      <label className="text-xs font-medium text-[#56615c]">
        Weekly sessions
        <input
          className={`${inputClass} mt-1.5`}
          name="weeklyTeachingSessions"
          type="number"
          min="1"
          max="100"
          defaultValue={teacher?.weeklyTeachingSessions}
          required
        />
      </label>
      <label className="text-xs font-medium text-[#56615c]">
        Max per day
        <input
          className={`${inputClass} mt-1.5`}
          name="maxLessonsPerDay"
          type="number"
          min="1"
          max="20"
          defaultValue={teacher?.maxLessonsPerDay ?? ""}
        />
      </label>
      <label className="text-xs font-medium text-[#56615c]">
        Max consecutive
        <input
          className={`${inputClass} mt-1.5`}
          name="maxConsecutiveLessons"
          type="number"
          min="1"
          max="20"
          defaultValue={teacher?.maxConsecutiveLessons ?? ""}
        />
      </label>
      <button className={`${buttonClass} self-end`} type="submit">
        <Save aria-hidden="true" className="mr-2" size={16} />
        {teacher ? "Update" : "Add"}
      </button>
    </form>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p className="border border-[#e0c78f] bg-[#fff9e9] px-4 py-3 text-sm text-[#6e5314]">
      {children}
    </p>
  );
}

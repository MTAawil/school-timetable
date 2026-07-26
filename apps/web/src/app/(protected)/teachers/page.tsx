import { getDatabase } from "@school-timetable/database";
import { Save } from "lucide-react";

import { EntityTable } from "@/components/entity-table";
import {
  PageHeading,
  SectionHeading,
  buttonClass,
  inputClass,
} from "@/components/setup-ui";
import { verifySession } from "@/lib/auth/dal";
import { saveTeacher } from "@/app/(protected)/setup/actions";

export default async function TeachersPage() {
  const user = await verifySession();
  const teachers = await getDatabase().teacher.findMany({
    where: { schoolId: user.schoolId, deletedAt: null },
    orderBy: { name: "asc" },
  });
  return (
    <div className="space-y-7">
      <PageHeading
        title="Teachers"
        description="Manage staff identities and daily workload limits."
      />
      <section className="space-y-4">
        <SectionHeading>Add teacher</SectionHeading>
        <form
          action={saveTeacher}
          className="grid gap-3 border border-[#dce1dc] bg-white p-4 md:grid-cols-5"
        >
          <input
            className={inputClass}
            name="name"
            placeholder="Full name"
            required
          />
          <input
            className={inputClass}
            name="shortCode"
            placeholder="Code"
            required
          />
          <select
            className={inputClass}
            name="employmentType"
            defaultValue="FULL_TIME"
          >
            <option value="FULL_TIME">Full time</option>
            <option value="PART_TIME">Part time</option>
          </select>
          <input
            className={inputClass}
            name="maxLessonsPerDay"
            min="1"
            placeholder="Max lessons/day"
            type="number"
          />
          <button className={buttonClass} type="submit">
            <Save size={16} className="mr-2" />
            Save teacher
          </button>
        </form>
      </section>
      <EntityTable
        headers={["Teacher", "Code", "Employment", "Max/day"]}
        emptyMessage="No teachers yet."
        rows={teachers.map((teacher) => [
          teacher.name,
          teacher.shortCode,
          teacher.employmentType === "FULL_TIME" ? "Full time" : "Part time",
          teacher.maxLessonsPerDay ?? "Not set",
        ])}
      />
    </div>
  );
}

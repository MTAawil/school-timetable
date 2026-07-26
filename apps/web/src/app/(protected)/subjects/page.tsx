import { getDatabase } from "@school-timetable/database";
import { Save } from "lucide-react";

import { saveSubject } from "@/app/(protected)/setup/actions";
import { EntityTable } from "@/components/entity-table";
import {
  PageHeading,
  SectionHeading,
  buttonClass,
  inputClass,
} from "@/components/setup-ui";
import { verifySession } from "@/lib/auth/dal";

export default async function SubjectsPage() {
  const user = await verifySession();
  const subjects = await getDatabase().subject.findMany({
    where: { schoolId: user.schoolId, deletedAt: null },
    orderBy: { name: "asc" },
  });
  return (
    <div className="space-y-7">
      <PageHeading
        title="Subjects"
        description="Define subjects and their scheduling preferences."
      />
      <section className="space-y-4">
        <SectionHeading>Add subject</SectionHeading>
        <form
          action={saveSubject}
          className="grid gap-3 border border-[#dce1dc] bg-white p-4 md:grid-cols-5"
        >
          <input
            className={inputClass}
            name="name"
            placeholder="Subject name"
            required
          />
          <input
            className={inputClass}
            name="shortCode"
            placeholder="Code"
            required
          />
          <input
            className={inputClass}
            name="category"
            placeholder="Category"
          />
          <select
            className={inputClass}
            name="preferredTimeBand"
            defaultValue="NEUTRAL"
          >
            <option value="EARLY">Prefer early</option>
            <option value="NEUTRAL">No preference</option>
            <option value="LATE">Prefer late</option>
          </select>
          <button className={buttonClass} type="submit">
            <Save size={16} className="mr-2" />
            Save subject
          </button>
        </form>
      </section>
      <EntityTable
        headers={["Subject", "Code", "Category", "Time preference"]}
        emptyMessage="No subjects yet."
        rows={subjects.map((subject) => [
          subject.name,
          subject.shortCode,
          subject.category ?? "Uncategorized",
          subject.preferredTimeBand.toLowerCase(),
        ])}
      />
    </div>
  );
}

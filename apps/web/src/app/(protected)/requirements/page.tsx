import { getDatabase } from "@school-timetable/database";
import { Save } from "lucide-react";

import { saveRequirement } from "@/app/(protected)/setup/actions";
import { EntityTable } from "@/components/entity-table";
import {
  PageHeading,
  SectionHeading,
  buttonClass,
  inputClass,
} from "@/components/setup-ui";
import { verifySession } from "@/lib/auth/dal";
import { getActiveTerm } from "@/lib/setup";

export default async function RequirementsPage() {
  const user = await verifySession();
  const term = await getActiveTerm(user.schoolId);
  const db = getDatabase();
  const [requirements, classes, subjects, teachers, rooms] = await Promise.all([
    db.teachingRequirement.findMany({
      where: { schoolId: user.schoolId, termId: term.id, deletedAt: null },
      include: {
        classSection: true,
        subject: true,
        teacher: true,
        requiredRoom: true,
      },
      orderBy: { createdAt: "desc" },
    }),
    db.classSection.findMany({
      where: { schoolId: user.schoolId, termId: term.id, deletedAt: null },
      orderBy: { shortCode: "asc" },
    }),
    db.subject.findMany({
      where: { schoolId: user.schoolId, deletedAt: null },
      orderBy: { name: "asc" },
    }),
    db.teacher.findMany({
      where: { schoolId: user.schoolId, deletedAt: null },
      orderBy: { name: "asc" },
    }),
    db.room.findMany({
      where: { schoolId: user.schoolId, deletedAt: null },
      orderBy: { name: "asc" },
    }),
  ]);
  const ready =
    classes.length > 0 && subjects.length > 0 && teachers.length > 0;
  return (
    <div className="space-y-7">
      <PageHeading
        title="Teaching requirements"
        description="Connect each class and subject to a teacher and weekly lesson count."
      />
      <section className="space-y-4">
        <SectionHeading>Add requirement</SectionHeading>
        {ready ? (
          <form
            action={saveRequirement}
            className="grid gap-3 border border-[#dce1dc] bg-white p-4 md:grid-cols-4"
          >
            <select
              aria-label="Class"
              className={inputClass}
              name="classSectionId"
              required
              defaultValue=""
            >
              <option disabled value="">
                Select class
              </option>
              {classes.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.shortCode}
                </option>
              ))}
            </select>
            <select
              aria-label="Subject"
              className={inputClass}
              name="subjectId"
              required
              defaultValue=""
            >
              <option disabled value="">
                Select subject
              </option>
              {subjects.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <select
              aria-label="Teacher"
              className={inputClass}
              name="teacherId"
              required
              defaultValue=""
            >
              <option disabled value="">
                Select teacher
              </option>
              {teachers.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <select
              aria-label="Required room"
              className={inputClass}
              name="requiredRoomId"
              defaultValue=""
            >
              <option value="">Any room</option>
              {rooms.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <input
              aria-label="Weekly occurrences"
              className={inputClass}
              name="weeklyOccurrences"
              defaultValue="3"
              min="1"
              type="number"
              required
            />
            <input
              aria-label="Duration in periods"
              className={inputClass}
              name="durationPeriods"
              defaultValue="1"
              min="1"
              max="4"
              type="number"
              required
            />
            <input
              aria-label="Minimum distinct days"
              className={inputClass}
              name="minimumDistinctDays"
              defaultValue="2"
              min="1"
              type="number"
              required
            />
            <button className={buttonClass}>
              <Save size={16} className="mr-2" />
              Save requirement
            </button>
          </form>
        ) : (
          <p className="border border-[#e7c96e] bg-[#fff9e8] p-4 text-sm">
            Add at least one class, subject, and teacher before creating
            requirements.
          </p>
        )}
      </section>
      <EntityTable
        headers={["Class", "Subject", "Teacher", "Weekly pattern", "Room"]}
        emptyMessage="No teaching requirements yet."
        rows={requirements.map((item) => [
          item.classSection.shortCode,
          item.subject.name,
          item.teacher.name,
          `${item.weeklyOccurrences} x ${item.durationPeriods} period${item.durationPeriods === 1 ? "" : "s"}`,
          item.requiredRoom?.name ?? "Any",
        ])}
      />
    </div>
  );
}

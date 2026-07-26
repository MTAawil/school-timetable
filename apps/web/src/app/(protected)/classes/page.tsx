import { getDatabase } from "@school-timetable/database";
import { Save } from "lucide-react";

import { saveClassSection } from "@/app/(protected)/setup/actions";
import { EntityTable } from "@/components/entity-table";
import {
  PageHeading,
  SectionHeading,
  buttonClass,
  inputClass,
} from "@/components/setup-ui";
import { verifySession } from "@/lib/auth/dal";
import { getActiveTerm } from "@/lib/setup";

export default async function ClassesPage() {
  const user = await verifySession();
  const term = await getActiveTerm(user.schoolId);
  const db = getDatabase();
  const [classes, teachers, rooms] = await Promise.all([
    db.classSection.findMany({
      where: { schoolId: user.schoolId, termId: term.id, deletedAt: null },
      include: { homeroomTeacher: true, fixedRoom: true },
      orderBy: [{ grade: "asc" }, { sectionName: "asc" }],
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
  return (
    <div className="space-y-7">
      <PageHeading
        title="Classes"
        description={`Manage class sections for ${term.name}.`}
      />
      <section className="space-y-4">
        <SectionHeading>Add class</SectionHeading>
        <form
          action={saveClassSection}
          className="grid gap-3 border border-[#dce1dc] bg-white p-4 md:grid-cols-3"
        >
          <input
            className={inputClass}
            name="grade"
            placeholder="Grade (for example 7)"
            required
          />
          <input
            className={inputClass}
            name="sectionName"
            placeholder="Section (for example A)"
            required
          />
          <input
            className={inputClass}
            name="shortCode"
            placeholder="Code (7A)"
            required
          />
          <select
            className={inputClass}
            name="homeroomTeacherId"
            defaultValue=""
          >
            <option value="">No homeroom teacher</option>
            {teachers.map((teacher) => (
              <option key={teacher.id} value={teacher.id}>
                {teacher.name}
              </option>
            ))}
          </select>
          <select className={inputClass} name="fixedRoomId" defaultValue="">
            <option value="">No fixed room</option>
            {rooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.name}
              </option>
            ))}
          </select>
          <div className="flex gap-3">
            <input
              className={inputClass}
              name="maxLessonsPerDay"
              min="1"
              placeholder="Max lessons/day"
              type="number"
            />
            <button className={`${buttonClass} shrink-0`}>
              <Save size={16} className="mr-2" />
              Save
            </button>
          </div>
        </form>
      </section>
      <EntityTable
        headers={["Class", "Code", "Homeroom teacher", "Room"]}
        emptyMessage="No classes yet."
        rows={classes.map((item) => [
          `Grade ${item.grade} - ${item.sectionName}`,
          item.shortCode,
          item.homeroomTeacher?.name ?? "Not assigned",
          item.fixedRoom?.name ?? "Not assigned",
        ])}
      />
    </div>
  );
}

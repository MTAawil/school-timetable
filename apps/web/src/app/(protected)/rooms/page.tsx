import { getDatabase } from "@school-timetable/database";
import { Save } from "lucide-react";

import { saveRoom, setRoomsEnabled } from "@/app/(protected)/setup/actions";
import { EntityTable } from "@/components/entity-table";
import {
  PageHeading,
  SectionHeading,
  buttonClass,
  inputClass,
} from "@/components/setup-ui";
import { verifySession } from "@/lib/auth/dal";
import { getActiveTerm } from "@/lib/setup";

export default async function RoomsPage() {
  const user = await verifySession();
  const term = await getActiveTerm(user.schoolId);
  const rooms = await getDatabase().room.findMany({
    where: { schoolId: user.schoolId, deletedAt: null },
    orderBy: { name: "asc" },
  });
  return (
    <div className="space-y-7">
      <PageHeading
        title="Rooms"
        description="Enable room scheduling when lessons need specific spaces."
      />
      <form
        action={setRoomsEnabled}
        className="flex items-center justify-between border border-[#dce1dc] bg-white p-4"
      >
        <div>
          <p className="font-medium">Use rooms in this term</p>
          <p className="mt-1 text-sm text-[#66706b]">
            Room conflicts will become part of timetable generation.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <input
            aria-label="Enable rooms"
            defaultChecked={term.roomsEnabled}
            name="roomsEnabled"
            type="checkbox"
            className="h-5 w-5 accent-[#0e6b4f]"
          />
          <button className={buttonClass}>Apply</button>
        </div>
      </form>
      <section className="space-y-4">
        <SectionHeading>Add room</SectionHeading>
        <form
          action={saveRoom}
          className="grid gap-3 border border-[#dce1dc] bg-white p-4 md:grid-cols-5"
        >
          <input
            className={inputClass}
            name="name"
            placeholder="Room name"
            required
          />
          <input
            className={inputClass}
            name="shortCode"
            placeholder="Code"
            required
          />
          <select className={inputClass} name="type" defaultValue="STANDARD">
            <option value="STANDARD">Standard</option>
            <option value="LAB">Lab</option>
            <option value="COMPUTER_LAB">Computer lab</option>
            <option value="GYM">Gym</option>
            <option value="OTHER">Other</option>
          </select>
          <input
            className={inputClass}
            name="capacity"
            min="1"
            placeholder="Capacity"
            type="number"
          />
          <button className={buttonClass}>
            <Save size={16} className="mr-2" />
            Save room
          </button>
        </form>
      </section>
      <EntityTable
        headers={["Room", "Code", "Type", "Capacity"]}
        emptyMessage="No rooms yet."
        rows={rooms.map((room) => [
          room.name,
          room.shortCode,
          room.type.replaceAll("_", " ").toLowerCase(),
          room.capacity ?? "Not set",
        ])}
      />
    </div>
  );
}

import { Copy, Save } from "lucide-react";

import {
  saveSchedule,
  saveScheduleAsCopy,
} from "@/app/(protected)/schedules/actions";

export function ScheduleSaveControls({
  hasPendingChanges,
  name,
  scheduleId,
}: {
  hasPendingChanges: boolean;
  name: string;
  scheduleId: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <form action={saveSchedule}>
        <input name="scheduleId" type="hidden" value={scheduleId} />
        <button
          className="inline-flex h-10 items-center bg-[#0e6b4f] px-4 text-sm font-semibold text-white disabled:cursor-default disabled:bg-[#aeb8b3]"
          disabled={!hasPendingChanges}
          title={
            hasPendingChanges
              ? "Save pending edits to this working draft"
              : "This working draft is saved"
          }
        >
          <Save className="mr-2" size={16} />
          {hasPendingChanges ? "Save" : "Saved"}
        </button>
      </form>
      <details className="relative">
        <summary className="inline-flex h-10 cursor-pointer list-none items-center border border-[#9ba59f] bg-white px-3 text-sm font-semibold">
          <Copy className="mr-2" size={16} />
          Save as copy
        </summary>
        <form
          action={saveScheduleAsCopy}
          className="absolute right-0 z-30 mt-2 w-80 border border-[#cfd5d1] bg-white p-3 shadow-lg"
        >
          <input name="scheduleId" type="hidden" value={scheduleId} />
          <label className="block text-xs font-semibold" htmlFor="copy-name">
            Copy name
          </label>
          <input
            className="mt-2 h-10 w-full border border-[#aeb6b1] px-3 text-sm"
            defaultValue={`${name} copy`}
            id="copy-name"
            maxLength={100}
            name="name"
            required
          />
          <button className="mt-3 h-9 w-full bg-[#0e6b4f] px-3 text-sm font-semibold text-white">
            Create saved copy
          </button>
        </form>
      </details>
    </div>
  );
}

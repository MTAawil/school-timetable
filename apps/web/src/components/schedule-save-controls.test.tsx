import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/(protected)/schedules/actions", () => ({
  saveSchedule: vi.fn(),
  saveScheduleAsCopy: vi.fn(),
}));

import { ScheduleSaveControls } from "./schedule-save-controls";

describe("ScheduleSaveControls", () => {
  it("offers Save for pending revisions and Save as copy", () => {
    const markup = renderToStaticMarkup(
      <ScheduleSaveControls
        hasPendingChanges
        name="Working timetable"
        scheduleId="schedule-1"
      />,
    );

    expect(markup).toContain(">Save<");
    expect(markup).toContain("Save as copy");
    expect(markup).toContain("Working timetable copy");
  });

  it("shows a disabled saved state when no edits are pending", () => {
    const markup = renderToStaticMarkup(
      <ScheduleSaveControls
        hasPendingChanges={false}
        name="Working timetable"
        scheduleId="schedule-1"
      />,
    );

    expect(markup).toContain(">Saved<");
    expect(markup).toContain("disabled");
  });
});

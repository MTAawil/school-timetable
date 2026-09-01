import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/(protected)/schedules/actions", () => ({
  findMoveOptions: vi.fn(),
  moveAssignment: vi.fn(),
  swapAssignments: vi.fn(),
}));

import { ScheduleSessionMenu } from "./schedule-session-menu";

describe("ScheduleSessionMenu", () => {
  it("opens from a session without rendering the legacy assignment controls", () => {
    const markup = renderToStaticMarkup(
      <ScheduleSessionMenu
        assignmentId="assignment-1"
        disabled={false}
        label={
          <>
            <span>G10-A · MAT</span>
            <span>Rawad</span>
          </>
        }
        scheduleId="schedule-1"
        slots={[
          {
            dayIndex: 0,
            dayName: "Monday",
            periodIndex: 0,
            periodName: "Period 1",
          },
        ]}
      />,
    );

    expect(markup).toContain("G10-A");
    expect(markup).not.toContain("Preview unassign");
    expect(markup).not.toContain("Swap with");
  });
});

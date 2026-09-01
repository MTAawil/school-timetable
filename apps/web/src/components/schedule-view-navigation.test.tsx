import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ScheduleViewNavigation } from "./schedule-view-navigation";

describe("ScheduleViewNavigation", () => {
  it("makes every teacher timetable directly selectable", () => {
    const markup = renderToStaticMarkup(
      <ScheduleViewNavigation
        entities={[
          ["teacher-1", "Rawan"],
          ["teacher-2", "Nour"],
        ]}
        entityId="teacher-1"
        scheduleId="schedule-1"
        view="teacher"
      />,
    );

    expect(markup).toContain("Teacher schedules");
    expect(markup).toContain(
      "/schedules/schedule-1?view=teacher&amp;entity=teacher-1",
    );
    expect(markup).toContain(
      "/schedules/schedule-1?view=teacher&amp;entity=teacher-2",
    );
    expect(markup).toContain("Rawan");
    expect(markup).toContain("Nour");
  });

  it("explains how to open teacher schedules from the school view", () => {
    const markup = renderToStaticMarkup(
      <ScheduleViewNavigation
        entities={[]}
        scheduleId="schedule-1"
        view="school"
      />,
    );

    expect(markup).toContain(
      "to see each teacher&#x27;s individual weekly timetable",
    );
  });
});

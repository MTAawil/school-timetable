import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AvailabilityGrid } from "@/components/availability-grid";

describe("AvailabilityGrid", () => {
  it("renders all restriction states, preserves rules, and marks breaks", () => {
    const markup = renderToStaticMarkup(
      <AvailabilityGrid
        days={[{ dayIndex: 0, name: "Monday" }]}
        periods={[
          { periodIndex: 0, name: "Session 1", isTeaching: true },
          { periodIndex: 1, name: "Break", isTeaching: false },
        ]}
        restrictions={[{ dayIndex: 0, periodIndex: 0, state: "UNAVAILABLE" }]}
        teacher={{
          id: "teacher-id",
          employmentType: "FULL_TIME",
          weeklyTeachingSessions: 2,
          maxLessonsPerDay: null,
          maxConsecutiveLessons: null,
        }}
        action={async () => undefined}
      />,
    );

    expect(markup).toContain('name="state:0:0"');
    expect(markup).toContain('value="UNAVAILABLE" selected');
    expect(markup).toContain("Preferred");
    expect(markup).toContain("Avoid");
    expect(markup).toContain("Break");
    expect(markup).not.toContain('name="state:0:1"');
    expect(markup).toContain("Hard restrictions leave fewer slots");
    expect(markup).toContain("Balanced daily load");
  });
});

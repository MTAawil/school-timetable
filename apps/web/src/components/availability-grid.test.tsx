import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AvailabilityGrid } from "@/components/availability-grid";

describe("AvailabilityGrid", () => {
  it("renders teaching slots, preserves unavailable values, and marks breaks", () => {
    const markup = renderToStaticMarkup(
      <AvailabilityGrid
        days={[{ dayIndex: 0, name: "Monday" }]}
        periods={[
          { periodIndex: 0, name: "Period 1", isTeaching: true },
          { periodIndex: 1, name: "Break", isTeaching: false },
        ]}
        unavailable={new Set(["0:0"])}
      />,
    );

    expect(markup).toContain('name="slot:0:0"');
    expect(markup).toContain("checked");
    expect(markup).toContain("Break");
    expect(markup).not.toContain('name="slot:0:1"');
  });
});

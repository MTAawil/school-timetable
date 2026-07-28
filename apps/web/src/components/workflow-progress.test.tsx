import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  DesktopNavigation,
  MobileNavigation,
} from "@/components/app-navigation";
import { WorkflowProgress } from "@/components/workflow-progress";

vi.mock("next/navigation", () => ({
  usePathname: () => "/teachers",
}));

describe("supervisor workflow navigation", () => {
  it("renders five ordered progress steps and their completion state", () => {
    const markup = renderToStaticMarkup(
      <WorkflowProgress
        steps={[
          { href: "/setup", label: "School setup", complete: true },
          { href: "/subjects", label: "Curriculum", complete: true },
          { href: "/teachers", label: "Teachers", complete: false },
          {
            href: "/availability",
            label: "Restrictions",
            complete: false,
            optional: true,
          },
          { href: "/readiness", label: "Generate", complete: false },
        ]}
      />,
    );

    expect(markup).toContain("2 of 5 complete");
    expect(markup).toContain("School setup");
    expect(markup).toContain("Restrictions");
    expect(markup).toContain("Optional");
  });

  it("keeps only the seven primary destinations and marks the active page", () => {
    const markup = renderToStaticMarkup(
      <>
        <DesktopNavigation />
        <MobileNavigation />
      </>,
    );

    expect(markup).toContain("Overview");
    expect(markup).toContain("Curriculum");
    expect(markup).toContain("Timetables");
    expect(markup).toContain('aria-current="page"');
    expect(markup).not.toContain("Rooms");
    expect(markup).not.toContain("Requirements");
    expect(markup).not.toContain("Quality weights");
  });
});

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TeacherCoverageOverview } from "./teacher-coverage-overview";

describe("TeacherCoverageOverview", () => {
  it("summarizes assigned sessions and uncovered classes by subject", () => {
    const markup = renderToStaticMarkup(
      <TeacherCoverageOverview
        curriculum={[
          {
            id: "math-9",
            subjectId: "math",
            subjectName: "Mathematics",
            subjectCode: "MATH",
            className: "Grade 9-A",
            weeklySessions: 5,
            teacherId: "teacher-1",
          },
          {
            id: "math-10",
            subjectId: "math",
            subjectName: "Mathematics",
            subjectCode: "MATH",
            className: "Grade 10-A",
            weeklySessions: 5,
            teacherId: null,
          },
        ]}
      />,
    );

    expect(markup).toContain("Teacher coverage");
    expect(markup).toContain("5 / 10 sessions assigned");
    expect(markup).toContain("5 sessions remaining");
    expect(markup).toContain("Grade 10-A");
  });
});

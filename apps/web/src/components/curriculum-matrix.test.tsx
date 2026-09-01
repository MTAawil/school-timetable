import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CurriculumMatrix } from "./curriculum-matrix";

describe("CurriculumMatrix", () => {
  it("shows calculated teaching time and immediate hard-rule feedback", () => {
    const html = renderToStaticMarkup(
      <CurriculumMatrix
        classSections={[
          {
            id: "g7-a",
            name: "G7-A",
            shortCode: "G7-A",
            gradeCode: "G7",
          },
        ]}
        subjects={[{ id: "history", name: "History", shortCode: "HISTORY" }]}
        initialCells={[
          {
            classSectionId: "g7-a",
            subjectId: "history",
            weeklySessions: 6,
            isMainSubject: false,
            allowDoubleSession: false,
          },
        ]}
        workingDayCount={5}
        sessionsPerDay={8}
        sessionDurationMinutes={50}
        action={async () => undefined}
      />,
    );

    expect(html).toContain("5h");
    expect(html).toContain("G7-A");
    expect(html).toContain("Non-main subjects cannot occur twice in one day.");
    expect(html).toContain("disabled");
  });
});

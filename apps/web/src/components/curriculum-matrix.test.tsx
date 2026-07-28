import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CurriculumMatrix } from "./curriculum-matrix";

describe("CurriculumMatrix", () => {
  it("shows calculated teaching time and immediate hard-rule feedback", () => {
    const html = renderToStaticMarkup(
      <CurriculumMatrix
        grades={[{ id: "grade-7", code: "G7", name: "G7" }]}
        subjects={[{ id: "history", name: "History", shortCode: "HISTORY" }]}
        initialCells={[
          {
            gradeId: "grade-7",
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
    expect(html).toContain("Non-main subjects cannot occur twice in one day.");
    expect(html).toContain("disabled");
  });
});

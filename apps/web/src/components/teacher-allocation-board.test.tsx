import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TeacherAllocationBoard } from "./teacher-allocation-board";

describe("TeacherAllocationBoard", () => {
  it("shows uncovered curriculum and excessive teacher load", () => {
    const html = renderToStaticMarkup(
      <TeacherAllocationBoard
        teachers={[{ id: "rawan", name: "Rawan", weeklyTeachingSessions: 9 }]}
        initialAllocations={[
          {
            id: "math-a",
            className: "G7-A",
            classCode: "G7-A",
            subjectName: "Mathematics",
            subjectCode: "MATHEMATICS",
            weeklySessions: 10,
            teacherId: "rawan",
          },
          {
            id: "history-a",
            className: "G7-A",
            classCode: "G7-A",
            subjectName: "History",
            subjectCode: "HISTORY",
            weeklySessions: 2,
            teacherId: null,
          },
        ]}
        action={async () => undefined}
      />,
    );

    expect(html).toContain("Over allocated");
    expect(html).toContain("Uncovered");
    expect(html).toContain(">1<");
    expect(html).toContain("Unassigned");
  });
});

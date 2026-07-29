import { describe, expect, it } from "vitest";

import { getReadinessIssueAction } from "@/lib/readiness-navigation";

describe("getReadinessIssueAction", () => {
  it("opens the exact teacher for a workload blocker", () => {
    expect(
      getReadinessIssueAction(
        {
          code: "TEACHER_WORKLOAD_MISMATCH",
          entityIds: ["teacher-rawan"],
          suggestions: ["/teachers"],
        },
        [{ id: "teacher-rawan", name: "Rawan" }],
        {},
      ),
    ).toEqual({
      href: "/teachers?teacher=teacher-rawan#teacher-editor",
      label: "Edit Rawan",
    });
  });

  it("keeps the normal setup destination for other blockers", () => {
    expect(
      getReadinessIssueAction(
        {
          code: "CLASS_SUBJECT_UNASSIGNED",
          entityIds: ["class-1", "subject-1"],
          suggestions: ["/teachers"],
        },
        [],
        {},
      ),
    ).toEqual({
      href: "/teachers",
      label: "Review setup",
    });
  });
});

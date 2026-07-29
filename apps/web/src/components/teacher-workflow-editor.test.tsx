import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TeacherWorkflowEditor } from "@/components/teacher-workflow-editor";

describe("TeacherWorkflowEditor", () => {
  it("renders a complete new-teacher workflow", () => {
    const markup = renderToStaticMarkup(
      <TeacherWorkflowEditor
        action={async () => undefined}
        curriculum={[
          {
            id: "curriculum-art",
            subjectId: "subject-art",
            className: "G7-A",
            classCode: "G7-A",
            subjectName: "Art",
            subjectCode: "ART",
            weeklySessions: 1,
            teacherId: null,
            teacherName: null,
          },
        ]}
        days={[{ dayIndex: 0, name: "Monday" }]}
        periods={[{ periodIndex: 0, name: "Session 1", isTeaching: true }]}
        restrictions={[]}
      />,
    );

    expect(markup).toContain("1. Teacher details");
    expect(markup).toContain("2. Subjects and classes");
    expect(markup).toContain("3. Weekly restrictions");
    expect(markup).toContain("Add teacher");
    expect(markup).not.toContain('name="id"');
  });

  it("combines exact workload, subject filtering, and restrictions", () => {
    const markup = renderToStaticMarkup(
      <TeacherWorkflowEditor
        action={async () => undefined}
        curriculum={[
          {
            id: "curriculum-math",
            subjectId: "subject-math",
            className: "G7-A",
            classCode: "G7-A",
            subjectName: "Mathematics",
            subjectCode: "MATH",
            weeklySessions: 5,
            teacherId: "teacher-1",
            teacherName: "Rawan",
          },
          {
            id: "curriculum-english",
            subjectId: "subject-english",
            className: "G7-A",
            classCode: "G7-A",
            subjectName: "English",
            subjectCode: "ENG",
            weeklySessions: 4,
            teacherId: "teacher-2",
            teacherName: "Nour",
          },
          {
            id: "curriculum-science",
            subjectId: "subject-science",
            className: "G8-A",
            classCode: "G8-A",
            subjectName: "Science",
            subjectCode: "SCI",
            weeklySessions: 2,
            teacherId: "teacher-1",
            teacherName: "Rawan",
          },
        ]}
        days={[{ dayIndex: 0, name: "Monday" }]}
        periods={[
          { periodIndex: 0, name: "Session 1", isTeaching: true },
          { periodIndex: 1, name: "Break", isTeaching: false },
        ]}
        restrictions={[{ dayIndex: 0, periodIndex: 0, state: "UNAVAILABLE" }]}
        teacher={{
          id: "teacher-1",
          name: "Rawan",
          shortCode: "RW",
          employmentType: "FULL_TIME",
          weeklyTeachingSessions: 7,
          maxLessonsPerDay: null,
          maxConsecutiveLessons: null,
        }}
      />,
    );

    expect(markup).toContain("Declared and allocated sessions match.");
    expect(markup).toContain(
      'type="hidden" name="classCurriculumId" value="curriculum-math"',
    );
    expect(markup).toContain(
      'type="hidden" name="classCurriculumId" value="curriculum-science"',
    );
    expect(markup).not.toContain('value="curriculum-english"');
    expect(markup).not.toContain("Reassign from Nour");
    expect(markup).toContain('name="state:0:0"');
    expect(markup).toContain('value="UNAVAILABLE"');
    expect(markup).toContain("Monday, Session 1: Unavailable");
    expect(markup).not.toContain('name="state:0:1"');
  });
});

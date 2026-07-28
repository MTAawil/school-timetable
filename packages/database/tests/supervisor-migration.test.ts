import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../../../prisma/migrations/20260728120000_supervisor_domain/migration.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("supervisor domain migration", () => {
  it.each([
    "GradeLevel",
    "SchoolWeekConfiguration",
    "GradeCurriculum",
    "ClassCurriculum",
  ])("creates the normalized %s table", (table) => {
    expect(migration).toContain(`CREATE TABLE "${table}"`);
  });

  it("enforces exact ownership and grade curriculum uniqueness", () => {
    expect(migration).toContain(
      '"ClassCurriculum_schoolId_termId_classSectionId_subjectId_key"',
    );
    expect(migration).toContain(
      '"GradeCurriculum_schoolId_termId_gradeLevelId_subjectId_key"',
    );
  });

  it.each([
    "Teacher_weeklyTeachingSessions_check",
    "SchoolWeekConfiguration_values_check",
    "GradeCurriculum_values_check",
    "ClassCurriculum_values_check",
  ])("retains the %s database check", (constraint) => {
    expect(migration).toContain(`"${constraint}"`);
  });
});

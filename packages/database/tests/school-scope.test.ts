import { describe, expect, it } from "vitest";

import { requireSchoolAccess } from "../src/school-scope.js";

describe("school authorization boundary", () => {
  it("allows records from the authenticated school", () => {
    expect(() => {
      requireSchoolAccess(
        { schoolId: "school-a", userId: "admin-a" },
        "school-a",
      );
    }).not.toThrow();
  });

  it("rejects a different school with a stable code", () => {
    expect(() => {
      requireSchoolAccess(
        { schoolId: "school-a", userId: "admin-a" },
        "school-b",
      );
    }).toThrow("SCHOOL_ACCESS_DENIED");
  });
});

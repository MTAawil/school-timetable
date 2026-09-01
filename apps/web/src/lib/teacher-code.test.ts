import { describe, expect, it } from "vitest";

import { createTeacherCode } from "@/lib/teacher-code";

describe("createTeacherCode", () => {
  it("creates readable codes from names", () => {
    expect(createTeacherCode("Rawad", [])).toBe("RAWAD");
    expect(createTeacherCode("Ali Hsen", [])).toBe("AH");
  });

  it("adds a numeric suffix when a code already exists", () => {
    expect(createTeacherCode("Rawad", ["RAWAD", "RAWAD2"])).toBe("RAWAD3");
  });

  it("uses a stable fallback for names without ASCII characters", () => {
    expect(createTeacherCode("معلم", [])).toBe("TEACHER");
  });
});

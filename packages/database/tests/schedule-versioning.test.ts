import { describe, expect, it } from "vitest";

import {
  assertScheduleMutable,
  deriveDraftVersion,
} from "../src/domain/schedule-versioning.js";

const published = {
  id: "00000000-0000-4000-8000-000000000010",
  schoolId: "00000000-0000-4000-8000-000000000001",
  termId: "00000000-0000-4000-8000-000000000002",
  version: 3,
  status: "PUBLISHED" as const,
};

describe("schedule versioning", () => {
  it("prevents mutation of a published schedule", () => {
    expect(() => {
      assertScheduleMutable(published);
    }).toThrow("Only draft schedules can be modified");
  });

  it("creates a derived draft without changing the parent", () => {
    const draft = deriveDraftVersion(published, 4);

    expect(draft).toMatchObject({
      parentScheduleId: published.id,
      schoolId: published.schoolId,
      termId: published.termId,
      version: 4,
      status: "DRAFT",
    });
    expect(published.status).toBe("PUBLISHED");
  });

  it("requires monotonically increasing versions", () => {
    expect(() => {
      deriveDraftVersion(published, 3);
    }).toThrow("increase monotonically");
  });
});

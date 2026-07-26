import { describe, expect, it, vi } from "vitest";

import { readApplicationHealth } from "./health";

describe("readApplicationHealth", () => {
  it("reports a healthy database", async () => {
    const pingDatabase = vi.fn().mockResolvedValue(undefined);

    await expect(
      readApplicationHealth({ pingDatabase }),
    ).resolves.toMatchObject({
      status: "ok",
      dependencies: {
        database: "ok",
      },
    });
  });

  it("reports a degraded service without leaking the database error", async () => {
    const pingDatabase = vi
      .fn()
      .mockRejectedValue(new Error("sensitive connection details"));

    const health = await readApplicationHealth({ pingDatabase });

    expect(health.status).toBe("degraded");
    expect(health.dependencies.database).toBe("degraded");
    expect(JSON.stringify(health)).not.toContain("sensitive");
  });
});

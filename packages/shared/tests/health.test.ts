import { describe, expect, it } from "vitest";

import { healthResponseSchema } from "../src/index.js";

describe("healthResponseSchema", () => {
  it("accepts a healthy service response", () => {
    const response = {
      service: "solver",
      status: "ok",
      version: "0.1.0",
    };

    expect(healthResponseSchema.parse(response)).toEqual(response);
  });

  it("rejects an unknown service state", () => {
    expect(() =>
      healthResponseSchema.parse({
        service: "solver",
        status: "unknown",
        version: "0.1.0",
      }),
    ).toThrow();
  });
});

import { describe, expect, it } from "vitest";

import { rankBoundedRepairs } from "./targeted-repair";

describe("rankBoundedRepairs", () => {
  it("prefers fewer whole-school movements before quality score", () => {
    const ranked = rankBoundedRepairs([
      { id: "quality-first", movementPenalty: 4, totalPenalty: 1 },
      { id: "fewest", movementPenalty: 2, totalPenalty: 20 },
      { id: "same-moves-better", movementPenalty: 2, totalPenalty: 10 },
    ]);

    expect(ranked.map((item) => item.id)).toEqual([
      "same-moves-better",
      "fewest",
      "quality-first",
    ]);
  });

  it("excludes repairs moving more than five additional sessions", () => {
    const ranked = rankBoundedRepairs([
      { id: "allowed", movementPenalty: 6, totalPenalty: 10 },
      { id: "too-disruptive", movementPenalty: 7, totalPenalty: 1 },
    ]);

    expect(ranked.map((item) => item.id)).toEqual(["allowed"]);
  });
});

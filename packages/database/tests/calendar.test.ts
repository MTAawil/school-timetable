import { describe, expect, it } from "vitest";

import { buildCalendarSlots } from "../src/domain/calendar.js";

describe("buildCalendarSlots", () => {
  it("creates every physical slot and retains non-teaching breaks", () => {
    const slots = buildCalendarSlots(
      [
        { dayIndex: 0, isWorking: true },
        { dayIndex: 1, isWorking: true },
        { dayIndex: 2, isWorking: false },
      ],
      [
        { periodIndex: 0, isTeaching: true },
        { periodIndex: 1, isTeaching: false },
        { periodIndex: 2, isTeaching: true },
      ],
    );

    expect(slots).toHaveLength(6);
    expect(slots).toContainEqual({
      dayIndex: 0,
      periodIndex: 1,
      isTeaching: false,
    });
    expect(slots.some((slot) => slot.dayIndex === 2)).toBe(false);
  });

  it("rejects duplicate calendar indices", () => {
    expect(() =>
      buildCalendarSlots(
        [
          { dayIndex: 0, isWorking: true },
          { dayIndex: 0, isWorking: true },
        ],
        [{ periodIndex: 0, isTeaching: true }],
      ),
    ).toThrow("dayIndex values must be unique");
  });
});

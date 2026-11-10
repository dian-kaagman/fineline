import { describe, expect, it } from "vitest";
import {
  addWorkingDays,
  amsterdamDateOf,
  amsterdamYearOf,
  estimatedDeliveryDate,
  isCalendarDate,
} from "./working-days.js";

describe("estimated delivery date (BR-008)", () => {
  it("AC-018 an order on Friday 6 November 2026 with lead time 7 is due Tuesday 17 November", () => {
    expect(estimatedDeliveryDate(new Date("2026-11-06T13:00:00Z"), 7)).toBe("2026-11-17");
  });

  it("AC-047 an order at 11:00 on Saturday 7 November 2026 is due Tuesday 17 November", () => {
    expect(estimatedDeliveryDate(new Date("2026-11-07T10:00:00Z"), 7)).toBe("2026-11-17");
    // Sunday too: Monday 9 November is the first day counted.
    expect(addWorkingDays("2026-11-08", 7)).toBe("2026-11-17");
  });

  it("AC-048 uses the Amsterdam date: 23:30 UTC on Thursday 5 November is Friday 6 November", () => {
    const placedAt = new Date("2026-11-05T23:30:00Z");
    expect(amsterdamDateOf(placedAt)).toBe("2026-11-06");
    expect(estimatedDeliveryDate(placedAt, 7)).toBe("2026-11-17");
    expect(estimatedDeliveryDate(placedAt, 7)).not.toBe("2026-11-16");
  });

  it("AC-049 counts public holidays as working days: Friday 18 December 2026 -> Tuesday 29 December", () => {
    expect(addWorkingDays("2026-12-18", 7)).toBe("2026-12-29");
  });

  it("AC-045 a lead time of 10 from Monday 9 November 2026 gives Monday 23 November", () => {
    expect(addWorkingDays("2026-11-09", 10)).toBe("2026-11-23");
  });

  it("handles summer time and the year boundary", () => {
    expect(amsterdamDateOf(new Date("2026-07-01T22:30:00Z"))).toBe("2026-07-02"); // UTC+2
    expect(amsterdamYearOf(new Date("2026-12-31T23:30:00Z"))).toBe(2027);
    expect(addWorkingDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("refuses lead times that are not positive whole numbers", () => {
    expect(() => addWorkingDays("2026-11-06", 0)).toThrow(RangeError);
    expect(() => addWorkingDays("2026-11-06", 2.5)).toThrow(RangeError);
  });

  it("recognises real calendar dates only", () => {
    expect(isCalendarDate("2026-11-20")).toBe(true);
    expect(isCalendarDate("2026-02-30")).toBe(false);
    expect(isCalendarDate("20-11-2026")).toBe(false);
    expect(isCalendarDate("2026-11-20T00:00:00Z")).toBe(false);
  });
});

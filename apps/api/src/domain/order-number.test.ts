import { describe, expect, it } from "vitest";
import { formatOrderNumber, isOrderNumber } from "./order-number.js";
import { amsterdamYearOf } from "./working-days.js";

describe("order numbers (BR-007)", () => {
  it("AC-018 the 42nd order of 2026 is FL-2026-0042", () => {
    expect(formatOrderNumber(2026, 42)).toBe("FL-2026-0042");
  });

  it("AC-019 the first order of 2027 (00:30 Amsterdam on 1 January) is FL-2027-0001", () => {
    const placedAt = new Date("2026-12-31T23:30:00Z");
    expect(formatOrderNumber(amsterdamYearOf(placedAt), 1)).toBe("FL-2027-0001");
  });

  it("keeps counting with more digits after 9999 (Q-19)", () => {
    expect(formatOrderNumber(2026, 10_000)).toBe("FL-2026-10000");
    expect(isOrderNumber("FL-2026-10000")).toBe(true);
  });

  it("matches only the order number pattern", () => {
    expect(isOrderNumber("FL-2026-0042")).toBe(true);
    expect(isOrderNumber('FL-2026-0042"; x="')).toBe(false);
    expect(isOrderNumber("FL-26-0042")).toBe(false);
    expect(() => formatOrderNumber(2026, 0)).toThrow(RangeError);
  });
});

import { describe, expect, it } from "vitest";
import {
  formatDateLong,
  formatDateShort,
  formatExpiry,
  formatLength,
  formatPrice,
  formatSize,
  formatStrokeCount,
  formatWait,
} from "./format";

describe("formatting (UX-014)", () => {
  it("runs in a time zone west of UTC, so a date shift would show", () => {
    expect(new Date(Date.UTC(2026, 10, 17)).getTimezoneOffset()).toBeGreaterThan(0);
  });

  it("formats cents as euros: 4995 -> €49.95", () => {
    expect(formatPrice(4995)).toBe("€49.95");
    expect(formatPrice(5495)).toBe("€54.95");
    expect(formatPrice(100000)).toBe("€1,000.00");
  });

  it("formats a YYYY-MM-DD delivery date without a time-zone shift (AC-018)", () => {
    expect(formatDateLong("2026-11-17")).toBe("Tuesday 17 November 2026");
    expect(formatDateLong("2026-11-06")).toBe("Friday 6 November 2026");
    expect(formatDateLong("2026-01-01")).toBe("Thursday 1 January 2026");
  });

  it("formats short dates for the admin list", () => {
    expect(formatDateShort("2026-11-17")).toBe("Tue 17 Nov 2026");
    expect(formatDateShort("2026-11-06")).toBe("Fri 6 Nov 2026");
  });

  it("rejects anything that is not a calendar date", () => {
    expect(() => formatDateLong("2026-11-17T00:00:00Z")).toThrow(RangeError);
  });

  it("UX-025 shows the preview expiry in Europe/Amsterdam", () => {
    expect(formatExpiry("2026-11-04T09:00:00Z")).toEqual({
      time: "10:00",
      date: "Wednesday 4 November",
    });
  });

  it("formats sizes, line length and stroke counts", () => {
    expect(formatSize(210, 297)).toBe("210 x 297 mm");
    expect(formatLength(14250.5)).toBe("14.3 m");
    expect(formatStrokeCount(812)).toBe("812 strokes");
    expect(formatStrokeCount(1)).toBe("1 stroke");
    expect(formatStrokeCount(1500)).toBe("1,500 strokes");
  });

  it("rounds Retry-After up to whole minutes", () => {
    expect(formatWait(900)).toBe("15 minutes");
    expect(formatWait(90)).toBe("2 minutes");
    expect(formatWait(30)).toBe("1 minute");
    expect(formatWait(600)).toBe("10 minutes");
    expect(formatWait(undefined)).toBe("a few minutes");
  });
});

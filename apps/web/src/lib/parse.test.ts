import { describe, expect, it } from "vitest";
import { centsToEuroInput, parsePriceCents, parseWholeNumber } from "./parse";

describe("UX-031 forgiving number and money fields", () => {
  it.each([
    ["49.95", 4995],
    ["49,95", 4995],
    ["€ 49.95", 4995],
    ["€49,95", 4995],
    [" 49 ", 4900],
    ["49.5", 4950],
    ["0.01", 1],
  ])("accepts the price %j as %i cents", (input, cents) => {
    expect(parsePriceCents(input)).toBe(cents);
  });

  it.each(["", "0", "0.00", "-5", "49.955", "abc", "49.95.1", "1,000.00"])(
    "rejects the price %j",
    (input) => {
      expect(parsePriceCents(input)).toBeNull();
    },
  );

  it("accepts whole numbers with surrounding spaces within the range", () => {
    expect(parseWholeNumber(" 10 ", 1, 60)).toBe(10);
    expect(parseWholeNumber("0", 0, 10)).toBe(0);
  });

  it.each(["2.5", "0", "61", "", "ten", "1e2"])("AC-046 rejects the lead time %j", (input) => {
    expect(parseWholeNumber(input, 1, 60)).toBeNull();
  });

  it("shows cents as an editable euro amount", () => {
    expect(centsToEuroInput(4995)).toBe("49.95");
    expect(centsToEuroInput(5000)).toBe("50.00");
  });
});

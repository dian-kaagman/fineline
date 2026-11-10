// Forgiving parsers for admin number and money fields (UX-031). They return null for input
// that must be rejected; the caller shows the field's own message.

/** "49.95", "49,95", "€ 49.95", "€49" -> cents; zero, negatives and more than two decimals -> null. */
export function parsePriceCents(input: string): number | null {
  const cleaned = input.trim().replace(/^€\s*/, "").replace(/\s*€$/, "");
  const match = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(cleaned);
  if (!match) return null;
  const [, euros = "", fraction = ""] = match;
  const cents = Number(euros) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents <= 0) return null;
  return cents;
}

/** A whole number within [min, max], allowing surrounding spaces; decimals and other text -> null. */
export function parseWholeNumber(input: string, min: number, max: number): number | null {
  const cleaned = input.trim();
  if (!/^-?\d+$/.test(cleaned)) return null;
  const value = Number(cleaned);
  if (!Number.isSafeInteger(value) || value < min || value > max) return null;
  return value;
}

/** Cents as the editable euro text of a price field: 4995 -> "49.95". */
export function centsToEuroInput(priceCents: number): string {
  return (priceCents / 100).toFixed(2);
}

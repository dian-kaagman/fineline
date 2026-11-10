/** Order numbers `FL-<year>-<4+ digits>` counting from 0001 per Amsterdam year (BR-007, Q-19, Q-20). */

export const ORDER_NUMBER_PATTERN = /^FL-\d{4}-\d{4,}$/;

export function formatOrderNumber(year: number, sequence: number): string {
  if (!Number.isInteger(year) || year < 1000 || year > 9999) throw new RangeError("bad year");
  if (!Number.isInteger(sequence) || sequence < 1) throw new RangeError("bad sequence");
  return `FL-${year}-${String(sequence).padStart(4, "0")}`;
}

export function isOrderNumber(value: string): boolean {
  return ORDER_NUMBER_PATTERN.test(value);
}

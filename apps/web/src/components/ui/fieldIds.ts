// Ids that tie a field to its hint and error (UX-005, UX-006).
export function errorId(fieldId: string): string {
  return `${fieldId}-error`;
}

export function hintId(fieldId: string): string {
  return `${fieldId}-hint`;
}

/** Error first, then hint, as UX-006 asks. */
export function describedBy(
  fieldId: string,
  hasError: boolean,
  hasHint: boolean,
): string | undefined {
  const ids = [hasError ? errorId(fieldId) : "", hasHint ? hintId(fieldId) : ""].filter(Boolean);
  return ids.length ? ids.join(" ") : undefined;
}

/** Retention and expiry rules (BR-010, BR-011, SR-012, SR-022). Pure functions with "now" passed in. */

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/** An unordered drawing (photo + preview) can be ordered for 24 hours and is then deleted. */
export const PREVIEW_LIFETIME_MS = 24 * HOUR_MS;
/** The original photo of an order is deleted 30 days after the order is shipped or cancelled. */
export const ORDER_PHOTO_RETENTION_MS = 30 * DAY_MS;
/** Files no row references are deleted once older than this (crash leftovers). */
export const ORPHAN_MIN_AGE_MS = 24 * HOUR_MS;
/** An admin session ends 24 hours after login, even when in use. */
export const SESSION_ABSOLUTE_LIFETIME_MS = 24 * HOUR_MS;

export function previewExpiresAt(createdAt: Date): Date {
  return new Date(createdAt.getTime() + PREVIEW_LIFETIME_MS);
}

export function isPreviewExpired(expiresAt: Date, now: Date): boolean {
  return now.getTime() >= expiresAt.getTime();
}

/** Orders closed at or before this instant have their original photo deleted. */
export function orderPhotoCutoff(now: Date): Date {
  return new Date(now.getTime() - ORDER_PHOTO_RETENTION_MS);
}

export interface StoredFileInfo {
  key: string;
  modifiedAt: Date;
}

/** Files that no database row references and that are old enough to be leftovers. */
export function selectOrphanFiles(
  files: readonly StoredFileInfo[],
  referencedKeys: ReadonlySet<string>,
  now: Date,
): string[] {
  return files
    .filter((f) => !referencedKeys.has(f.key))
    .filter((f) => now.getTime() - f.modifiedAt.getTime() >= ORPHAN_MIN_AGE_MS)
    .map((f) => f.key);
}

export interface SessionTimes {
  createdAt: Date;
  lastSeenAt: Date;
}

/** A session ends after `idleHours` without use and 24 hours after login. */
export function isSessionExpired(session: SessionTimes, now: Date, idleHours: number): boolean {
  const idleLimit = session.lastSeenAt.getTime() + idleHours * HOUR_MS;
  const absoluteLimit = session.createdAt.getTime() + SESSION_ABSOLUTE_LIFETIME_MS;
  return now.getTime() >= idleLimit || now.getTime() >= absoluteLimit;
}

/** Cutoffs used to delete expired sessions in bulk. */
export function sessionCutoffs(
  now: Date,
  idleHours: number,
): { idleBefore: Date; createdBefore: Date } {
  return {
    idleBefore: new Date(now.getTime() - idleHours * HOUR_MS),
    createdBefore: new Date(now.getTime() - SESSION_ABSOLUTE_LIFETIME_MS),
  };
}

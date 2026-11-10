import { and, eq, lte, sql } from "drizzle-orm";
import type { Executor } from "../../db/client.js";
import { drawings, orders } from "../../db/schema.js";

export type DrawingRow = typeof drawings.$inferSelect;
export type NewDrawingRow = typeof drawings.$inferInsert;

export async function insertDrawing(db: Executor, row: NewDrawingRow): Promise<void> {
  await db.insert(drawings).values(row);
}

/** Locks the row for the rest of the transaction (concurrent orders of one drawing queue up). */
export async function findDrawingForUpdate(
  db: Executor,
  id: string,
): Promise<DrawingRow | undefined> {
  const rows = await db.select().from(drawings).where(eq(drawings.id, id)).for("update");
  return rows[0];
}

const notOrdered = sql`not exists (select 1 from ${orders} where ${orders.drawingId} = ${drawings.id})`;

/** IDs of drawings never ordered whose preview expired (BR-010). */
export async function listExpiredUnorderedDrawingIds(db: Executor, now: Date): Promise<string[]> {
  const rows = await db
    .select({ id: drawings.id })
    .from(drawings)
    .where(and(lte(drawings.expiresAt, now), notOrdered));
  return rows.map((r) => r.id);
}

/**
 * Locks one expired, unordered drawing for deletion. Careful: when this waited for the lock held by
 * an order being placed, PostgreSQL re-checks the row but evaluates the `not exists` subquery with
 * the statement's old snapshot, so the row can come back although it was just ordered. Callers must
 * re-check with `isDrawingOrdered` (a new statement) after taking the lock.
 */
export async function lockExpiredUnorderedDrawing(
  db: Executor,
  id: string,
  now: Date,
): Promise<DrawingRow | undefined> {
  const rows = await db
    .select()
    .from(drawings)
    .where(and(eq(drawings.id, id), lte(drawings.expiresAt, now), notOrdered))
    .for("update");
  return rows[0];
}

/** A fresh statement, so it sees orders committed while we waited for the row lock. */
export async function isDrawingOrdered(db: Executor, id: string): Promise<boolean> {
  const rows = await db.select({ id: orders.id }).from(orders).where(eq(orders.drawingId, id));
  return rows.length > 0;
}

export async function deleteDrawing(db: Executor, id: string): Promise<void> {
  await db.delete(drawings).where(eq(drawings.id, id));
}

export async function markPhotoDeleted(db: Executor, id: string, now: Date): Promise<void> {
  await db.update(drawings).set({ photoDeletedAt: now }).where(eq(drawings.id, id));
}

/** Every storage key a drawing row references (for the orphan sweep). */
export async function listDrawingFileKeys(db: Executor): Promise<string[]> {
  const rows = await db
    .select({ photoKey: drawings.photoKey, svgKey: drawings.svgKey })
    .from(drawings);
  return rows.flatMap((r) => [r.photoKey, r.svgKey]);
}

export async function findDrawing(db: Executor, id: string): Promise<DrawingRow | undefined> {
  const rows = await db.select().from(drawings).where(eq(drawings.id, id));
  return rows[0];
}

/** Marks the photo and drawing files of an erased order as deleted (keeps earlier timestamps). */
export async function markFilesErased(db: Executor, id: string, now: Date): Promise<void> {
  await db
    .update(drawings)
    .set({
      photoDeletedAt: sql`coalesce(${drawings.photoDeletedAt}, ${now})`,
      svgDeletedAt: sql`coalesce(${drawings.svgDeletedAt}, ${now})`,
    })
    .where(eq(drawings.id, id));
}

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
 * Locks one expired, unordered drawing for deletion. An order being placed for it at the same
 * moment holds the same row lock, so it either commits first (and this returns undefined) or finds
 * the drawing gone.
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

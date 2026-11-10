import { and, asc, eq, gt, sql } from "drizzle-orm";
import type { Executor } from "../../db/client.js";
import { frames } from "../../db/schema.js";

export type FrameRow = typeof frames.$inferSelect;
export type NewFrameRow = typeof frames.$inferInsert;

export async function listFramesInStock(db: Executor): Promise<FrameRow[]> {
  return db
    .select()
    .from(frames)
    .where(gt(frames.stock, 0))
    .orderBy(asc(frames.priceCents), asc(frames.name));
}

export async function listAllFrames(db: Executor): Promise<FrameRow[]> {
  return db.select().from(frames).orderBy(asc(frames.name), asc(frames.createdAt));
}

export async function findFrame(db: Executor, id: string): Promise<FrameRow | undefined> {
  const rows = await db.select().from(frames).where(eq(frames.id, id));
  return rows[0];
}

export async function insertFrame(db: Executor, row: NewFrameRow): Promise<FrameRow> {
  const rows = await db.insert(frames).values(row).returning();
  return rows[0] as FrameRow;
}

export async function updateFrame(
  db: Executor,
  id: string,
  patch: Partial<
    Pick<FrameRow, "name" | "widthMm" | "heightMm" | "priceCents" | "photoKey" | "photoContentType">
  >,
  now: Date,
): Promise<FrameRow | undefined> {
  const rows = await db
    .update(frames)
    .set({ ...patch, updatedAt: now })
    .where(eq(frames.id, id))
    .returning();
  return rows[0];
}

/**
 * Atomic signed stock change that never goes below zero (BR-006) nor above `maxStock`. Undefined
 * when refused or unknown.
 */
export async function adjustFrameStock(
  db: Executor,
  id: string,
  delta: number,
  maxStock: number,
  now: Date,
): Promise<FrameRow | undefined> {
  const rows = await db
    .update(frames)
    .set({ stock: sql`${frames.stock} + ${delta}`, updatedAt: now })
    .where(and(eq(frames.id, id), sql`${frames.stock} + ${delta} between 0 and ${maxStock}`))
    .returning();
  return rows[0];
}

/**
 * Takes one frame from stock: `UPDATE frames SET stock = stock - 1 WHERE id = $1 AND stock > 0`.
 * Two concurrent orders for the last frame can't both succeed (BR-006, AC-020).
 */
export async function takeOneFromStock(
  db: Executor,
  id: string,
  now: Date,
): Promise<FrameRow | undefined> {
  const rows = await db
    .update(frames)
    .set({ stock: sql`${frames.stock} - 1`, updatedAt: now })
    .where(and(eq(frames.id, id), gt(frames.stock, 0)))
    .returning();
  return rows[0];
}

export async function returnOneToStock(db: Executor, id: string, now: Date): Promise<void> {
  await db
    .update(frames)
    .set({ stock: sql`${frames.stock} + 1`, updatedAt: now })
    .where(eq(frames.id, id));
}

export async function listFramePhotoKeys(db: Executor): Promise<string[]> {
  const rows = await db.select({ key: frames.photoKey }).from(frames);
  return rows.map((r) => r.key);
}

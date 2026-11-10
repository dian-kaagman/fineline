import { eq, lte, or } from "drizzle-orm";
import type { Executor } from "../../db/client.js";
import { adminSessions } from "../../db/schema.js";

export type SessionRow = typeof adminSessions.$inferSelect;

export async function insertSession(db: Executor, row: SessionRow): Promise<void> {
  await db.insert(adminSessions).values(row);
}

export async function findSession(db: Executor, idHash: string): Promise<SessionRow | undefined> {
  const rows = await db.select().from(adminSessions).where(eq(adminSessions.idHash, idHash));
  return rows[0];
}

export async function touchSession(db: Executor, idHash: string, now: Date): Promise<void> {
  await db.update(adminSessions).set({ lastSeenAt: now }).where(eq(adminSessions.idHash, idHash));
}

export async function deleteSession(db: Executor, idHash: string): Promise<void> {
  await db.delete(adminSessions).where(eq(adminSessions.idHash, idHash));
}

/** Deletes sessions idle since `idleBefore` or created before `createdBefore`; returns the count. */
export async function deleteExpiredSessions(
  db: Executor,
  idleBefore: Date,
  createdBefore: Date,
): Promise<number> {
  const rows = await db
    .delete(adminSessions)
    .where(
      or(lte(adminSessions.lastSeenAt, idleBefore), lte(adminSessions.createdAt, createdBefore)),
    )
    .returning({ idHash: adminSessions.idHash });
  return rows.length;
}

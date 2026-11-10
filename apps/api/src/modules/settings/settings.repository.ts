import { eq } from "drizzle-orm";
import type { Executor } from "../../db/client.js";
import { settings } from "../../db/schema.js";

const SETTINGS_ID = 1;

export async function getLeadTimeWorkingDays(db: Executor): Promise<number> {
  const rows = await db.select().from(settings).where(eq(settings.id, SETTINGS_ID));
  const row = rows[0];
  if (!row) throw new Error("settings row missing; run the migrations");
  return row.leadTimeWorkingDays;
}

export async function setLeadTimeWorkingDays(
  db: Executor,
  value: number,
  now: Date,
): Promise<void> {
  await db
    .update(settings)
    .set({ leadTimeWorkingDays: value, updatedAt: now })
    .where(eq(settings.id, SETTINGS_ID));
}

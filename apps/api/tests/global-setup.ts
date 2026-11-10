import { sql } from "drizzle-orm";
import { createDatabase, runMigrations } from "../src/db/client.js";

/** Recreates the dedicated test database schema and applies the migrations once per run. */
export default async function setup(): Promise<void> {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error("TEST_DATABASE_URL is not set: copy .env.example to .env or export it");
  }
  // Guard against wiping a real database by mistake.
  if (!new URL(url).pathname.includes("test")) {
    throw new Error("TEST_DATABASE_URL must name a database whose name contains 'test'");
  }
  const { db, pool } = createDatabase(url);
  try {
    await db.execute(sql`drop schema if exists drizzle cascade`);
    await db.execute(sql`drop schema if exists public cascade`);
    await db.execute(sql`create schema public`);
    await runMigrations(db);
  } finally {
    await pool.end();
  }
}

/** Applies the SQL migrations to DATABASE_URL. Needs only DATABASE_URL, not the full app config. */
import { databaseUrlProblem } from "../config.js";
import { createDatabase, runMigrations } from "../db/client.js";

const url = process.env.DATABASE_URL ?? "";
const problem = databaseUrlProblem(url);
if (problem) {
  console.error(`DATABASE_URL ${problem}`);
  process.exit(1);
}

const { db, pool } = createDatabase(url);
try {
  await runMigrations(db);
  console.log("Migrations applied");
} catch (err) {
  // Only the error code: pg messages can contain values.
  const code =
    (err as { code?: string }).code ?? (err as { cause?: { code?: string } }).cause?.code;
  console.error(`Migration failed${code ? ` (code ${code})` : ""}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}

import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { fileURLToPath } from "node:url";
import pg from "pg";
import * as schema from "./schema.js";

export type Database = NodePgDatabase<typeof schema>;
/** A database handle or an open transaction: repositories accept either. */
export type Executor = Database | Parameters<Parameters<Database["transaction"]>[0]>[0];

export interface DatabaseConnection {
  db: Database;
  pool: pg.Pool;
}

export function createDatabase(
  connectionString: string,
  onIdleError: (error: Error) => void = () => undefined,
): DatabaseConnection {
  const pool = new pg.Pool({ connectionString, max: 10 });
  // An idle client error must not crash the process; the next query reports it to the caller.
  pool.on("error", onIdleError);
  return { pool, db: drizzle(pool, { schema }) };
}

export const MIGRATIONS_FOLDER = fileURLToPath(new URL("./migrations", import.meta.url));

export async function runMigrations(db: Database): Promise<void> {
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
}

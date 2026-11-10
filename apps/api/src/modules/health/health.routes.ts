import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { Database } from "../../db/client.js";
import { AppError } from "../../lib/errors.js";

export function healthRoutes(db: Database) {
  return async function (app: FastifyInstance) {
    app.get("/api/v1/health", async () => {
      try {
        await db.execute(sql`select 1`);
      } catch {
        throw new AppError(503, "unavailable", "The service is not ready.");
      }
      return { status: "ok" as const };
    });
  };
}

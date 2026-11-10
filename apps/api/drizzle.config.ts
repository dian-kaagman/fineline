import { defineConfig } from "drizzle-kit";

// Only `generate` is used (offline); migrations are applied by `npm run db:migrate`.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  casing: "snake_case",
});

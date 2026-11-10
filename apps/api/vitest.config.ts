import { existsSync } from "node:fs";
import { defineConfig } from "vitest/config";

// Local runs read TEST_DATABASE_URL from .env; CI sets it in the environment.
if (!process.env.TEST_DATABASE_URL && existsSync(".env")) process.loadEnvFile(".env");

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    globalSetup: ["tests/global-setup.ts"],
    // HTTP tests share one test database and reset it between tests (AC-020 must not be flaky).
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});

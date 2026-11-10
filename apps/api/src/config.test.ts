import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig, WORKER_TOKEN_PLACEHOLDER } from "./config.js";

// A syntactically valid hash (not of any real password); parsing does not run scrypt.
const HASH = `scrypt:17:8:1:${Buffer.alloc(16, 1).toString("base64url")}:${Buffer.alloc(32, 2).toString("base64url")}`;

const valid = {
  DATABASE_URL: "postgres://user:pass@localhost:5432/fineline",
  STORAGE_DIR: "./storage",
  WORKER_URL: "http://localhost:8000",
  WORKER_TOKEN: "a".repeat(32),
  ADMIN_USERNAME: "owner",
  ADMIN_PASSWORD_HASH: HASH,
};

function problems(env: Record<string, string>): string[] {
  try {
    loadConfig(env);
    return [];
  } catch (err) {
    if (err instanceof ConfigError) return err.problems;
    throw err;
  }
}

describe("environment validation (SR-020)", () => {
  it("applies the documented defaults", () => {
    const config = loadConfig(valid);
    expect(config).toMatchObject({
      port: 3000,
      worker: { timeoutMs: 30_000, maxConcurrent: 2 },
      sessionIdleHours: 8,
      cookieSecure: true,
      corsOrigin: undefined,
      trustProxy: false,
      drawingArea: { widthMm: 180, heightMm: 267 },
      strokeBudget: { maxStrokes: 1500, maxTotalLengthMm: 25_000 },
      retentionSweepIntervalMs: 3_600_000,
      logLevel: "info",
    });
  });

  it("fails naming every missing variable", () => {
    const found = problems({});
    for (const name of [
      "DATABASE_URL",
      "STORAGE_DIR",
      "WORKER_URL",
      "WORKER_TOKEN",
      "ADMIN_USERNAME",
      "ADMIN_PASSWORD_HASH",
    ]) {
      expect(found.some((p) => p.startsWith(name))).toBe(true);
    }
  });

  it("refuses the .env.example placeholders and short tokens, without echoing the value", () => {
    expect(problems({ ...valid, WORKER_TOKEN: WORKER_TOKEN_PLACEHOLDER })[0]).toMatch(
      /^WORKER_TOKEN /,
    );
    expect(
      problems({ ...valid, WORKER_TOKEN: `${WORKER_TOKEN_PLACEHOLDER}xxxx` })[0],
    ).toBeUndefined();
    const short = problems({ ...valid, WORKER_TOKEN: "short-secret" });
    expect(short[0]).toMatch(/^WORKER_TOKEN must be at least 32 characters/);
    expect(short.join()).not.toContain("short-secret");
    expect(problems({ ...valid, ADMIN_PASSWORD_HASH: "run-npm-run-hash-password" })[0]).toMatch(
      /^ADMIN_PASSWORD_HASH /,
    );
  });

  it("refuses weak or malformed password hashes", () => {
    expect(
      problems({ ...valid, ADMIN_PASSWORD_HASH: HASH.replace("scrypt:17", "scrypt:14") }),
    ).toHaveLength(1);
    expect(problems({ ...valid, ADMIN_PASSWORD_HASH: HASH.replaceAll(":", "$") })).toHaveLength(1);
    expect(problems({ ...valid, ADMIN_PASSWORD_HASH: `${HASH}x!` })).toHaveLength(1);
  });

  it("refuses CORS_ORIGIN=* and accepts one exact origin", () => {
    expect(problems({ ...valid, CORS_ORIGIN: "*" })[0]).toMatch(/^CORS_ORIGIN/);
    expect(problems({ ...valid, CORS_ORIGIN: "http://localhost:5173/app" })[0]).toMatch(
      /^CORS_ORIGIN/,
    );
    expect(loadConfig({ ...valid, CORS_ORIGIN: "http://localhost:5173" }).corsOrigin).toBe(
      "http://localhost:5173",
    );
  });

  it("parses TRUST_PROXY as off, a hop count or proxy addresses, and refuses true", () => {
    expect(loadConfig({ ...valid, TRUST_PROXY: "1" }).trustProxy).toBe(1);
    expect(loadConfig({ ...valid, TRUST_PROXY: "172.18.0.0/16" }).trustProxy).toEqual([
      "172.18.0.0/16",
    ]);
    expect(problems({ ...valid, TRUST_PROXY: "true" })[0]).toMatch(/^TRUST_PROXY/);
  });

  it("parses booleans and numbers strictly", () => {
    expect(loadConfig({ ...valid, COOKIE_SECURE: "false" }).cookieSecure).toBe(false);
    expect(problems({ ...valid, COOKIE_SECURE: "no" })[0]).toMatch(/^COOKIE_SECURE/);
    expect(problems({ ...valid, PORT: "abc" })[0]).toMatch(/^PORT/);
    expect(loadConfig({ ...valid, DRAWING_AREA_WIDTH_MM: "190.5" }).drawingArea.widthMm).toBe(
      190.5,
    );
  });
});

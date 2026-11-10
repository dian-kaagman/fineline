import { isIP } from "node:net";
import { z } from "zod";
import { parsePasswordHash, type ParsedPasswordHash } from "./lib/password-hash.js";

/** Placeholders used in `.env.example`; they must never pass validation (SR-020). */
export const WORKER_TOKEN_PLACEHOLDER = "replace-with-32+-random-chars";

const int = (min: number, max: number) =>
  z
    .string()
    .regex(/^\d+$/, "must be a whole number")
    .transform(Number)
    .pipe(z.number().int().min(min).max(max));

const positiveNumber = z
  .string()
  .regex(/^\d+(\.\d+)?$/, "must be a positive number")
  .transform(Number)
  .pipe(z.number().positive());

const bool = z
  .enum(["true", "false"], { message: "must be true or false" })
  .transform((v) => v === "true");

const trustProxy = z.string().transform((value, ctx): boolean | number | string[] => {
  if (value === "false") return false;
  if (/^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 10) return Number(value);
  const entries = value.split(",").map((s) => s.trim());
  const valid = entries.every((e) => {
    const [addr, bits] = e.split("/");
    return addr !== undefined && isIP(addr) !== 0 && (bits === undefined || /^\d{1,3}$/.test(bits));
  });
  if (value !== "" && valid) return entries;
  ctx.addIssue({
    code: "custom",
    message:
      "must be false, a hop count (1 behind nginx) or a list of proxy IP addresses; `true` is refused",
  });
  return z.NEVER;
});

const corsOrigin = z
  .string()
  .refine((v) => v !== "*", "`*` is refused; give one exact origin")
  .refine((v) => {
    try {
      const url = new URL(v);
      return (url.protocol === "http:" || url.protocol === "https:") && url.origin === v;
    } catch {
      return false;
    }
  }, "must be one exact origin such as http://localhost:5173");

/**
 * Why a DATABASE_URL is unusable, or null. A password still at a `replace-with...` placeholder (the
 * root .env.example's POSTGRES_PASSWORD) is refused like the other secrets (SR-020).
 */
export function databaseUrlProblem(value: string): string | null {
  if (!/^postgres(ql)?:\/\//.test(value)) return "must be a postgres:// connection URL";
  let password: string;
  try {
    password = decodeURIComponent(new URL(value).password);
  } catch {
    return "must be a postgres:// connection URL";
  }
  if (/^replace-with/i.test(password)) return "still has the .env.example placeholder password";
  return null;
}

const envSchema = z.object({
  DATABASE_URL: z.string().superRefine((value, ctx) => {
    const problem = databaseUrlProblem(value);
    if (problem) ctx.addIssue({ code: "custom", message: problem });
  }),
  PORT: int(1, 65535).default(3000),
  STORAGE_DIR: z.string().min(1, "must be a directory path"),
  WORKER_URL: z.url({ protocol: /^https?$/, message: "must be an http(s) URL" }),
  WORKER_TOKEN: z
    .string()
    .min(32, "must be at least 32 characters")
    .refine((v) => v !== WORKER_TOKEN_PLACEHOLDER, "is still the .env.example placeholder"),
  WORKER_TIMEOUT_MS: int(1000, 300_000).default(30_000),
  MAX_CONCURRENT_CONVERSIONS: int(1, 16).default(2),
  ADMIN_USERNAME: z.string().min(1, "must not be empty").max(200),
  ADMIN_PASSWORD_HASH: z.string().transform((value, ctx): ParsedPasswordHash => {
    const parsed = parsePasswordHash(value);
    if (!parsed) {
      ctx.addIssue({
        code: "custom",
        message: "is not a valid hash; generate one with `npm run hash-password`",
      });
      return z.NEVER;
    }
    return parsed;
  }),
  SESSION_TTL_HOURS: int(1, 24).default(8),
  COOKIE_SECURE: bool.default(true),
  CORS_ORIGIN: corsOrigin.optional(),
  TRUST_PROXY: trustProxy.default(false),
  DRAWING_AREA_WIDTH_MM: positiveNumber.default(180),
  DRAWING_AREA_HEIGHT_MM: positiveNumber.default(267),
  MAX_STROKES: int(1, 100_000).default(1500),
  MAX_TOTAL_STROKE_LENGTH_MM: positiveNumber.default(25_000),
  RETENTION_SWEEP_INTERVAL_MS: int(60_000, 7 * 24 * 3_600_000).default(3_600_000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
});

export interface Config {
  databaseUrl: string;
  port: number;
  storageDir: string;
  worker: { url: string; token: string; timeoutMs: number; maxConcurrent: number };
  admin: { username: string; passwordHash: ParsedPasswordHash };
  sessionIdleHours: number;
  cookieSecure: boolean;
  corsOrigin: string | undefined;
  trustProxy: boolean | number | string[];
  drawingArea: { widthMm: number; heightMm: number };
  strokeBudget: { maxStrokes: number; maxTotalLengthMm: number };
  retentionSweepIntervalMs: number;
  logLevel: string;
}

export class ConfigError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Invalid environment:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
    this.name = "ConfigError";
  }
}

/** Parse the environment once at startup; throws a ConfigError naming every bad variable. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  // Empty strings count as unset, so `FOO=` in a .env file falls back to the default.
  const cleaned = Object.fromEntries(
    Object.entries(env).filter(([, v]) => v !== undefined && v !== ""),
  );
  const result = envSchema.safeParse(cleaned);
  if (!result.success) {
    // Messages name the variable and the rule, never the value (it may be a secret).
    throw new ConfigError(
      result.error.issues.map((i) => `${i.path.join(".") || "environment"} ${i.message}`),
    );
  }
  const e = result.data;
  return {
    databaseUrl: e.DATABASE_URL,
    port: e.PORT,
    storageDir: e.STORAGE_DIR,
    worker: {
      url: e.WORKER_URL,
      token: e.WORKER_TOKEN,
      timeoutMs: e.WORKER_TIMEOUT_MS,
      maxConcurrent: e.MAX_CONCURRENT_CONVERSIONS,
    },
    admin: { username: e.ADMIN_USERNAME, passwordHash: e.ADMIN_PASSWORD_HASH },
    sessionIdleHours: e.SESSION_TTL_HOURS,
    cookieSecure: e.COOKIE_SECURE,
    corsOrigin: e.CORS_ORIGIN,
    trustProxy: e.TRUST_PROXY,
    drawingArea: { widthMm: e.DRAWING_AREA_WIDTH_MM, heightMm: e.DRAWING_AREA_HEIGHT_MM },
    strokeBudget: { maxStrokes: e.MAX_STROKES, maxTotalLengthMm: e.MAX_TOTAL_STROKE_LENGTH_MM },
    retentionSweepIntervalMs: e.RETENTION_SWEEP_INTERVAL_MS,
    logLevel: e.LOG_LEVEL,
  };
}

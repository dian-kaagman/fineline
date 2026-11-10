import pino, { type DestinationStream, type Logger } from "pino";

/**
 * pino with redaction (SR-018). Request and response bodies are never logged; requests are logged
 * as method + URL only (no headers, no client address outside security events).
 */
export const REDACT_PATHS = [
  "req.headers.cookie",
  "req.headers.authorization",
  'res.headers["set-cookie"]',
  "password",
  "*.password",
  "previewToken",
  "*.previewToken",
  "customer",
  "*.customer",
  "customerName",
  "*.customerName",
  "customerEmail",
  "*.customerEmail",
  "address",
  "*.address",
  "svg",
  "*.svg",
  "token",
  "*.token",
  "sessionId",
  "*.sessionId",
];

export function createLogger(level: string, destination?: DestinationStream): Logger {
  return pino(
    {
      level,
      redact: { paths: REDACT_PATHS, censor: "[redacted]" },
      serializers: {
        req: (req: { method?: string; url?: string }) => ({ method: req.method, url: req.url }),
        res: (res: { statusCode?: number }) => ({ statusCode: res.statusCode }),
        // Never the message: pg and Drizzle errors carry values and query parameters in it.
        err: (err: Record<string, unknown>) => ({
          type: err.type ?? err.name,
          code: err.code,
          constraint: err.constraint,
          table: err.table,
          stack:
            typeof err.stack === "string"
              ? err.stack
                  .split("\n")
                  .filter((line) => line.startsWith("    at "))
                  .join("\n")
              : undefined,
        }),
      },
    },
    destination,
  );
}

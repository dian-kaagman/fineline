import { z } from "zod";
import { notFound, validationFailed, type ErrorDetail } from "./errors.js";

/**
 * Turns Zod issues into `details` that name the field (dotted path) and the rule, never the input
 * value (SR-018). Unknown keys get one entry each.
 */
export function issuesToDetails(issues: readonly z.core.$ZodIssue[]): ErrorDetail[] {
  const details: ErrorDetail[] = [];
  for (const issue of issues) {
    const base = issue.path.map(String).join(".");
    if (issue.code === "unrecognized_keys") {
      for (const key of issue.keys) {
        details.push({ field: base ? `${base}.${key}` : key, message: "Unexpected field" });
      }
    } else {
      details.push({ field: base || "body", message: issue.message });
    }
  }
  return details;
}

export function parseOrThrow<T extends z.ZodType>(schema: T, data: unknown): z.output<T> {
  const result = schema.safeParse(data);
  if (!result.success) throw validationFailed(issuesToDetails(result.error.issues));
  return result.data;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A malformed UUID in a path answers 404 (contract), before any query runs (SR-016). */
export function parseIdParam(
  params: unknown,
  name: string,
  notFoundCode: string,
  message: string,
): string {
  const value = (params as Record<string, unknown> | undefined)?.[name];
  if (typeof value !== "string" || !UUID.test(value)) throw notFound(notFoundCode, message);
  return value.toLowerCase();
}

/** Rejects control characters (incl. line breaks) in names and addresses (SR-016). */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

export const text = (max: number, requiredMessage: string, tooLongMessage: string) =>
  z
    .string({ error: requiredMessage })
    .trim()
    .min(1, requiredMessage)
    .max(max, tooLongMessage)
    .refine((v) => !CONTROL_CHARS.test(v), "Must not contain control characters or line breaks");

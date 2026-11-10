/** Typed application errors; one error handler maps them to the contract's `Error` shape. */

export interface ErrorDetail {
  field: string;
  message: string;
}

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: ErrorDetail[],
    public readonly headers?: Record<string, string>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const validationFailed = (
  details: ErrorDetail[],
  message = "Some fields are missing or invalid.",
) => new AppError(400, "validation_failed", message, details);

export const notFound = (code = "not_found", message = "Not found.") =>
  new AppError(404, code, message);

export const unauthenticated = () =>
  new AppError(401, "unauthenticated", "Please log in to continue.");

export const csrfFailed = () =>
  new AppError(403, "csrf_failed", "This request is missing the admin tool's header.");

export const rateLimited = (message: string, retryAfterSeconds: number) =>
  new AppError(429, "rate_limited", message, undefined, {
    "retry-after": String(Math.max(1, Math.ceil(retryAfterSeconds))),
  });

export const conversionUnavailable = (retryAfterSeconds?: number) =>
  new AppError(
    503,
    "conversion_unavailable",
    "We can't make drawings right now. Please try again in a few minutes.",
    undefined,
    retryAfterSeconds === undefined ? undefined : { "retry-after": String(retryAfterSeconds) },
  );

/** "Please wait 15 minutes" from a number of seconds. */
export function waitText(seconds: number): string {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return minutes === 1 ? "1 minute" : `${minutes} minutes`;
}

/** Suggested wait when the API's own conversion limit is reached (SR-004). */
export const DEFAULT_RETRY_AFTER_SECONDS = 30;

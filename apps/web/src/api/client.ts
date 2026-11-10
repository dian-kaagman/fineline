// The one place that talks HTTP to the Fineline API (docs/api/openapi.yaml). Components call the
// typed functions in shop.ts and admin.ts, never fetch directly.
import type { components } from "./schema";

export const API_BASE = "/api/v1";

/** Sent on every unsafe admin request, login and logout included (SR-013, AC-064). */
export const CSRF_HEADER = { name: "X-Requested-With", value: "fineline" } as const;

export type ErrorBody = components["schemas"]["Error"];
export type ErrorDetail = NonNullable<ErrorBody["error"]["details"]>[number];

/** The API answered with an error status. `code` is the contract's code, or `http_<status>` without a JSON body. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: ErrorDetail[];
  /** The API's own message: safe to show for codes the web app has no text for. */
  readonly apiMessage: string | undefined;
  readonly retryAfterSeconds: number | undefined;

  constructor(init: {
    status: number;
    code: string;
    details?: ErrorDetail[];
    apiMessage?: string;
    retryAfterSeconds?: number;
  }) {
    super(`API error ${init.status} ${init.code}`);
    this.name = "ApiError";
    this.status = init.status;
    this.code = init.code;
    this.details = init.details ?? [];
    this.apiMessage = init.apiMessage;
    this.retryAfterSeconds = init.retryAfterSeconds;
  }
}

/** No response at all (offline, DNS, connection reset). */
export class NetworkError extends Error {
  constructor() {
    super("No response from the server");
    this.name = "NetworkError";
  }
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface RequestOptions {
  method?: Method;
  json?: unknown;
  form?: FormData;
  signal?: AbortSignal;
  /** Adds the CSRF header; set for every unsafe /admin call. */
  csrf?: boolean;
}

function parseRetryAfter(value: string | null): number | undefined {
  if (value === null || !/^\d+$/.test(value.trim())) return undefined;
  return Number(value.trim());
}

async function toApiError(response: Response): Promise<ApiError> {
  const retryAfterSeconds = parseRetryAfter(response.headers.get("Retry-After"));
  let body: unknown;
  if ((response.headers.get("Content-Type") ?? "").includes("json")) {
    body = await response.json().catch(() => undefined);
  }
  const error = (body as Partial<ErrorBody> | undefined)?.error;
  if (error && typeof error.code === "string") {
    return new ApiError({
      status: response.status,
      code: error.code,
      details: Array.isArray(error.details) ? error.details : [],
      apiMessage: typeof error.message === "string" ? error.message : undefined,
      retryAfterSeconds,
    });
  }
  return new ApiError({
    status: response.status,
    code: `http_${response.status}`,
    retryAfterSeconds,
  });
}

/** Sends a request and returns the raw response when it is 2xx; throws ApiError / NetworkError otherwise. */
export async function send(path: string, options: RequestOptions = {}): Promise<Response> {
  const headers = new Headers({ Accept: "application/json" });
  let body: BodyInit | undefined;
  if (options.json !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(options.json);
  } else if (options.form) {
    body = options.form; // the browser sets the multipart boundary
  }
  if (options.csrf) headers.set(CSRF_HEADER.name, CSRF_HEADER.value);

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: options.method ?? "GET",
      headers,
      body,
      signal: options.signal,
      credentials: "same-origin",
    });
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new NetworkError();
  }
  if (!response.ok) throw await toApiError(response);
  return response;
}

export async function sendJson<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await send(path, options);
  return (await response.json()) as T;
}

/** `attachment; filename="FL-2026-0042.svg"` -> "FL-2026-0042.svg" (only safe file-name characters). */
export function filenameFromDisposition(header: string | null, fallback: string): string {
  const match = header ? /filename="?([^";]+)"?/i.exec(header) : null;
  const name = match?.[1]?.trim();
  return name && /^[\w.-]+$/.test(name) ? name : fallback;
}

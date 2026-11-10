import { z } from "zod";
import type { CustomerPhotoType } from "../domain/image-type.js";

/**
 * Client for the conversion worker (docs/api/worker-openapi.yaml). Maps worker answers to outcomes;
 * the drawings service maps outcomes to public error codes (design: worker -> public table).
 */

export type PhotoRejection =
  "photo_too_small" | "photo_too_many_pixels" | "photo_unreadable" | "photo_no_drawable_content";

export type ConversionOutcome =
  | { kind: "ok"; svg: string }
  | { kind: "rejected"; code: PhotoRejection }
  | { kind: "busy"; retryAfterSeconds: number }
  | { kind: "failed"; reason: string };

export interface ConversionRequest {
  photo: Buffer;
  contentType: CustomerPhotoType;
  areaWidthMm: number;
  areaHeightMm: number;
  maxStrokes: number;
  maxTotalLengthMm: number;
}

export interface ConversionClient {
  convert(request: ConversionRequest): Promise<ConversionOutcome>;
}

export const MIN_SHORT_SIDE_PX = 800;
export const DEFAULT_BUSY_RETRY_AFTER_SECONDS = 30;
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;

const successBody = z.object({
  svg: z.string().min(1),
  widthMm: z.number(),
  heightMm: z.number(),
  strokeCount: z.number().int(),
  totalLengthMm: z.number(),
});

const errorBody = z.object({ error: z.object({ code: z.string() }) });

const REJECTIONS: Record<string, PhotoRejection> = {
  "400:photo_too_small": "photo_too_small",
  "400:photo_too_many_pixels": "photo_too_many_pixels",
  "400:photo_unreadable": "photo_unreadable",
  "422:no_drawable_content": "photo_no_drawable_content",
};

export class HttpWorkerClient implements ConversionClient {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    private readonly timeoutMs: number,
  ) {}

  async convert(request: ConversionRequest): Promise<ConversionOutcome> {
    const form = new FormData();
    // A fixed part file name: the customer's file name never leaves the API (SR-005, BR-014).
    form.append("photo", new Blob([request.photo], { type: request.contentType }), "photo");
    form.append("areaWidthMm", String(request.areaWidthMm));
    form.append("areaHeightMm", String(request.areaHeightMm));
    form.append("maxStrokes", String(request.maxStrokes));
    form.append("maxTotalLengthMm", String(request.maxTotalLengthMm));
    form.append("minShortSidePx", String(MIN_SHORT_SIDE_PX));

    let response: Response;
    try {
      response = await fetch(new URL("/v1/convert", this.baseUrl), {
        method: "POST",
        headers: { authorization: `Bearer ${this.token}` },
        body: form,
        signal: AbortSignal.timeout(this.timeoutMs),
        redirect: "error",
      });
    } catch (err) {
      const name = (err as Error).name;
      return { kind: "failed", reason: name === "TimeoutError" ? "timeout" : "connection_error" };
    }

    let raw: string;
    try {
      raw = await response.text();
    } catch {
      return { kind: "failed", reason: "response_read_error" };
    }
    if (Buffer.byteLength(raw) > MAX_RESPONSE_BYTES)
      return { kind: "failed", reason: "response_too_large" };
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      body = undefined;
    }

    if (response.status === 200) {
      const parsed = successBody.safeParse(body);
      return parsed.success
        ? { kind: "ok", svg: parsed.data.svg }
        : { kind: "failed", reason: "bad_success_body" };
    }

    const code = errorBody.safeParse(body).data?.error.code;
    if (response.status === 503 && code === "busy") {
      const header = response.headers.get("retry-after");
      const seconds =
        header && /^\d+$/.test(header) ? Number(header) : DEFAULT_BUSY_RETRY_AFTER_SECONDS;
      return { kind: "busy", retryAfterSeconds: Math.min(Math.max(seconds, 1), 600) };
    }
    const rejection = code ? REJECTIONS[`${response.status}:${code}`] : undefined;
    if (rejection) return { kind: "rejected", code: rejection };
    const safeCode = code && /^[a-z_]{1,40}$/.test(code) ? `_${code}` : "";
    return { kind: "failed", reason: `worker_status_${response.status}${safeCode}` };
  }
}

/**
 * Bounds in-flight worker calls (SR-004). A call over the limit is refused at once rather than
 * queued, so the customer gets a quick "try again" instead of a slow failure.
 */
export class ConversionLimiter {
  private inFlight = 0;

  constructor(private readonly max: number) {}

  tryAcquire(): (() => void) | null {
    if (this.inFlight >= this.max) return null;
    this.inFlight += 1;
    let released = false;
    return () => {
      if (!released) {
        released = true;
        this.inFlight -= 1;
      }
    };
  }
}

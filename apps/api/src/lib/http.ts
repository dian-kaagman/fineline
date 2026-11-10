import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { AppError } from "./errors.js";

export const NO_STORE = "no-store";

/** onRequest hook: the response is never cached, whatever the outcome (SR-019). */
export async function noStore(_request: FastifyRequest, reply: FastifyReply) {
  reply.header("cache-control", NO_STORE);
}

/** Headers for every file response (SR-007, SR-008): never rendered as an active page. */
export function sendFile(
  reply: FastifyReply,
  data: Buffer,
  contentType: string,
  options: { attachmentName?: string; cacheControl: string },
): FastifyReply {
  reply
    .header("content-type", contentType)
    .header("x-content-type-options", "nosniff")
    .header("content-security-policy", "default-src 'none'; style-src 'unsafe-inline'; sandbox")
    .header("cache-control", options.cacheControl);
  if (options.attachmentName) {
    reply.header("content-disposition", `attachment; filename="${options.attachmentName}"`);
  }
  return reply.send(data);
}

interface ErrorBody {
  error: { code: string; message: string; details?: { field: string; message: string }[] };
}

const GENERIC_500: ErrorBody = {
  error: { code: "internal_error", message: "Something went wrong" },
};

/** Only safe fields of an unexpected error reach the log: never messages of DB errors (SR-018). */
function safeErrorFields(error: unknown): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  let current: unknown = error;
  // Walk the cause chain (Drizzle wraps pg errors, and its message contains the query parameters).
  for (let depth = 0; current && depth < 5; depth++) {
    const e = current as {
      name?: unknown;
      code?: unknown;
      constraint?: unknown;
      table?: unknown;
      severity?: unknown;
    };
    const isPg = typeof e.severity === "string" && typeof e.code === "string";
    const entry: Record<string, unknown> = {
      type: typeof e.name === "string" ? e.name : typeof current,
    };
    if (typeof e.code === "string") entry.code = e.code;
    if (isPg) {
      if (typeof e.constraint === "string") entry.constraint = e.constraint;
      if (typeof e.table === "string") entry.table = e.table;
    }
    if (depth === 0 && current instanceof Error && current.stack) {
      // Stack frames only: the first lines repeat the message.
      entry.stack = current.stack
        .split("\n")
        .filter((line) => line.startsWith("    at "))
        .join("\n");
    }
    fields[depth === 0 ? "err" : `cause${depth}`] = entry;
    current = (current as { cause?: unknown }).cause;
  }
  return fields;
}

const FASTIFY_CLIENT_ERRORS: Record<string, { status: number; code: string; message: string }> = {
  FST_ERR_CTP_INVALID_MEDIA_TYPE: {
    status: 415,
    code: "unsupported_media_type",
    message: "This content type is not accepted here.",
  },
  FST_ERR_CTP_BODY_TOO_LARGE: {
    status: 413,
    code: "payload_too_large",
    message: "The request body is too large.",
  },
  FST_ERR_CTP_INVALID_CONTENT_LENGTH: {
    status: 400,
    code: "validation_failed",
    message: "Malformed request.",
  },
};

/** The one error handler: every error leaves as the contract's `Error` shape. */
export function errorHandler(
  error: FastifyError | AppError,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  if (error instanceof AppError) {
    if (error.headers) reply.headers(error.headers);
    if (error.statusCode === 413) {
      // The upload stopped being parsed at the limit; discard whatever the client still sends so
      // the 413 reaches it reliably (closing with unread data resets the connection and loses
      // the answer, also behind nginx). Nothing more is parsed or stored (SR-001).
      request.raw.unpipe();
      request.raw.resume();
    }
    if (error.statusCode >= 500) {
      request.log.error({ event: "service_unavailable", code: error.code }, "service unavailable");
    }
    const body: ErrorBody = { error: { code: error.code, message: error.message } };
    if (error.details) body.error.details = error.details;
    return reply.status(error.statusCode).send(body);
  }

  const known = error.code ? FASTIFY_CLIENT_ERRORS[error.code] : undefined;
  if (known) {
    return reply.status(known.status).send({ error: { code: known.code, message: known.message } });
  }
  if (error.code?.startsWith("FST_ERR_CTP_") && (error.statusCode ?? 500) < 500) {
    // Malformed or empty JSON body: name the body, never echo it.
    return reply.status(400).send({
      error: {
        code: "validation_failed",
        message: "Some fields are missing or invalid.",
        details: [{ field: "body", message: "The request body is not valid JSON" }],
      },
    });
  }
  if (error.statusCode !== undefined && error.statusCode >= 400 && error.statusCode < 500) {
    return reply
      .status(error.statusCode)
      .send({ error: { code: "bad_request", message: "Bad request." } });
  }

  request.log.error({ ...safeErrorFields(error), event: "unhandled_error" }, "unhandled error");
  return reply.status(500).send(GENERIC_500);
}

export function notFoundHandler(_request: FastifyRequest, reply: FastifyReply) {
  return reply.status(404).send({ error: { code: "not_found", message: "Not found." } });
}

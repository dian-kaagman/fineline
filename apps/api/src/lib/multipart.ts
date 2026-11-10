import type { FastifyRequest } from "fastify";
import { AppError, validationFailed, type ErrorDetail } from "./errors.js";

export interface MultipartForm {
  fields: Map<string, string>;
  file: Buffer | undefined;
  /** Problems found while reading: unexpected or repeated parts. */
  problems: ErrorDetail[];
}

export interface MultipartOptions {
  fileField: string;
  maxFileBytes: number;
  fieldNames: readonly string[];
  /** Answer when the file crosses `maxFileBytes` (413, SR-001). */
  tooLarge: () => AppError;
}

const LIMIT_CODES = new Set([
  "FST_PARTS_LIMIT",
  "FST_FILES_LIMIT",
  "FST_FIELDS_LIMIT",
  "FST_PROTO_VIOLATION",
]);

/**
 * Streams a multipart body with hard limits (SR-001): at most one file part, of at most
 * `maxFileBytes` (413 as soon as it is crossed, without reading the rest), only the named text
 * fields of at most 1 KiB each. The client's file name and declared content type are ignored.
 */
export async function readMultipart(
  request: FastifyRequest,
  options: MultipartOptions,
): Promise<MultipartForm> {
  const form: MultipartForm = { fields: new Map(), file: undefined, problems: [] };
  if (!request.isMultipart()) return form;
  try {
    const parts = request.parts({
      limits: {
        files: 1,
        // One byte more than allowed: seeing that byte proves the file is too large, at once.
        // (busboy only flags truncation when the part ends, after the client sent everything.)
        fileSize: options.maxFileBytes + 1,
        fields: options.fieldNames.length,
        parts: options.fieldNames.length + 1,
        fieldSize: 1024,
        fieldNameSize: 100,
        headerPairs: 100,
      },
    });
    for await (const part of parts) {
      if (part.type === "file") {
        if (part.fieldname !== options.fileField) {
          throw validationFailed([{ field: "body", message: "Unexpected file part" }]);
        }
        // Read the stream ourselves: toBuffer() would drain the rest of an oversized part before
        // failing. Leaving the loop destroys the stream, so busboy stops parsing at once.
        const chunks: Buffer[] = [];
        let size = 0;
        for await (const chunk of part.file) {
          size += (chunk as Buffer).length;
          if (size > options.maxFileBytes) throw options.tooLarge();
          chunks.push(chunk as Buffer);
        }
        form.file = Buffer.concat(chunks);
      } else if (!options.fieldNames.includes(part.fieldname)) {
        form.problems.push({ field: "body", message: "Unexpected field" });
      } else if (form.fields.has(part.fieldname)) {
        form.problems.push({ field: part.fieldname, message: "Given more than once" });
      } else {
        form.fields.set(part.fieldname, typeof part.value === "string" ? part.value : "");
      }
    }
  } catch (err) {
    if (err instanceof AppError) throw err;
    const code = (err as { code?: string }).code;
    if (code === "FST_REQ_FILE_TOO_LARGE") throw options.tooLarge();
    if (code !== undefined && LIMIT_CODES.has(code)) {
      throw validationFailed([
        { field: "body", message: "Only one file and the listed fields are allowed" },
      ]);
    }
    if (code === "FST_MP_PREMATURE_CLOSE") {
      throw validationFailed([{ field: "body", message: "The upload was incomplete" }]);
    }
    throw err;
  }
  return form;
}

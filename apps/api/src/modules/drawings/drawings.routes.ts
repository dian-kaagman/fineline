import type { FastifyInstance, FastifyRequest } from "fastify";
import { AppError, waitText } from "../../lib/errors.js";
import { noStore } from "../../lib/http.js";
import { readMultipart } from "../../lib/multipart.js";
import { LIMITS, rateLimitHook } from "../../lib/rate-limit.js";
import type { DrawingsService } from "./drawings.service.js";

/** 15 MiB (BR-001). */
export const MAX_PHOTO_BYTES = 15 * 1024 * 1024;

export function drawingsRoutes(service: DrawingsService) {
  return async function (app: FastifyInstance) {
    const limit = rateLimitHook(
      [
        app.createRateLimit(LIMITS.drawingsPerIp),
        app.createRateLimit({ ...LIMITS.drawingsGlobal, keyGenerator: () => "all-uploads" }),
      ],
      (wait) =>
        `You've made a lot of drawings in a short time. Please wait ${waitText(wait)} and try again.`,
    );

    app.post("/api/v1/drawings", { onRequest: [noStore, limit] }, async (request, reply) => {
      // The slot is taken before the body is read: a busy API answers 503 without buffering it.
      const release = service.startConversion(request.log);
      try {
        return reply.status(201).send(await convertUpload(request));
      } finally {
        release();
      }
    });

    async function convertUpload(request: FastifyRequest) {
      const form = await readMultipart(request, {
        fileField: "photo",
        maxFileBytes: MAX_PHOTO_BYTES,
        fieldNames: [],
        tooLarge: () => new AppError(413, "photo_too_large", "The photo must be at most 15 MB."),
      });
      if (form.problems.length > 0) {
        throw new AppError(
          400,
          "validation_failed",
          "Send exactly one photo and nothing else.",
          form.problems,
        );
      }
      if (!form.file)
        throw new AppError(400, "photo_missing", "Choose a photo to make your drawing.");
      return service.createDrawing(form.file, request.log);
    }
  };
}

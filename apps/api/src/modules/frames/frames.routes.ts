import type { FastifyInstance } from "fastify";
import { AppError } from "../../lib/errors.js";
import { sendFile } from "../../lib/http.js";
import { readMultipart } from "../../lib/multipart.js";
import { parseIdParam } from "../../lib/validation.js";
import { MAX_FRAME_PHOTO_BYTES } from "./frames.schemas.js";
import type { FramesService } from "./frames.service.js";

const frameId = (params: unknown) =>
  parseIdParam(params, "frameId", "frame_not_found", "This frame does not exist.");

const framePhotoTooLarge = () =>
  new AppError(413, "photo_too_large", "The photo must be at most 5 MB.");

/** Public catalogue (no session). */
export function publicFramesRoutes(service: FramesService) {
  return async function (app: FastifyInstance) {
    app.get("/api/v1/frames", async () => ({ frames: await service.listAvailable() }));

    app.get("/api/v1/frames/:frameId/photo", async (request, reply) => {
      const photo = await service.getPhoto(frameId(request.params));
      return sendFile(reply, photo.data, photo.contentType, { cacheControl: "no-cache" });
    });
  };
}

/** Registered inside the admin plugin (prefix /api/v1/admin), behind its auth and CSRF hooks. */
export function adminFramesRoutes(service: FramesService) {
  return async function (app: FastifyInstance) {
    app.get("/frames", async () => ({ frames: await service.adminList() }));

    app.post("/frames", async (request, reply) => {
      const form = await readMultipart(request, {
        fileField: "photo",
        maxFileBytes: MAX_FRAME_PHOTO_BYTES,
        fieldNames: ["name", "widthMm", "heightMm", "priceCents", "stock"],
        tooLarge: framePhotoTooLarge,
      });
      const frame = await service.create(form.fields, form.file, form.problems, request.log);
      return reply.status(201).send(frame);
    });

    app.get("/frames/:frameId", async (request) => service.adminGet(frameId(request.params)));

    app.patch("/frames/:frameId", async (request) =>
      service.update(frameId(request.params), request.body),
    );

    app.put("/frames/:frameId/photo", async (request) => {
      const id = frameId(request.params);
      const form = await readMultipart(request, {
        fileField: "photo",
        maxFileBytes: MAX_FRAME_PHOTO_BYTES,
        fieldNames: [],
        tooLarge: framePhotoTooLarge,
      });
      return service.replacePhoto(id, form.file, form.problems);
    });

    app.post("/frames/:frameId/stock-adjustments", async (request) =>
      service.adjustStock(frameId(request.params), request.body),
    );
  };
}

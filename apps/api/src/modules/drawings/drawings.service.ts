import { randomUUID } from "node:crypto";
import type { FastifyBaseLogger } from "fastify";
import type { Config } from "../../config.js";
import type { Database } from "../../db/client.js";
import { detectCustomerPhotoType } from "../../domain/image-type.js";
import { previewExpiresAt } from "../../domain/retention.js";
import { checkDrawingSvg } from "../../domain/svg-drawing.js";
import type { Clock } from "../../lib/clock.js";
import { AppError, conversionUnavailable, DEFAULT_RETRY_AFTER_SECONDS } from "../../lib/errors.js";
import { newDrawingKey, newPhotoKey, type FileStorage } from "../../storage/file-storage.js";
import type {
  ConversionClient,
  ConversionLimiter,
  PhotoRejection,
} from "../../worker/worker-client.js";
import { insertDrawing } from "./drawings.repository.js";
import { hashPreviewToken, newPreviewToken } from "./preview-token.js";

export interface DrawingPreview {
  drawingId: string;
  previewToken: string;
  svg: string;
  widthMm: number;
  heightMm: number;
  strokeCount: number;
  totalLengthMm: number;
  expiresAt: string;
}

const REJECTION_MESSAGES: Record<PhotoRejection, string> = {
  photo_too_small: "The photo's shortest side must be at least 800 pixels.",
  photo_too_many_pixels: "The photo may have at most 50 megapixels.",
  photo_unreadable: "We couldn't open this photo. It may be damaged. Please try another photo.",
  photo_no_drawable_content:
    "We couldn't make a drawing from this photo. Please try another photo.",
};

export const unsupportedPhotoType = () =>
  new AppError(400, "photo_unsupported_type", "Use a JPEG, PNG or HEIC photo.");

export interface DrawingsServiceDeps {
  config: Config;
  db: Database;
  storage: FileStorage;
  worker: ConversionClient;
  limiter: ConversionLimiter;
  clock: Clock;
}

export function createDrawingsService(deps: DrawingsServiceDeps) {
  const { config, db, storage, worker, limiter, clock } = deps;
  const limits = {
    areaWidthMm: config.drawingArea.widthMm,
    areaHeightMm: config.drawingArea.heightMm,
    maxStrokes: config.strokeBudget.maxStrokes,
    maxTotalLengthMm: config.strokeBudget.maxTotalLengthMm,
  };

  /**
   * Converts a photo into a drawing (design, customer flow step 1). Photo and SVG are stored only
   * after the worker succeeded and the SVG passed the check, so a rejected upload leaves nothing
   * behind (SR-015).
   */
  async function createDrawing(photo: Buffer, log: FastifyBaseLogger): Promise<DrawingPreview> {
    const contentType = detectCustomerPhotoType(photo);
    if (!contentType) throw unsupportedPhotoType();

    const release = limiter.tryAcquire();
    if (!release) {
      log.warn({ event: "conversion_busy", source: "api_limit" }, "conversion limit reached");
      throw conversionUnavailable(DEFAULT_RETRY_AFTER_SECONDS);
    }
    const drawingId = randomUUID();
    let svg: string;
    try {
      const outcome = await worker.convert({ photo, contentType, ...limits });
      switch (outcome.kind) {
        case "ok":
          svg = outcome.svg;
          break;
        case "rejected":
          throw new AppError(400, outcome.code, REJECTION_MESSAGES[outcome.code]);
        case "busy":
          log.warn({ event: "conversion_busy", source: "worker" }, "worker busy");
          throw conversionUnavailable(outcome.retryAfterSeconds);
        case "failed":
          log.error(
            { event: "conversion_failed", reason: outcome.reason, drawingId },
            "conversion failed",
          );
          throw conversionUnavailable();
      }
    } finally {
      release();
    }

    const svgBytes = Buffer.from(svg, "utf8");
    const check = checkDrawingSvg(svgBytes, limits);
    if (!check.ok) {
      log.error(
        { event: "svg_rejected", rule: check.rule, drawingId },
        "conversion result failed the drawing check",
      );
      throw conversionUnavailable();
    }

    const now = clock();
    const expiresAt = previewExpiresAt(now);
    const previewToken = newPreviewToken();
    const photoKey = newPhotoKey();
    const svgKey = newDrawingKey();
    try {
      await storage.put(photoKey, photo);
      await storage.put(svgKey, svgBytes);
      await insertDrawing(db, {
        id: drawingId,
        previewTokenHash: hashPreviewToken(previewToken),
        photoKey,
        photoContentType: contentType,
        svgKey,
        ...check.metrics,
        createdAt: now,
        expiresAt,
      });
    } catch (err) {
      // Leave nothing behind; the orphan sweep is the backstop if these deletes fail too.
      await Promise.allSettled([storage.delete(photoKey), storage.delete(svgKey)]);
      throw err;
    }
    log.info(
      { event: "drawing_created", drawingId, strokeCount: check.metrics.strokeCount },
      "drawing created",
    );

    return {
      drawingId,
      previewToken,
      svg,
      ...check.metrics,
      expiresAt: expiresAt.toISOString(),
    };
  }

  return { createDrawing };
}

export type DrawingsService = ReturnType<typeof createDrawingsService>;

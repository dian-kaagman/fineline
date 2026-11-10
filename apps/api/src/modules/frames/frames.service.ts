import type { FastifyBaseLogger } from "fastify";
import type { Database } from "../../db/client.js";
import { stripImageMetadata } from "../../domain/image-metadata.js";
import { detectFramePhotoType, type FramePhotoType } from "../../domain/image-type.js";
import type { Clock } from "../../lib/clock.js";
import { AppError, notFound, validationFailed, type ErrorDetail } from "../../lib/errors.js";
import { issuesToDetails, parseOrThrow } from "../../lib/validation.js";
import { newFramePhotoKey, type FileStorage } from "../../storage/file-storage.js";
import {
  adjustFrameStock,
  findFrame,
  insertFrame,
  listAllFrames,
  listFramesInStock,
  updateFrame,
  type FrameRow,
} from "./frames.repository.js";
import {
  createFrameFields,
  MAX_STOCK,
  sizeProblems,
  stockAdjustmentBody,
  toAdminFrame,
  toPublicFrame,
  updateFrameBody,
  type DrawingArea,
} from "./frames.schemas.js";

export const frameNotFound = () => notFound("frame_not_found", "This frame does not exist.");

interface CleanPhoto {
  data: Buffer;
  contentType: FramePhotoType;
}

/** Type from magic bytes (SR-002) and metadata stripped (SR-023), or a `photo` problem. */
function cleanFramePhoto(file: Buffer | undefined): CleanPhoto | ErrorDetail {
  if (!file || file.length === 0) return { field: "photo", message: "Choose a photo of the frame" };
  const contentType = detectFramePhotoType(file);
  if (!contentType) return { field: "photo", message: "Use a JPEG, PNG or WebP photo" };
  const data = stripImageMetadata(file, contentType);
  if (!data) return { field: "photo", message: "This photo file is damaged; use another one" };
  return { data, contentType };
}

export interface FramesServiceDeps {
  db: Database;
  storage: FileStorage;
  clock: Clock;
  drawingArea: DrawingArea;
}

export function createFramesService({ db, storage, clock, drawingArea }: FramesServiceDeps) {
  async function requireFrame(id: string): Promise<FrameRow> {
    const frame = await findFrame(db, id);
    if (!frame) throw frameNotFound();
    return frame;
  }

  return {
    async listAvailable() {
      return (await listFramesInStock(db)).map(toPublicFrame);
    },

    /** The frame photo, for every existing frame including those out of stock. */
    async getPhoto(id: string): Promise<{ data: Buffer; contentType: string }> {
      const frame = await requireFrame(id);
      const data = await storage.get(frame.photoKey);
      if (!data) throw new Error("frame photo file missing");
      return { data, contentType: frame.photoContentType };
    },

    async adminList() {
      return (await listAllFrames(db)).map(toAdminFrame);
    },

    async adminGet(id: string) {
      return toAdminFrame(await requireFrame(id));
    },

    async create(
      fields: Map<string, string>,
      file: Buffer | undefined,
      readProblems: ErrorDetail[],
      log: FastifyBaseLogger,
    ) {
      const problems: ErrorDetail[] = [...readProblems];
      const raw = Object.fromEntries(fields);
      const parsed = createFrameFields.safeParse(raw);
      if (!parsed.success) problems.push(...issuesToDetails(parsed.error.issues));
      // Size against the drawing area for each size that parsed, also when other fields are wrong,
      // so every problem is reported together (contract).
      const width = createFrameFields.shape.widthMm.safeParse(raw.widthMm);
      const height = createFrameFields.shape.heightMm.safeParse(raw.heightMm);
      problems.push(...sizeProblems(drawingArea, width.data, height.data));
      const photo = cleanFramePhoto(file);
      if ("field" in photo) problems.push(photo);
      if (problems.length > 0 || !parsed.success || "field" in photo)
        throw validationFailed(problems);

      const now = clock();
      const photoKey = newFramePhotoKey();
      await storage.put(photoKey, photo.data);
      try {
        const row = await insertFrame(db, {
          ...parsed.data,
          photoKey,
          photoContentType: photo.contentType,
          createdAt: now,
          updatedAt: now,
        });
        log.info({ event: "frame_created", frameId: row.id }, "frame created");
        return toAdminFrame(row);
      } catch (err) {
        await storage.delete(photoKey).catch(() => undefined);
        throw err;
      }
    },

    async update(id: string, body: unknown) {
      const patch = parseOrThrow(updateFrameBody, body);
      const problems = sizeProblems(drawingArea, patch.widthMm, patch.heightMm);
      if (problems.length > 0) throw validationFailed(problems);
      const row = await updateFrame(db, id, patch, clock());
      if (!row) throw frameNotFound();
      return toAdminFrame(row);
    },

    async replacePhoto(id: string, file: Buffer | undefined, readProblems: ErrorDetail[]) {
      const existing = await requireFrame(id);
      const photo = cleanFramePhoto(file);
      const problems = [...readProblems, ...("field" in photo ? [photo] : [])];
      if (problems.length > 0 || "field" in photo) throw validationFailed(problems);
      const photoKey = newFramePhotoKey();
      await storage.put(photoKey, photo.data);
      const row = await updateFrame(
        db,
        id,
        { photoKey, photoContentType: photo.contentType },
        clock(),
      );
      if (!row) {
        await storage.delete(photoKey);
        throw frameNotFound();
      }
      // The old file is unreferenced now; if this delete fails, the orphan sweep removes it.
      await storage.delete(existing.photoKey).catch(() => undefined);
      return toAdminFrame(row);
    },

    async adjustStock(id: string, body: unknown) {
      const { delta } = parseOrThrow(stockAdjustmentBody, body);
      const row = await adjustFrameStock(db, id, delta, MAX_STOCK, clock());
      if (row) return toAdminFrame(row);
      const frame = await requireFrame(id);
      if (frame.stock + delta > MAX_STOCK) {
        throw validationFailed([
          {
            field: "delta",
            message: `Stock can be at most ${MAX_STOCK}; there are ${frame.stock} in stock`,
          },
        ]);
      }
      throw new AppError(
        409,
        "stock_negative",
        `Stock can't go below zero. There are ${frame.stock} in stock, so you can remove at most ${frame.stock}.`,
      );
    },
  };
}

export type FramesService = ReturnType<typeof createFramesService>;

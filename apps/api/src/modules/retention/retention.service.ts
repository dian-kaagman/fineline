import type { FastifyBaseLogger } from "fastify";
import type { Database } from "../../db/client.js";
import { orderPhotoCutoff, selectOrphanFiles, sessionCutoffs } from "../../domain/retention.js";
import type { Clock } from "../../lib/clock.js";
import type { FileStorage } from "../../storage/file-storage.js";
import { deleteExpiredSessions } from "../admin/sessions.repository.js";
import {
  deleteDrawing,
  isDrawingOrdered,
  listDrawingFileKeys,
  listExpiredUnorderedDrawingIds,
  lockExpiredUnorderedDrawing,
  markPhotoDeleted,
} from "../drawings/drawings.repository.js";
import { listFramePhotoKeys } from "../frames/frames.repository.js";
import { findClosedOrderPhotos } from "../orders/orders.repository.js";

const TEMP_FILE_MAX_AGE_MS = 3_600_000;

export interface RetentionReport {
  drawingsDeleted: number;
  orderPhotosDeleted: number;
  orphanFilesDeleted: number;
  tempFilesDeleted: number;
  sessionsDeleted: number;
  failures: number;
}

export interface RetentionDeps {
  db: Database;
  storage: FileStorage;
  clock: Clock;
  sessionIdleHours: number;
  log: FastifyBaseLogger;
}

/**
 * The retention sweep (BR-010, SR-022). Files are deleted before rows change, so a failed delete
 * leaves the row in place and the next run retries; nothing is marked deleted while still on disk.
 */
export function createRetentionService({
  db,
  storage,
  clock,
  sessionIdleHours,
  log,
}: RetentionDeps) {
  async function run(): Promise<RetentionReport> {
    const now = clock();
    const report: RetentionReport = {
      drawingsDeleted: 0,
      orderPhotosDeleted: 0,
      orphanFilesDeleted: 0,
      tempFilesDeleted: 0,
      sessionsDeleted: 0,
      failures: 0,
    };
    const failed = (step: string, id?: string) => {
      report.failures += 1;
      log.error(
        { event: "retention_failed", step, id },
        "retention step failed; retried on the next run",
      );
    };

    // Unordered drawings 24 h after upload: photo, SVG and row.
    for (const id of await listExpiredUnorderedDrawingIds(db, now)) {
      try {
        const deleted = await db.transaction(async (tx) => {
          const drawing = await lockExpiredUnorderedDrawing(tx, id, now);
          // Ordered while we waited for the lock: its files belong to an order now (BR-005).
          if (!drawing || (await isDrawingOrdered(tx, id))) return false;
          await storage.delete(drawing.photoKey);
          await storage.delete(drawing.svgKey);
          await deleteDrawing(tx, id);
          return true;
        });
        if (deleted) report.drawingsDeleted += 1;
      } catch {
        failed("unordered_drawing", id);
      }
    }

    // Original photos of orders shipped or cancelled 30+ days ago; the drawing is kept.
    for (const { drawingId, photoKey } of await findClosedOrderPhotos(db, orderPhotoCutoff(now))) {
      try {
        await storage.delete(photoKey);
        await markPhotoDeleted(db, drawingId, now);
        report.orderPhotosDeleted += 1;
      } catch {
        failed("order_photo", drawingId);
      }
    }

    // Files no row references (crash leftovers, replaced frame photos), older than 24 h.
    try {
      const referenced = new Set([
        ...(await listDrawingFileKeys(db)),
        ...(await listFramePhotoKeys(db)),
      ]);
      for (const key of selectOrphanFiles(await storage.list(), referenced, now)) {
        try {
          await storage.delete(key);
          report.orphanFilesDeleted += 1;
        } catch {
          failed("orphan_file");
        }
      }
    } catch {
      failed("orphan_listing");
    }

    // Temp files of writes interrupted by a crash, older than an hour.
    try {
      report.tempFilesDeleted = await storage.removeStaleTemporaryFiles(
        new Date(now.getTime() - TEMP_FILE_MAX_AGE_MS),
      );
    } catch {
      failed("temp_files");
    }

    // Expired admin sessions.
    try {
      const { idleBefore, createdBefore } = sessionCutoffs(now, sessionIdleHours);
      report.sessionsDeleted = await deleteExpiredSessions(db, idleBefore, createdBefore);
    } catch {
      failed("sessions");
    }

    log.info({ event: "retention_sweep", ...report }, "retention sweep done");
    return report;
  }

  return { run };
}

export type RetentionService = ReturnType<typeof createRetentionService>;

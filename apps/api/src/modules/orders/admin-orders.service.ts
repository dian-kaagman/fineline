import type { FastifyBaseLogger } from "fastify";
import { z } from "zod";
import type { Database } from "../../db/client.js";
import { isOrderNumber } from "../../domain/order-number.js";
import {
  allowedNextStatuses,
  canSetStatus,
  isClosed,
  OPEN_STATUSES,
  ORDER_STATUSES,
  STATUS_LABELS,
  statusAfterArmDownload,
} from "../../domain/order-status.js";
import { isCalendarDate } from "../../domain/working-days.js";
import type { Clock } from "../../lib/clock.js";
import { AppError } from "../../lib/errors.js";
import { parseOrThrow } from "../../lib/validation.js";
import type { FileStorage } from "../../storage/file-storage.js";
import { returnOneToStock } from "../frames/frames.repository.js";
import {
  findOrder,
  listOrders,
  lockOrder,
  updateOrder,
  type OrderWithJoins,
} from "./orders.repository.js";
import { orderNotFound } from "./orders.service.js";

const statusFilter = z.strictObject({
  status: z
    .enum(["open", "all", ...ORDER_STATUSES], { error: "Use open, all or one order status" })
    .default("open"),
});

const statusBody = z.strictObject({
  status: z.enum(ORDER_STATUSES, { error: "Must be an order status" }),
});

const deliveryDateBody = z.strictObject({
  estimatedDeliveryDate: z
    .string({ error: "Enter a date as YYYY-MM-DD" })
    .refine(isCalendarDate, "Enter a date as YYYY-MM-DD"),
});

function toSummary({ order, frameName }: OrderWithJoins) {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    orderDate: order.orderDate,
    estimatedDeliveryDate: order.estimatedDeliveryDate,
    customerName: order.customerName,
    frameName,
    createdAt: order.createdAt.toISOString(),
  };
}

function toDetail(row: OrderWithJoins) {
  const { order, drawing } = row;
  return {
    ...toSummary(row),
    customerEmail: order.customerEmail,
    address: {
      street: order.street,
      houseNumber: order.houseNumber,
      postalCode: order.postalCode,
      city: order.city,
      country: order.country,
    },
    frameId: order.frameId,
    priceCents: order.priceCents,
    drawing: {
      widthMm: drawing.widthMm,
      heightMm: drawing.heightMm,
      strokeCount: drawing.strokeCount,
      totalLengthMm: drawing.totalLengthMm,
    },
    photoAvailable: drawing.photoDeletedAt === null,
    allowedNextStatuses: allowedNextStatuses(order.status),
    statusChangedAt: order.statusChangedAt.toISOString(),
  };
}

/** `<orderNumber>.svg`, checked against the pattern so nothing else reaches the header (SR-008). */
function svgFileName(orderNumber: string): string {
  if (!isOrderNumber(orderNumber)) throw new Error("unexpected order number format");
  return `${orderNumber}.svg`;
}

const PHOTO_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/heic": "heic",
};

export interface AdminOrdersServiceDeps {
  db: Database;
  storage: FileStorage;
  clock: Clock;
}

export function createAdminOrdersService({ db, storage, clock }: AdminOrdersServiceDeps) {
  async function requireOrder(id: string): Promise<OrderWithJoins> {
    const row = await findOrder(db, id);
    if (!row) throw orderNotFound();
    return row;
  }

  async function readSvg(row: OrderWithJoins): Promise<Buffer> {
    const data = await storage.get(row.drawing.svgKey);
    if (!data) throw new Error("drawing file missing");
    return data;
  }

  return {
    async list(query: unknown) {
      const { status } = parseOrThrow(statusFilter, query ?? {});
      const statuses = status === "all" ? "all" : status === "open" ? OPEN_STATUSES : [status];
      return (await listOrders(db, statuses)).map(toSummary);
    },

    async get(id: string) {
      return toDetail(await requireOrder(id));
    },

    /** The stored SVG, exactly as previewed (BR-005); no side effects. */
    async drawingSvg(id: string) {
      const row = await requireOrder(id);
      return { data: await readSvg(row), fileName: svgFileName(row.order.orderNumber) };
    },

    /** Same file; moves a `received` order to `drawing` (BR-009) in the same request. */
    async downloadForArm(id: string, log: FastifyBaseLogger) {
      const row = await requireOrder(id);
      const data = await readSvg(row);
      const now = clock();
      const moved = await db.transaction(async (tx) => {
        const locked = await lockOrder(tx, id);
        if (!locked) throw orderNotFound();
        const next = statusAfterArmDownload(locked.status);
        if (next === locked.status) return false;
        await updateOrder(tx, id, { status: next, statusChangedAt: now });
        return true;
      });
      if (moved)
        log.info(
          { event: "order_status_changed", orderNumber: row.order.orderNumber, status: "drawing" },
          "status changed",
        );
      return { data, fileName: svgFileName(row.order.orderNumber) };
    },

    async photo(id: string) {
      const row = await requireOrder(id);
      if (row.drawing.photoDeletedAt !== null) {
        throw new AppError(
          410,
          "photo_deleted",
          "The customer's photo was deleted 30 days after the order was closed.",
        );
      }
      const data = await storage.get(row.drawing.photoKey);
      if (!data) throw new Error("photo file missing");
      const ext = PHOTO_EXTENSIONS[row.drawing.photoContentType] ?? "bin";
      return {
        data,
        contentType: row.drawing.photoContentType,
        fileName: `${row.order.orderNumber}-photo.${ext}`,
      };
    },

    /** Status action (BR-009); cancelling returns one frame to stock in the same transaction (BR-006). */
    async changeStatus(id: string, body: unknown, log: FastifyBaseLogger) {
      const { status: target } = parseOrThrow(statusBody, body);
      const now = clock();
      await db.transaction(async (tx) => {
        const order = await lockOrder(tx, id);
        if (!order) throw orderNotFound();
        if (!canSetStatus(order.status, target)) {
          const hint =
            order.status === "received" && target === "drawing"
              ? " Download the SVG for the arm to start drawing."
              : "";
          throw new AppError(
            409,
            "invalid_transition",
            `${order.orderNumber} is ${STATUS_LABELS[order.status]} now, so it can't be moved to ${STATUS_LABELS[target]}.${hint}`,
          );
        }
        if (target === "cancelled") await returnOneToStock(tx, order.frameId, now);
        await updateOrder(tx, id, {
          status: target,
          statusChangedAt: now,
          closedAt: isClosed(target) ? now : null,
        });
        log.info(
          { event: "order_status_changed", orderNumber: order.orderNumber, status: target },
          "status changed",
        );
      });
      return toDetail(await requireOrder(id));
    },

    /** One order's date, on or after its order date, while not shipped or cancelled (BR-008, Q-14). */
    async changeDeliveryDate(id: string, body: unknown) {
      const { estimatedDeliveryDate } = parseOrThrow(deliveryDateBody, body);
      await db.transaction(async (tx) => {
        const order = await lockOrder(tx, id);
        if (!order) throw orderNotFound();
        if (isClosed(order.status)) {
          throw new AppError(
            409,
            "order_closed",
            "The delivery date of a shipped or cancelled order can't be changed.",
          );
        }
        if (estimatedDeliveryDate < order.orderDate) {
          throw new AppError(
            400,
            "delivery_date_before_order_date",
            "The delivery date can't be before the order date.",
            [
              {
                field: "estimatedDeliveryDate",
                message: "The delivery date can't be before the order date",
              },
            ],
          );
        }
        await updateOrder(tx, id, { estimatedDeliveryDate });
      });
      return toDetail(await requireOrder(id));
    },
  };
}

export type AdminOrdersService = ReturnType<typeof createAdminOrdersService>;

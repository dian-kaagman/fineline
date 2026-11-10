import type { FastifyBaseLogger } from "fastify";
import type { Database } from "../../db/client.js";
import { formatOrderNumber } from "../../domain/order-number.js";
import { isPreviewExpired } from "../../domain/retention.js";
import { addWorkingDays, amsterdamDateOf, amsterdamYearOf } from "../../domain/working-days.js";
import type { Clock } from "../../lib/clock.js";
import { AppError, notFound } from "../../lib/errors.js";
import { findDrawingForUpdate } from "../drawings/drawings.repository.js";
import { NO_MATCH_HASH, previewTokenMatches } from "../drawings/preview-token.js";
import { findFrame, takeOneFromStock } from "../frames/frames.repository.js";
import { getLeadTimeWorkingDays } from "../settings/settings.repository.js";
import {
  findOrderByDrawing,
  insertOrder,
  nextOrderSequence,
  type OrderWithJoins,
} from "./orders.repository.js";
import type { PlaceOrderInput } from "./orders.schemas.js";

export interface OrderConfirmation {
  orderNumber: string;
  estimatedDeliveryDate: string;
  frameName: string;
  priceCents: number;
  customerName: string;
  address: {
    street: string;
    houseNumber: string;
    postalCode: string;
    city: string;
    country: string;
  };
}

/** One identical answer for unknown, wrong token, malformed token and expired (SR-009, BR-013). */
export const drawingNotFound = () =>
  new AppError(
    404,
    "drawing_not_found",
    "This preview is no longer available. Please upload your photo again.",
  );

export function toConfirmation({
  order,
  frameName,
}: Pick<OrderWithJoins, "order" | "frameName">): OrderConfirmation {
  return {
    orderNumber: order.orderNumber,
    estimatedDeliveryDate: order.estimatedDeliveryDate,
    frameName,
    priceCents: order.priceCents,
    customerName: order.customerName,
    address: {
      street: order.street,
      houseNumber: order.houseNumber,
      postalCode: order.postalCode,
      city: order.city,
      country: order.country,
    },
  };
}

export interface OrdersServiceDeps {
  db: Database;
  clock: Clock;
}

export function createOrdersService({ db, clock }: OrdersServiceDeps) {
  /**
   * Places an order in one transaction (design, customer flow step 4). Check order after the body:
   * drawing + token -> already ordered (replay, BR-018) -> expired -> frame -> stock.
   */
  async function placeOrder(
    input: PlaceOrderInput,
    log: FastifyBaseLogger,
  ): Promise<{ replay: boolean; confirmation: OrderConfirmation }> {
    const now = clock();
    const result = await db.transaction(async (tx) => {
      const drawing = await findDrawingForUpdate(tx, input.drawingId);
      // Always compare, also for an unknown drawing, so both cost the same.
      const tokenOk = previewTokenMatches(
        input.previewToken,
        drawing?.previewTokenHash ?? NO_MATCH_HASH,
      );
      if (!drawing || !tokenOk) throw drawingNotFound();

      const existing = await findOrderByDrawing(tx, drawing.id);
      if (existing) return { replay: true, row: existing };

      if (isPreviewExpired(drawing.expiresAt, now)) throw drawingNotFound();

      const frame = await findFrame(tx, input.frameId);
      if (!frame)
        throw new AppError(
          422,
          "frame_not_found",
          "This frame is not available. Please choose another frame.",
        );
      const taken = await takeOneFromStock(tx, frame.id, now);
      if (!taken)
        throw new AppError(
          409,
          "frame_sold_out",
          "This frame just sold out. Please pick another frame.",
        );

      const sequence = await nextOrderSequence(tx, amsterdamYearOf(now));
      const orderDate = amsterdamDateOf(now);
      const leadTime = await getLeadTimeWorkingDays(tx);
      const order = await insertOrder(tx, {
        orderNumber: formatOrderNumber(amsterdamYearOf(now), sequence),
        drawingId: drawing.id,
        frameId: frame.id,
        status: "received",
        customerName: input.customer.name,
        customerEmail: input.customer.email,
        ...input.address,
        // Price copied from the frame at this moment (BR-012); never from the request.
        priceCents: taken.priceCents,
        orderDate,
        estimatedDeliveryDate: addWorkingDays(orderDate, leadTime),
        statusChangedAt: now,
        createdAt: now,
      });
      return { replay: false, row: { order, frameName: taken.name } };
    });

    if (result.replay) {
      log.info(
        { event: "order_replayed", orderNumber: result.row.order.orderNumber },
        "order confirmation replayed",
      );
    } else {
      log.info(
        {
          event: "order_placed",
          orderNumber: result.row.order.orderNumber,
          orderId: result.row.order.id,
        },
        "order placed",
      );
    }
    return { replay: result.replay, confirmation: toConfirmation(result.row) };
  }

  return { placeOrder };
}

export type OrdersService = ReturnType<typeof createOrdersService>;

export const orderNotFound = () => notFound("order_not_found", "This order does not exist.");

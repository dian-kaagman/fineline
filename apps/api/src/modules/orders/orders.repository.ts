import { asc, eq, inArray, sql } from "drizzle-orm";
import type { Executor } from "../../db/client.js";
import { drawings, orderNumberCounters, orders } from "../../db/schema.js";
import type { OrderStatus } from "../../domain/order-status.js";

export type OrderRow = typeof orders.$inferSelect;
export type NewOrderRow = typeof orders.$inferInsert;

/** Next sequence number for the Amsterdam year, from a per-year counter row (BR-007). */
export async function nextOrderSequence(db: Executor, year: number): Promise<number> {
  const rows = await db
    .insert(orderNumberCounters)
    .values({ year, lastValue: 1 })
    .onConflictDoUpdate({
      target: orderNumberCounters.year,
      set: { lastValue: sql`${orderNumberCounters.lastValue} + 1` },
    })
    .returning({ lastValue: orderNumberCounters.lastValue });
  return (rows[0] as { lastValue: number }).lastValue;
}

export async function insertOrder(db: Executor, row: NewOrderRow): Promise<OrderRow> {
  const rows = await db.insert(orders).values(row).returning();
  return rows[0] as OrderRow;
}

const orderWithJoins = {
  order: orders,
  // The frame as ordered (snapshot), not the frame's current name (Q-41).
  frameName: orders.frameName,
  drawing: {
    widthMm: drawings.widthMm,
    heightMm: drawings.heightMm,
    strokeCount: drawings.strokeCount,
    totalLengthMm: drawings.totalLengthMm,
    svgKey: drawings.svgKey,
    photoKey: drawings.photoKey,
    photoContentType: drawings.photoContentType,
    photoDeletedAt: drawings.photoDeletedAt,
    svgDeletedAt: drawings.svgDeletedAt,
  },
};

export type OrderWithJoins = {
  order: OrderRow;
  frameName: string;
  drawing: {
    widthMm: number;
    heightMm: number;
    strokeCount: number;
    totalLengthMm: number;
    svgKey: string;
    photoKey: string;
    photoContentType: string;
    photoDeletedAt: Date | null;
    svgDeletedAt: Date | null;
  };
};

function selectOrders(db: Executor) {
  return db
    .select(orderWithJoins)
    .from(orders)
    .innerJoin(drawings, eq(drawings.id, orders.drawingId));
}

export async function findOrderByDrawing(
  db: Executor,
  drawingId: string,
): Promise<OrderWithJoins | undefined> {
  const rows = await selectOrders(db).where(eq(orders.drawingId, drawingId));
  return rows[0];
}

export async function findOrder(db: Executor, id: string): Promise<OrderWithJoins | undefined> {
  const rows = await selectOrders(db).where(eq(orders.id, id));
  return rows[0];
}

/** Locks the order row for a status or date change in this transaction. */
export async function lockOrder(db: Executor, id: string): Promise<OrderRow | undefined> {
  const rows = await db.select().from(orders).where(eq(orders.id, id)).for("update");
  return rows[0];
}

/** Sorted by estimated delivery date, then order number (year, then sequence as a number). */
export async function listOrders(
  db: Executor,
  statuses: readonly OrderStatus[] | "all",
): Promise<OrderWithJoins[]> {
  const query = selectOrders(db);
  const filtered = statuses === "all" ? query : query.where(inArray(orders.status, [...statuses]));
  return filtered.orderBy(
    asc(orders.estimatedDeliveryDate),
    asc(sql`substring(${orders.orderNumber} from 4 for 4)`),
    asc(sql`substring(${orders.orderNumber} from 9)::integer`),
  );
}

export async function updateOrder(
  db: Executor,
  id: string,
  patch: Partial<
    Pick<OrderRow, "status" | "statusChangedAt" | "closedAt" | "estimatedDeliveryDate">
  >,
): Promise<void> {
  await db.update(orders).set(patch).where(eq(orders.id, id));
}

/** Orders closed at or before the cutoff whose original photo is still stored (BR-010). */
export async function findClosedOrderPhotos(
  db: Executor,
  closedBefore: Date,
): Promise<{ drawingId: string; photoKey: string }[]> {
  return db
    .select({ drawingId: drawings.id, photoKey: drawings.photoKey })
    .from(orders)
    .innerJoin(drawings, eq(drawings.id, orders.drawingId))
    .where(sql`${orders.closedAt} <= ${closedBefore} and ${drawings.photoDeletedAt} is null`);
}

/** Locks the order with this number for erasure. */
export async function lockOrderByNumber(
  db: Executor,
  orderNumber: string,
): Promise<OrderRow | undefined> {
  const rows = await db
    .select()
    .from(orders)
    .where(eq(orders.orderNumber, orderNumber))
    .for("update");
  return rows[0];
}

export const ERASED = "[erased]";

/** Blanks the customer's name, email and address; keeps number, price, dates, status and country. */
export async function eraseCustomerDetails(db: Executor, id: string, now: Date): Promise<void> {
  await db
    .update(orders)
    .set({
      customerName: ERASED,
      customerEmail: ERASED,
      street: ERASED,
      houseNumber: ERASED,
      postalCode: ERASED,
      city: ERASED,
      erasedAt: now,
    })
    .where(eq(orders.id, id));
}

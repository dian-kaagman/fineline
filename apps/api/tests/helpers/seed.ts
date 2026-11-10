import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { frames, orderNumberCounters, orders } from "../../src/db/schema.js";
import type { OrderStatus } from "../../src/domain/order-status.js";
import { jpegBytes, multipart, TINY_JPEG_BASE64 } from "./fixtures.js";
import { CSRF, type Harness } from "./harness.js";

export async function seedFrame(
  h: Harness,
  values: { name: string; widthMm?: number; heightMm?: number; priceCents: number; stock: number },
) {
  const photoKey = `frames/${randomUUID()}`;
  await h.storage.put(photoKey, Buffer.from(TINY_JPEG_BASE64, "base64"));
  const now = new Date(h.now);
  const [row] = await h.db
    .insert(frames)
    .values({
      widthMm: 210,
      heightMm: 297,
      ...values,
      photoKey,
      photoContentType: "image/jpeg",
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  return row!;
}

export async function frameStock(h: Harness, id: string): Promise<number> {
  const [row] = await h.db.select({ stock: frames.stock }).from(frames).where(eq(frames.id, id));
  return row!.stock;
}

export async function setOrderCounter(h: Harness, year: number, lastValue: number) {
  await h.db.insert(orderNumberCounters).values({ year, lastValue });
}

export async function orderCount(h: Harness): Promise<number> {
  const [row] = await h.db.select({ n: sql<number>`count(*)::int` }).from(orders);
  return row!.n;
}

export interface Preview {
  drawingId: string;
  previewToken: string;
  svg: string;
}

export async function createPreview(h: Harness): Promise<Preview> {
  const body = await multipart([
    { name: "photo", value: jpegBytes(), filename: "photo.jpg", type: "image/jpeg" },
  ]);
  const res = await h.request({
    method: "POST",
    url: "/api/v1/drawings",
    payload: body.payload,
    headers: body.headers,
  });
  if (res.statusCode !== 201) throw new Error(`upload failed: ${res.statusCode} ${res.body}`);
  return res.json<Preview>();
}

export function orderBody(
  preview: Preview,
  frameId: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    drawingId: preview.drawingId,
    previewToken: preview.previewToken,
    frameId,
    customer: { name: "Anna de Vries", email: "anna@example.nl" },
    address: {
      street: "Lindelaan",
      houseNumber: "12",
      postalCode: "3512 AB",
      city: "Utrecht",
      country: "NL",
    },
    acceptedPhotoTerms: true,
    ...overrides,
  };
}

export async function placeOrder(
  h: Harness,
  body: Record<string, unknown>,
  remoteAddress?: string,
) {
  return h.request({
    method: "POST",
    url: "/api/v1/orders",
    payload: body,
    ...(remoteAddress ? { remoteAddress } : {}),
  });
}

let clientCounter = 0;
/** A different client address per seeded order, so the order rate limit doesn't get in the way. */
const nextClient = () => `10.1.${Math.floor(++clientCounter / 250) % 250}.${clientCounter % 250}`;

/** Places an order through the API and returns its id and number. */
export async function seedOrder(h: Harness, frameId: string, remoteAddress?: string) {
  const preview = await createPreview(h);
  const res = await placeOrder(h, orderBody(preview, frameId), remoteAddress ?? nextClient());
  if (res.statusCode !== 201) throw new Error(`order failed: ${res.statusCode} ${res.body}`);
  const orderNumber = res.json<{ orderNumber: string }>().orderNumber;
  const [row] = await h.db.select().from(orders).where(eq(orders.orderNumber, orderNumber));
  return { id: row!.id, orderNumber, preview };
}

export async function setOrderStatus(h: Harness, id: string, status: OrderStatus, closedAt?: Date) {
  await h.db
    .update(orders)
    .set({ status, closedAt: closedAt ?? null, statusChangedAt: closedAt ?? new Date(h.now) })
    .where(eq(orders.id, id));
}

export function adminHeaders(cookie: string, unsafe = true): Record<string, string> {
  return { cookie: `fineline_admin=${cookie}`, ...(unsafe ? CSRF : {}) };
}

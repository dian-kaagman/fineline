import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { orders } from "../src/db/schema.js";
import { drawingSvg, workerSuccess } from "./helpers/fixtures.js";
import { useHarness } from "./helpers/harness.js";
import {
  adminHeaders,
  frameStock,
  seedFrame,
  seedOrder,
  setOrderCounter,
  setOrderStatus,
} from "./helpers/seed.js";

const h = useHarness();
let cookie: string;

beforeEach(async () => {
  cookie = await h.login();
});

const get = (url: string) =>
  h.request({ method: "GET", url, headers: adminHeaders(cookie, false) });
const post = (url: string, payload?: Record<string, unknown>) =>
  h.request({
    method: "POST",
    url,
    headers: adminHeaders(cookie),
    ...(payload ? { payload } : {}),
  });
const patch = (url: string, payload: Record<string, unknown>) =>
  h.request({ method: "PATCH", url, headers: adminHeaders(cookie), payload });

async function orderWithStatus(
  frameId: string,
  status: Parameters<typeof setOrderStatus>[2],
  at?: string,
) {
  if (at) h.setNow(at);
  const order = await seedOrder(h, frameId);
  if (status !== "received")
    await setOrderStatus(
      h,
      order.id,
      status,
      ["shipped", "cancelled"].includes(status) ? new Date(h.now) : undefined,
    );
  return order;
}

describe("admin order list", () => {
  it("AC-029 lists open orders earliest delivery date first; filters on one status or all", async () => {
    await setOrderCounter(h, 2026, 38);
    const oak = await seedFrame(h, { name: "Oak A4", priceCents: 4995, stock: 10 });
    const o39 = await orderWithStatus(oak.id, "shipped", "2026-11-03T10:00:00Z"); // delivery Thu 12 Nov
    const o40 = await orderWithStatus(oak.id, "drawn", "2026-11-04T10:00:00Z"); // delivery Fri 13 Nov
    const o41 = await orderWithStatus(oak.id, "cancelled", "2026-11-05T10:00:00Z");
    const o42 = await orderWithStatus(oak.id, "received", "2026-11-06T10:00:00Z"); // delivery Tue 17 Nov
    expect([o39, o40, o41, o42].map((o) => o.orderNumber)).toEqual([
      "FL-2026-0039",
      "FL-2026-0040",
      "FL-2026-0041",
      "FL-2026-0042",
    ]);

    const open = await get("/api/v1/admin/orders");
    expect(open.statusCode).toBe(200);
    expect(open.json().orders).toEqual([
      expect.objectContaining({
        orderNumber: "FL-2026-0040",
        status: "drawn",
        orderDate: "2026-11-04",
        estimatedDeliveryDate: "2026-11-13",
        customerName: "Anna de Vries",
        frameName: "Oak A4",
      }),
      expect.objectContaining({
        orderNumber: "FL-2026-0042",
        status: "received",
        orderDate: "2026-11-06",
        estimatedDeliveryDate: "2026-11-17",
      }),
    ]);
    const received = await get("/api/v1/admin/orders?status=received");
    expect(received.json().orders.map((o: { orderNumber: string }) => o.orderNumber)).toEqual([
      "FL-2026-0042",
    ]);
    const all = await get("/api/v1/admin/orders?status=all");
    expect(all.json().orders.map((o: { orderNumber: string }) => o.orderNumber)).toEqual([
      "FL-2026-0039",
      "FL-2026-0040",
      "FL-2026-0041",
      "FL-2026-0042",
    ]);
    const bad = await get("/api/v1/admin/orders?status=lost");
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.code).toBe("validation_failed");
  });
});

describe("admin order detail and files", () => {
  it("AC-030 opens an order with all its details; opening and viewing the drawing keep the status", async () => {
    h.setNow("2026-11-06T13:00:00Z");
    await setOrderCounter(h, 2026, 41);
    const oak = await seedFrame(h, { name: "Oak A4", priceCents: 4995, stock: 3 });
    const order = await seedOrder(h, oak.id);
    const res = await get(`/api/v1/admin/orders/${order.id}`);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      id: order.id,
      orderNumber: "FL-2026-0042",
      status: "received",
      orderDate: "2026-11-06",
      estimatedDeliveryDate: "2026-11-17",
      customerName: "Anna de Vries",
      frameName: "Oak A4",
      createdAt: "2026-11-06T13:00:00.000Z",
      customerEmail: "anna@example.nl",
      address: {
        street: "Lindelaan",
        houseNumber: "12",
        postalCode: "3512 AB",
        city: "Utrecht",
        country: "NL",
      },
      frameId: oak.id,
      priceCents: 4995,
      drawing: { widthMm: 180, heightMm: 267, strokeCount: 3, totalLengthMm: 300 },
      photoAvailable: true,
      allowedNextStatuses: ["cancelled"],
      statusChangedAt: "2026-11-06T13:00:00.000Z",
    });
    const photo = await get(`/api/v1/admin/orders/${order.id}/photo`);
    expect(photo.statusCode).toBe(200);
    expect(photo.headers["content-type"]).toBe("image/jpeg");
    expect(photo.headers["x-content-type-options"]).toBe("nosniff");
    expect(photo.headers["content-security-policy"]).toContain("sandbox");
    expect(photo.headers["cache-control"]).toBe("private, no-store");

    const view = await get(`/api/v1/admin/orders/${order.id}/drawing.svg`);
    expect(view.statusCode).toBe(200);
    expect((await get(`/api/v1/admin/orders/${order.id}`)).json().status).toBe("received");
  });

  it("AC-031 downloading the SVG for the arm sends FL-2026-0042.svg as an inert attachment and starts the drawing", async () => {
    await setOrderCounter(h, 2026, 41);
    const oak = await seedFrame(h, { name: "Oak A4", priceCents: 4995, stock: 3 });
    const order = await seedOrder(h, oak.id);
    const res = await post(`/api/v1/admin/orders/${order.id}/drawing-download`);
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("image/svg+xml");
    expect(res.headers["content-disposition"]).toBe('attachment; filename="FL-2026-0042.svg"');
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["content-security-policy"]).toBe(
      "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    );
    expect(res.headers["cache-control"]).toBe("private, no-store");
    expect(res.body).toBe(order.preview.svg);
    const detail = (await get(`/api/v1/admin/orders/${order.id}`)).json();
    expect(detail.status).toBe("drawing");
    expect(detail.allowedNextStatuses).toEqual(["drawn", "cancelled"]);
  });

  it("AC-032 downloading again for a redo and viewing give the same bytes and keep the status drawn", async () => {
    const oak = await seedFrame(h, { name: "Oak A4", priceCents: 4995, stock: 3 });
    const order = await seedOrder(h, oak.id);
    const first = await post(`/api/v1/admin/orders/${order.id}/drawing-download`);
    await setOrderStatus(h, order.id, "drawn");
    const again = await post(`/api/v1/admin/orders/${order.id}/drawing-download`);
    const view = await get(`/api/v1/admin/orders/${order.id}/drawing.svg`);
    expect(again.rawPayload.equals(first.rawPayload)).toBe(true);
    expect(view.rawPayload.equals(first.rawPayload)).toBe(true);
    expect(view.headers["content-disposition"]).toBe(
      `attachment; filename="${order.orderNumber}.svg"`,
    );
    expect((await get(`/api/v1/admin/orders/${order.id}`)).json().status).toBe("drawn");
  });

  it("AC-021 the downloaded SVG is byte-for-byte the previewed SVG", async () => {
    const svg = drawingSvg({ strokes: 7, length: 33 });
    h.worker.reply = () => workerSuccess(svg);
    const oak = await seedFrame(h, { name: "Oak A4", priceCents: 4995, stock: 3 });
    const order = await seedOrder(h, oak.id);
    expect(order.preview.svg).toBe(svg);
    const res = await post(`/api/v1/admin/orders/${order.id}/drawing-download`);
    expect(res.rawPayload.equals(Buffer.from(svg, "utf8"))).toBe(true);
  });

  it("answers 404 for unknown and malformed order IDs (SR-008)", async () => {
    expect(
      (await get("/api/v1/admin/orders/0b6f1a3e-8c5d-4e7f-9a2b-1c3d4e5f6a7b")).statusCode,
    ).toBe(404);
    expect((await get("/api/v1/admin/orders/not-a-uuid/drawing.svg")).statusCode).toBe(404);
    expect(
      (await get("/api/v1/admin/orders/0b6f1a3e-8c5d-4e7f-9a2b-1c3d4e5f6a7b/photo")).statusCode,
    ).toBe(404);
  });
});

describe("admin status changes", () => {
  it("AC-033 moves an order from drawing to drawn, ready to ship and shipped", async () => {
    const oak = await seedFrame(h, { name: "Oak A4", priceCents: 4995, stock: 3 });
    const order = await orderWithStatus(oak.id, "drawing");
    for (const status of ["drawn", "ready_to_ship", "shipped"]) {
      const res = await post(`/api/v1/admin/orders/${order.id}/status`, { status });
      expect(res.statusCode).toBe(200);
      expect(res.json().status).toBe(status);
    }
    expect((await get(`/api/v1/admin/orders/${order.id}`)).json().allowedNextStatuses).toEqual([]);
  });

  it("AC-034 rejects skipping, going back and late cancelling, naming the current status", async () => {
    const oak = await seedFrame(h, { name: "Oak A4", priceCents: 4995, stock: 3 });
    const o43 = await orderWithStatus(oak.id, "received");
    const o44 = await orderWithStatus(oak.id, "drawn");
    const attempts = [
      [o43, "shipped", "is Received now, so it can't be moved to Shipped"],
      [o44, "drawing", "is Drawn now, so it can't be moved to Drawing"],
      [o44, "cancelled", "is Drawn now, so it can't be moved to Cancelled"],
    ] as const;
    for (const [order, status, message] of attempts) {
      const res = await post(`/api/v1/admin/orders/${order.id}/status`, { status });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("invalid_transition");
      expect(res.json().error.message).toContain(`${order.orderNumber} ${message}`);
    }
    expect((await get(`/api/v1/admin/orders/${o43.id}`)).json().status).toBe("received");
    expect((await get(`/api/v1/admin/orders/${o44.id}`)).json().status).toBe("drawn");
    expect(await frameStock(h, oak.id)).toBe(1);
  });

  it("refuses drawing through the status action: only the download for the arm starts it", async () => {
    const oak = await seedFrame(h, { name: "Oak A4", priceCents: 4995, stock: 3 });
    const order = await orderWithStatus(oak.id, "received");
    const res = await post(`/api/v1/admin/orders/${order.id}/status`, { status: "drawing" });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("invalid_transition");
    const bad = await post(`/api/v1/admin/orders/${order.id}/status`, { status: "lost" });
    expect(bad.statusCode).toBe(400);
  });

  it("AC-035 cancelling a received order returns the frame to stock and offers it again", async () => {
    const oak = await seedFrame(h, { name: "Oak A4", priceCents: 4995, stock: 1 });
    const order = await seedOrder(h, oak.id);
    expect(await frameStock(h, oak.id)).toBe(0);
    const res = await post(`/api/v1/admin/orders/${order.id}/status`, { status: "cancelled" });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("cancelled");
    expect(await frameStock(h, oak.id)).toBe(1);
    const offered = await h.request({ method: "GET", url: "/api/v1/frames" });
    expect(offered.json().frames.map((f: { name: string }) => f.name)).toEqual(["Oak A4"]);
    const [row] = await h.db.select().from(orders).where(eq(orders.id, order.id));
    expect(row!.closedAt).not.toBeNull();
  });

  it("AC-036 shipped and cancelled orders keep their status and delivery date; stock does not change", async () => {
    const oak = await seedFrame(h, { name: "Oak A4", priceCents: 4995, stock: 5 });
    const o39 = await orderWithStatus(oak.id, "shipped");
    const o41 = await orderWithStatus(oak.id, "cancelled");
    const stock = await frameStock(h, oak.id);
    expect(
      (await post(`/api/v1/admin/orders/${o39.id}/status`, { status: "cancelled" })).statusCode,
    ).toBe(409);
    expect(
      (await post(`/api/v1/admin/orders/${o41.id}/status`, { status: "drawn" })).statusCode,
    ).toBe(409);
    for (const order of [o39, o41]) {
      const res = await patch(`/api/v1/admin/orders/${order.id}`, {
        estimatedDeliveryDate: "2026-12-01",
      });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("order_closed");
      expect((await get(`/api/v1/admin/orders/${order.id}`)).json().estimatedDeliveryDate).toBe(
        "2026-11-17",
      );
    }
    expect((await get(`/api/v1/admin/orders/${o39.id}`)).json().status).toBe("shipped");
    expect((await get(`/api/v1/admin/orders/${o41.id}`)).json().status).toBe("cancelled");
    expect(await frameStock(h, oak.id)).toBe(stock);
  });
});

describe("admin delivery date changes", () => {
  it("AC-037 postpones one order's delivery date; other orders keep theirs", async () => {
    const oak = await seedFrame(h, { name: "Oak A4", priceCents: 4995, stock: 5 });
    const o42 = await orderWithStatus(oak.id, "received", "2026-11-06T10:00:00Z");
    const o43 = await orderWithStatus(oak.id, "received", "2026-11-09T10:00:00Z");
    cookie = await h.login(); // the session from 6 November has been idle too long by now
    expect((await get(`/api/v1/admin/orders/${o43.id}`)).json().estimatedDeliveryDate).toBe(
      "2026-11-18",
    );
    const res = await patch(`/api/v1/admin/orders/${o42.id}`, {
      estimatedDeliveryDate: "2026-11-20",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().estimatedDeliveryDate).toBe("2026-11-20");
    expect((await get(`/api/v1/admin/orders/${o43.id}`)).json().estimatedDeliveryDate).toBe(
      "2026-11-18",
    );
  });

  it("AC-038 rejects a date before the order date and keeps the old one", async () => {
    const oak = await seedFrame(h, { name: "Oak A4", priceCents: 4995, stock: 5 });
    const o42 = await orderWithStatus(oak.id, "received", "2026-11-06T10:00:00Z");
    const res = await patch(`/api/v1/admin/orders/${o42.id}`, {
      estimatedDeliveryDate: "2026-11-05",
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("delivery_date_before_order_date");
    expect(res.json().error.message).toBe("The delivery date can't be before the order date.");
    expect((await get(`/api/v1/admin/orders/${o42.id}`)).json().estimatedDeliveryDate).toBe(
      "2026-11-17",
    );
    // The order date itself is allowed; malformed dates and extra fields are validation errors.
    expect(
      (await patch(`/api/v1/admin/orders/${o42.id}`, { estimatedDeliveryDate: "2026-11-06" }))
        .statusCode,
    ).toBe(200);
    expect(
      (await patch(`/api/v1/admin/orders/${o42.id}`, { estimatedDeliveryDate: "2026-02-30" }))
        .statusCode,
    ).toBe(400);
    expect(
      (
        await patch(`/api/v1/admin/orders/${o42.id}`, {
          estimatedDeliveryDate: "2026-11-20",
          status: "shipped",
        })
      ).json().error.code,
    ).toBe("validation_failed");
  });
});

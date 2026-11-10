import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { orders } from "../src/db/schema.js";
import { useHarness } from "./helpers/harness.js";
import {
  createPreview,
  frameStock,
  orderBody,
  orderCount,
  placeOrder,
  seedFrame,
  setOrderCounter,
} from "./helpers/seed.js";

const h = useHarness();

const NOT_AVAILABLE = {
  error: {
    code: "drawing_not_found",
    message: "This preview is no longer available. Please upload your photo again.",
  },
};

describe("GET /api/v1/frames", () => {
  it("AC-013 offers only frames in stock, with size, price and photo, cheapest first, without stock counts", async () => {
    const oak = await seedFrame(h, { name: "Oak A4", priceCents: 4995, stock: 3 });
    await seedFrame(h, { name: "Black A4", priceCents: 3995, stock: 0 });
    const walnut = await seedFrame(h, {
      name: "Walnut 30x40",
      widthMm: 300,
      heightMm: 400,
      priceCents: 2995,
      stock: 4,
    });
    const res = await h.request({ method: "GET", url: "/api/v1/frames" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      frames: [
        {
          id: walnut.id,
          name: "Walnut 30x40",
          widthMm: 300,
          heightMm: 400,
          priceCents: 2995,
          photoUrl: `/api/v1/frames/${walnut.id}/photo`,
        },
        {
          id: oak.id,
          name: "Oak A4",
          widthMm: 210,
          heightMm: 297,
          priceCents: 4995,
          photoUrl: `/api/v1/frames/${oak.id}/photo`,
        },
      ],
    });
  });

  it("serves the photo of every existing frame, also out of stock, as an inert file (SR-007)", async () => {
    const black = await seedFrame(h, { name: "Black A4", priceCents: 3995, stock: 0 });
    const res = await h.request({ method: "GET", url: `/api/v1/frames/${black.id}/photo` });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("image/jpeg");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["content-security-policy"]).toContain("sandbox");
    expect(res.rawPayload.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));

    const missing = await h.request({
      method: "GET",
      url: "/api/v1/frames/3f1c1a52-9a1b-4c3d-8e2f-000000000000/photo",
    });
    expect(missing.statusCode).toBe(404);
    const malformed = await h.request({ method: "GET", url: "/api/v1/frames/not-a-uuid/photo" });
    expect(malformed.statusCode).toBe(404);
  });
});

describe("POST /api/v1/orders", () => {
  it("AC-018 places a valid order: number, price, delivery date, status received, stock taken", async () => {
    h.setNow("2026-11-06T13:00:00Z"); // 14:00 Friday in Amsterdam
    await setOrderCounter(h, 2026, 41);
    const oak = await seedFrame(h, { name: "Oak A4", priceCents: 4995, stock: 3 });
    const preview = await createPreview(h);
    const res = await placeOrder(h, orderBody(preview, oak.id));
    expect(res.statusCode).toBe(201);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.json()).toEqual({
      orderNumber: "FL-2026-0042",
      estimatedDeliveryDate: "2026-11-17",
      frameName: "Oak A4",
      priceCents: 4995,
      customerName: "Anna de Vries",
      address: {
        street: "Lindelaan",
        houseNumber: "12",
        postalCode: "3512 AB",
        city: "Utrecht",
        country: "NL",
      },
    });
    const [order] = await h.db.select().from(orders);
    expect(order).toMatchObject({
      status: "received",
      orderDate: "2026-11-06",
      priceCents: 4995,
      drawingId: preview.drawingId,
    });
    expect(await frameStock(h, oak.id)).toBe(2);
  });

  it("AC-019 the first order at 00:30 on 1 January 2027 in Amsterdam is FL-2027-0001", async () => {
    await setOrderCounter(h, 2026, 137);
    h.setNow("2026-12-31T23:30:00Z");
    const oak = await seedFrame(h, { name: "Oak A4", priceCents: 4995, stock: 3 });
    const res = await placeOrder(h, orderBody(await createPreview(h), oak.id));
    expect(res.json().orderNumber).toBe("FL-2027-0001");
  });

  it("AC-048 uses the Amsterdam date for the order date and delivery date", async () => {
    h.setNow("2026-11-05T23:30:00Z");
    const oak = await seedFrame(h, { name: "Oak A4", priceCents: 4995, stock: 3 });
    const res = await placeOrder(h, orderBody(await createPreview(h), oak.id));
    expect(res.json().estimatedDeliveryDate).toBe("2026-11-17");
    const [order] = await h.db.select().from(orders);
    expect(order!.orderDate).toBe("2026-11-06");
  });

  it("AC-014 rejects missing or invalid details per field, without echoing them, and creates nothing", async () => {
    const oak = await seedFrame(h, { name: "Oak A4", priceCents: 4995, stock: 3 });
    const preview = await createPreview(h);
    const res = await placeOrder(
      h,
      orderBody(preview, oak.id, {
        customer: { name: "Anna de Vries", email: "anna@example" },
        address: {
          street: "Lindelaan",
          houseNumber: "12",
          postalCode: "12345",
          city: "",
          country: "NL",
        },
      }),
    );
    expect(res.statusCode).toBe(400);
    const error = res.json().error;
    expect(error.code).toBe("validation_failed");
    expect(error.details.map((d: { field: string }) => d.field).sort()).toEqual([
      "address.city",
      "address.postalCode",
      "customer.email",
    ]);
    expect(res.body).not.toContain("anna@example");
    expect(res.body).not.toContain("12345");
    expect(await orderCount(h)).toBe(0);
    expect(await frameStock(h, oak.id)).toBe(3);
  });

  it("checks postal codes per country: NL 1234 AB (space optional), BE four digits", async () => {
    const oak = await seedFrame(h, { name: "Oak A4", priceCents: 4995, stock: 10 });
    const ok = await placeOrder(
      h,
      orderBody(await createPreview(h), oak.id, {
        address: {
          street: "Grote Markt",
          houseNumber: "1",
          postalCode: "1000",
          city: "Brussel",
          country: "BE",
        },
      }),
    );
    expect(ok.statusCode).toBe(201);
    const nl = await placeOrder(
      h,
      orderBody(await createPreview(h), oak.id, {
        address: {
          street: "Lindelaan",
          houseNumber: "12",
          postalCode: "3512ab",
          city: "Utrecht",
          country: "NL",
        },
      }),
    );
    expect(nl.statusCode).toBe(201);
    expect(nl.json().address.postalCode).toBe("3512 AB");
    const bad = await placeOrder(
      h,
      orderBody(await createPreview(h), oak.id, {
        address: {
          street: "Grote Markt",
          houseNumber: "1",
          postalCode: "1000 AB",
          city: "Brussel",
          country: "BE",
        },
      }),
    );
    expect(bad.json().error.details).toEqual([
      {
        field: "address.postalCode",
        message: "Enter a Belgian postal code of 4 digits, like 1000",
      },
    ]);
  });

  it("rejects control characters and line breaks in names and addresses (SR-016)", async () => {
    const oak = await seedFrame(h, { name: "Oak A4", priceCents: 4995, stock: 3 });
    const res = await placeOrder(
      h,
      orderBody(await createPreview(h), oak.id, {
        customer: { name: "Anna\nde Vries", email: "anna@example.nl" },
      }),
    );
    expect(res.statusCode).toBe(400);
    expect(res.json().error.details).toEqual([
      { field: "customer.name", message: "Must not contain control characters or line breaks" },
    ]);
  });

  it("AC-015 rejects a delivery address in Germany and takes no stock", async () => {
    const oak = await seedFrame(h, { name: "Oak A4", priceCents: 4995, stock: 3 });
    const res = await placeOrder(
      h,
      orderBody(await createPreview(h), oak.id, {
        address: {
          street: "Unter den Linden",
          houseNumber: "5",
          postalCode: "10117",
          city: "Berlin",
          country: "DE",
        },
      }),
    );
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toEqual({
      code: "country_not_supported",
      message: "We deliver to the Netherlands and Belgium only.",
      details: [
        { field: "address.country", message: "We deliver to the Netherlands and Belgium only" },
      ],
    });
    expect(await orderCount(h)).toBe(0);
    expect(await frameStock(h, oak.id)).toBe(3);
  });

  it("AC-016 rejects an order without agreement to the photo terms", async () => {
    const oak = await seedFrame(h, { name: "Oak A4", priceCents: 4995, stock: 3 });
    const res = await placeOrder(
      h,
      orderBody(await createPreview(h), oak.id, { acceptedPhotoTerms: false }),
    );
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("photo_terms_not_accepted");
    expect(await orderCount(h)).toBe(0);
  });

  it("AC-059 rejects an extra priceCents or status field, naming it, and creates nothing", async () => {
    const oak = await seedFrame(h, { name: "Oak A4", priceCents: 4995, stock: 3 });
    const preview = await createPreview(h);
    for (const [field, value] of [
      ["priceCents", 1],
      ["status", "shipped"],
    ] as const) {
      const res = await placeOrder(h, orderBody(preview, oak.id, { [field]: value }));
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toEqual({
        code: "validation_failed",
        message: "Some fields are missing or invalid.",
        details: [{ field, message: "Unexpected field" }],
      });
    }
    expect(await orderCount(h)).toBe(0);
    expect(await frameStock(h, oak.id)).toBe(3);
  });

  it("AC-022 AC-010 answers identically for a missing or wrong token, an unknown preview and an expired one", async () => {
    const oak = await seedFrame(h, { name: "Oak A4", priceCents: 4995, stock: 3 });
    const preview = await createPreview(h);
    const answers = [
      await placeOrder(h, orderBody(preview, oak.id, { previewToken: "x".repeat(43) })),
      await placeOrder(h, orderBody(preview, oak.id, { previewToken: "not-even-base64url!" })),
      await placeOrder(
        h,
        orderBody(preview, oak.id, { drawingId: "5b1d7d39-1f1e-4c8e-9d43-2f0c7c1f0a11" }),
      ),
    ];
    // Missing token: a schema error (400) comes before the drawing check, so it never reveals anything.
    const missing = await placeOrder(h, { ...orderBody(preview, oak.id), previewToken: undefined });
    expect(missing.statusCode).toBe(400);

    h.advance(24 * 3_600_000);
    answers.push(await placeOrder(h, orderBody(preview, oak.id)));
    for (const res of answers) {
      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual(NOT_AVAILABLE);
    }
    expect(await orderCount(h)).toBe(0);
    expect(await frameStock(h, oak.id)).toBe(3);
  });

  it("AC-022 an already ordered preview named without its token gets the same not-available answer", async () => {
    const oak = await seedFrame(h, { name: "Oak A4", priceCents: 4995, stock: 3 });
    const preview = await createPreview(h);
    expect((await placeOrder(h, orderBody(preview, oak.id))).statusCode).toBe(201);
    const res = await placeOrder(h, orderBody(preview, oak.id, { previewToken: "y".repeat(43) }));
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual(NOT_AVAILABLE);
  });

  it("AC-058 a retry with the same preview and token returns the original confirmation and changes nothing", async () => {
    await setOrderCounter(h, 2026, 41);
    const oak = await seedFrame(h, { name: "Oak A4", priceCents: 4995, stock: 3 });
    const walnut = await seedFrame(h, {
      name: "Walnut 30x40",
      widthMm: 300,
      heightMm: 400,
      priceCents: 5995,
      stock: 4,
    });
    const preview = await createPreview(h);
    const first = await placeOrder(h, orderBody(preview, oak.id));
    expect(first.statusCode).toBe(201);

    h.advance(25 * 3_600_000); // also after the 24 h preview expiry
    const retry = await placeOrder(
      h,
      orderBody(preview, walnut.id, {
        customer: { name: "Someone Else", email: "other@example.nl" },
        address: {
          street: "Kerkstraat",
          houseNumber: "1",
          postalCode: "1017 GB",
          city: "Amsterdam",
          country: "NL",
        },
      }),
    );
    expect(retry.statusCode).toBe(200);
    expect(retry.json()).toEqual(first.json());
    expect(retry.json()).toMatchObject({
      orderNumber: "FL-2026-0042",
      priceCents: 4995,
      estimatedDeliveryDate: "2026-11-17",
    });
    expect(await orderCount(h)).toBe(1);
    expect(await frameStock(h, oak.id)).toBe(2);
    expect(await frameStock(h, walnut.id)).toBe(4);
  });

  it("AC-020 sells the last frame only once when two customers order at the same moment", async () => {
    const oak = await seedFrame(h, { name: "Oak A4", priceCents: 4995, stock: 1 });
    const walnut = await seedFrame(h, {
      name: "Walnut 30x40",
      widthMm: 300,
      heightMm: 400,
      priceCents: 5995,
      stock: 4,
    });
    const a = await createPreview(h);
    const b = await createPreview(h);
    const results = await Promise.all([
      placeOrder(h, orderBody(a, oak.id), "10.0.0.1"),
      placeOrder(h, orderBody(b, oak.id), "10.0.0.2"),
    ]);
    const statuses = results.map((r) => r.statusCode).sort();
    expect(statuses).toEqual([201, 409]);
    const loser = results.find((r) => r.statusCode === 409)!;
    expect(loser.json().error).toEqual({
      code: "frame_sold_out",
      message: "This frame just sold out. Please pick another frame.",
    });
    expect(await orderCount(h)).toBe(1);
    expect(await frameStock(h, oak.id)).toBe(0);

    // The other customer keeps their preview and orders another frame.
    const loserPreview = results[0].statusCode === 409 ? a : b;
    const retry = await placeOrder(h, orderBody(loserPreview, walnut.id), "10.0.0.3");
    expect(retry.statusCode).toBe(201);
    expect(retry.json().frameName).toBe("Walnut 30x40");
  });

  it("answers frame_sold_out for stock 0 and frame_not_found for an unknown frame", async () => {
    const black = await seedFrame(h, { name: "Black A4", priceCents: 3995, stock: 0 });
    const preview = await createPreview(h);
    const soldOut = await placeOrder(h, orderBody(preview, black.id));
    expect(soldOut.statusCode).toBe(409);
    const unknown = await placeOrder(h, orderBody(preview, "0b6f1a3e-8c5d-4e7f-9a2b-1c3d4e5f6a7b"));
    expect(unknown.statusCode).toBe(422);
    expect(unknown.json().error.code).toBe("frame_not_found");
  });

  it("AC-042 copies the price at ordering time: a later price change keeps the order's price", async () => {
    const oak = await seedFrame(h, { name: "Oak A4", priceCents: 4995, stock: 3 });
    await placeOrder(h, orderBody(await createPreview(h), oak.id));
    await h.db.execute(sql`update frames set price_cents = 5495`);
    const [order] = await h.db.select().from(orders).where(eq(orders.frameId, oak.id));
    expect(order!.priceCents).toBe(4995);
  });

  it("AC-060 refuses the 6th order request from one address in an hour, also with a made-up X-Forwarded-For", async () => {
    const oak = await seedFrame(h, { name: "Oak A4", priceCents: 4995, stock: 10 });
    h.setNow("2026-11-06T13:00:00Z"); // 14:00 Amsterdam
    const previews = [];
    for (let i = 0; i < 6; i++) previews.push(await createPreview(h));
    for (let i = 0; i < 5; i++) {
      expect((await placeOrder(h, orderBody(previews[i]!, oak.id), "192.0.2.10")).statusCode).toBe(
        201,
      );
      h.advance(6 * 60_000);
    }
    h.setNow("2026-11-06T13:40:00Z");
    const res = await h.request({
      method: "POST",
      url: "/api/v1/orders",
      payload: orderBody(previews[5]!, oak.id),
      remoteAddress: "192.0.2.10",
      headers: { "x-forwarded-for": "1.2.3.4" },
    });
    expect(res.statusCode).toBe(429);
    expect(res.json().error).toEqual({
      code: "rate_limited",
      message: "Too many tries in a short time. Please wait 20 minutes and try again.",
    });
    expect(res.headers["retry-after"]).toBe("1200");
    expect(await orderCount(h)).toBe(5);
    expect(await frameStock(h, oak.id)).toBe(5);
  });

  it("SR-016 rejects bidi overrides and Unicode line separators in names and addresses", async () => {
    const oak = await seedFrame(h, { name: "Oak A4", priceCents: 4995, stock: 3 });
    const preview = await createPreview(h);
    for (const name of ["Anna \u202Eseirv ed", "Anna\u2066x\u2069", "Anna\u2028de Vries"]) {
      const res = await placeOrder(
        h,
        orderBody(preview, oak.id, { customer: { name, email: "anna@example.nl" } }),
      );
      expect(res.statusCode).toBe(400);
      expect(res.json().error.details).toEqual([
        { field: "customer.name", message: "Must not contain control characters or line breaks" },
      ]);
    }
    const ok = await placeOrder(
      h,
      orderBody(preview, oak.id, { customer: { name: "Zoë Ünal", email: "zoe@example.nl" } }),
    );
    expect(ok.statusCode).toBe(201);
  });

  it("answers 415 for a body that is not JSON (contract)", async () => {
    const res = await h.request({
      method: "POST",
      url: "/api/v1/orders",
      payload: "drawingId=1",
      headers: { "content-type": "text/plain" },
    });
    expect(res.statusCode).toBe(415);
    expect(res.json().error.code).toBe("unsupported_media_type");
  });

  it("AC-058 parallel replays of one order create one order and return the same confirmation", async () => {
    const oak = await seedFrame(h, { name: "Oak A4", priceCents: 4995, stock: 3 });
    const preview = await createPreview(h);
    const results = await Promise.all(
      [1, 2, 3].map((i) => placeOrder(h, orderBody(preview, oak.id), `10.3.0.${i}`)),
    );
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 200, 201]);
    expect(new Set(results.map((r) => r.json().orderNumber)).size).toBe(1);
    expect(await orderCount(h)).toBe(1);
    expect(await frameStock(h, oak.id)).toBe(2);
  });

  it("AC-060 replays and rejected input don't use up the per-address order budget (Q-36)", async () => {
    const oak = await seedFrame(h, { name: "Oak A4", priceCents: 4995, stock: 10 });
    const first = await createPreview(h);
    expect((await placeOrder(h, orderBody(first, oak.id), "192.0.2.20")).statusCode).toBe(201);
    for (let i = 0; i < 6; i++) {
      expect((await placeOrder(h, orderBody(first, oak.id), "192.0.2.20")).statusCode).toBe(200);
      expect(
        (await placeOrder(h, orderBody(first, oak.id, { acceptedPhotoTerms: false }), "192.0.2.20"))
          .statusCode,
      ).toBe(400);
    }
    // Four more real orders fit in the budget of 5; the next one is refused.
    for (let i = 0; i < 4; i++) {
      expect(
        (await placeOrder(h, orderBody(await createPreview(h), oak.id), "192.0.2.20")).statusCode,
      ).toBe(201);
    }
    expect(
      (await placeOrder(h, orderBody(await createPreview(h), oak.id), "192.0.2.20")).statusCode,
    ).toBe(429);
  });

  it("SR-017 counts orders before they run: parallel requests can't pass the limit together", async () => {
    const oak = await seedFrame(h, { name: "Oak A4", priceCents: 4995, stock: 20 });
    const previews = [];
    for (let i = 0; i < 8; i++) previews.push(await createPreview(h));
    const results = await Promise.all(
      previews.map((p) => placeOrder(h, orderBody(p, oak.id), "192.0.2.30")),
    );
    expect(results.filter((r) => r.statusCode === 201)).toHaveLength(5);
    expect(results.filter((r) => r.statusCode === 429)).toHaveLength(3);
  });

  it("Q-41 keeps the frame name as ordered: renaming the frame doesn't change the order or its replay", async () => {
    const oak = await seedFrame(h, { name: "Oak A4", priceCents: 4995, stock: 3 });
    const preview = await createPreview(h);
    expect((await placeOrder(h, orderBody(preview, oak.id))).json().frameName).toBe("Oak A4");
    await h.db.execute(sql`update frames set name = 'Walnut A4', width_mm = 220`);
    const replay = await placeOrder(h, orderBody(preview, oak.id));
    expect(replay.statusCode).toBe(200);
    expect(replay.json().frameName).toBe("Oak A4");
    const [order] = await h.db.select().from(orders);
    expect(order).toMatchObject({ frameName: "Oak A4", frameWidthMm: 210, frameHeightMm: 297 });
  });

  it("answers malformed JSON and unknown routes in the error shape", async () => {
    const res = await h.request({
      method: "POST",
      url: "/api/v1/orders",
      payload: "{not json",
      headers: { "content-type": "application/json" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("validation_failed");
    expect(res.body).not.toContain("not json");
    const unknown = await h.request({ method: "GET", url: "/api/v1/nope" });
    expect(unknown.statusCode).toBe(404);
    expect(unknown.json()).toEqual({ error: { code: "not_found", message: "Not found." } });
  });
});

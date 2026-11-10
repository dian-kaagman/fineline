import { beforeEach, describe, expect, it } from "vitest";
import { frames, orders } from "../src/db/schema.js";
import { jpegWithGpsExif, multipart, SVG_FILE, TINY_WEBP_BASE64 } from "./helpers/fixtures.js";
import { useHarness } from "./helpers/harness.js";
import {
  adminHeaders,
  createPreview,
  frameStock,
  orderBody,
  placeOrder,
  seedFrame,
  seedOrder,
} from "./helpers/seed.js";

const h = useHarness();
let cookie: string;

beforeEach(async () => {
  cookie = await h.login();
});

type Part = Parameters<typeof multipart>[0][number];

function frameParts(values: Record<string, string>, photo?: Part): Part[] {
  const parts: Part[] = Object.entries(values).map(([name, value]) => ({ name, value }));
  if (photo) parts.push(photo);
  return parts;
}

const jpegPhoto = (): Part => ({
  name: "photo",
  value: jpegWithGpsExif().file,
  filename: "IMG_2041.jpg",
  type: "image/jpeg",
});

async function createFrame(parts: Part[]) {
  const body = await multipart(parts);
  return h.request({
    method: "POST",
    url: "/api/v1/admin/frames",
    headers: { ...adminHeaders(cookie), ...body.headers },
    payload: body.payload,
  });
}

const OAK = { name: "Oak A4", widthMm: "210", heightMm: "297", priceCents: "4995", stock: "5" };

describe("admin frames", () => {
  it("AC-039 adds a frame that customers are then offered", async () => {
    const res = await createFrame(frameParts(OAK, jpegPhoto()));
    expect(res.statusCode).toBe(201);
    const frame = res.json();
    expect(frame).toMatchObject({
      name: "Oak A4",
      widthMm: 210,
      heightMm: 297,
      priceCents: 4995,
      stock: 5,
    });
    expect(frame.photoUrl).toBe(`/api/v1/frames/${frame.id}/photo`);
    const offered = await h.request({ method: "GET", url: "/api/v1/frames" });
    expect(offered.json().frames).toEqual([
      {
        id: frame.id,
        name: "Oak A4",
        widthMm: 210,
        heightMm: 297,
        priceCents: 4995,
        photoUrl: frame.photoUrl,
      },
    ]);
    const list = await h.request({
      method: "GET",
      url: "/api/v1/admin/frames",
      headers: adminHeaders(cookie, false),
    });
    expect(list.json().frames).toHaveLength(1);
    const one = await h.request({
      method: "GET",
      url: `/api/v1/admin/frames/${frame.id}`,
      headers: adminHeaders(cookie, false),
    });
    expect(one.json()).toEqual(frame);
  });

  it("AC-066 strips EXIF and XMP with GPS from the frame photo customers receive, keeping the picture", async () => {
    const { file, scanData } = jpegWithGpsExif();
    expect(file.includes(Buffer.from("Exif"))).toBe(true);
    const frame = (await createFrame(frameParts(OAK, jpegPhoto()))).json();
    const photo = await h.request({ method: "GET", url: `/api/v1/frames/${frame.id}/photo` });
    expect(photo.statusCode).toBe(200);
    const served = photo.rawPayload;
    expect(served.includes(Buffer.from("Exif"))).toBe(false);
    expect(served.includes(Buffer.from("http://ns.adobe.com/xap/1.0/"))).toBe(false);
    expect(served.includes(Buffer.from("GPS"))).toBe(false);
    expect(served.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
    expect(served.subarray(served.length - scanData.length).equals(scanData)).toBe(true);
    expect(served.length).toBeLessThan(file.length);
  });

  it("AC-040 rejects a frame smaller than the drawing area; settings show the area read-only", async () => {
    const res = await createFrame(
      frameParts(
        { name: "Mini 13x18", widthMm: "130", heightMm: "180", priceCents: "1995", stock: "3" },
        jpegPhoto(),
      ),
    );
    expect(res.statusCode).toBe(400);
    const error = res.json().error;
    expect(error.code).toBe("validation_failed");
    expect(error.details).toEqual([
      {
        field: "widthMm",
        message: "The frame must be at least 180 x 267 mm inside, so the drawing fits",
      },
      {
        field: "heightMm",
        message: "The frame must be at least 180 x 267 mm inside, so the drawing fits",
      },
    ]);
    expect(await h.db.select().from(frames)).toEqual([]);
    expect(await h.storedFiles()).toEqual([]);
    const settings = await h.request({
      method: "GET",
      url: "/api/v1/admin/settings",
      headers: adminHeaders(cookie, false),
    });
    expect(settings.json()).toEqual({
      leadTimeWorkingDays: 7,
      drawingAreaWidthMm: 180,
      drawingAreaHeightMm: 267,
    });
  });

  it("AC-041 rejects price 0, stock -1 and a missing photo, naming each, all together", async () => {
    const res = await createFrame(
      frameParts({
        name: "Walnut 30x40",
        widthMm: "300",
        heightMm: "400",
        priceCents: "0",
        stock: "-1",
      }),
    );
    expect(res.statusCode).toBe(400);
    expect(
      res
        .json()
        .error.details.map((d: { field: string }) => d.field)
        .sort(),
    ).toEqual(["photo", "priceCents", "stock"]);
    expect(await h.db.select().from(frames)).toEqual([]);
  });

  it("AC-040 AC-041 reports a too small size together with the other field errors", async () => {
    const res = await createFrame(
      frameParts({ name: "Mini", widthMm: "130", heightMm: "180", priceCents: "0", stock: "1" }),
    );
    expect(res.statusCode).toBe(400);
    expect(
      res
        .json()
        .error.details.map((d: { field: string }) => d.field)
        .sort(),
    ).toEqual(["heightMm", "photo", "priceCents", "widthMm"]);
  });

  it("caps stock at 100000 so adjustments never overflow (400, not 500)", async () => {
    const tooMuch = await createFrame(frameParts({ ...OAK, stock: "100001" }, jpegPhoto()));
    expect(tooMuch.statusCode).toBe(400);
    expect(tooMuch.json().error.details).toEqual([
      { field: "stock", message: "Enter a starting stock from 0 to 100000, as a whole number" },
    ]);
    const oak = await seedFrame(h, { name: "Oak A4", priceCents: 4995, stock: 99_995 });
    const url = `/api/v1/admin/frames/${oak.id}/stock-adjustments`;
    const over = await h.request({
      method: "POST",
      url,
      headers: adminHeaders(cookie),
      payload: { delta: 6 },
    });
    expect(over.statusCode).toBe(400);
    expect(over.json().error.details[0].field).toBe("delta");
    expect(await frameStock(h, oak.id)).toBe(99_995);
    const big = await h.request({
      method: "POST",
      url,
      headers: adminHeaders(cookie),
      payload: { delta: 2_147_483_647 },
    });
    expect(big.statusCode).toBe(400);
    expect(
      (
        await h.request({
          method: "POST",
          url,
          headers: adminHeaders(cookie),
          payload: { delta: 5 },
        })
      ).json().stock,
    ).toBe(100_000);
  });

  it("rejects a frame photo that is not JPEG, PNG or WebP, and one over 5 MB", async () => {
    const svg = await createFrame(
      frameParts(OAK, {
        name: "photo",
        value: SVG_FILE,
        filename: "frame.jpg",
        type: "image/jpeg",
      }),
    );
    expect(svg.statusCode).toBe(400);
    expect(svg.json().error.details).toEqual([
      { field: "photo", message: "Use a JPEG, PNG or WebP photo" },
    ]);
    const big = Buffer.alloc(5 * 1024 * 1024 + 1, 0);
    big.set([0xff, 0xd8, 0xff, 0xe0], 0);
    const tooLarge = await createFrame(
      frameParts(OAK, { name: "photo", value: big, filename: "big.jpg", type: "image/jpeg" }),
    );
    expect(tooLarge.statusCode).toBe(413);
    expect(tooLarge.json().error.code).toBe("photo_too_large");
    const unknownField = await createFrame(frameParts({ ...OAK, stockCount: "9" }, jpegPhoto()));
    expect(unknownField.statusCode).toBe(400);
    expect(await h.db.select().from(frames)).toEqual([]);
    expect(await h.storedFiles()).toEqual([]);
  });

  it("AC-042 a price change applies to new orders only", async () => {
    const oak = await seedFrame(h, { name: "Oak A4", priceCents: 4995, stock: 3 });
    const order = await seedOrder(h, oak.id);
    const res = await h.request({
      method: "PATCH",
      url: `/api/v1/admin/frames/${oak.id}`,
      headers: adminHeaders(cookie),
      payload: { priceCents: 5495 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().priceCents).toBe(5495);
    const offered = await h.request({ method: "GET", url: "/api/v1/frames" });
    expect(offered.json().frames[0].priceCents).toBe(5495);
    const detail = await h.request({
      method: "GET",
      url: `/api/v1/admin/orders/${order.id}`,
      headers: adminHeaders(cookie, false),
    });
    expect(detail.json().priceCents).toBe(4995);
    // New orders take the new price.
    const next = await placeOrder(h, orderBody(await createPreview(h), oak.id), "10.7.7.7");
    expect(next.json().priceCents).toBe(5495);
  });

  it("edits under the same rules and never overwrites stock", async () => {
    const oak = await seedFrame(h, { name: "Oak A4", priceCents: 4995, stock: 3 });
    const url = `/api/v1/admin/frames/${oak.id}`;
    const headers = adminHeaders(cookie);
    expect(
      (await h.request({ method: "PATCH", url, headers, payload: { stock: 99 } })).json().error
        .details,
    ).toContainEqual({
      field: "stock",
      message: "Unexpected field",
    });
    expect(
      (await h.request({ method: "PATCH", url, headers, payload: { widthMm: 170 } })).statusCode,
    ).toBe(400);
    expect((await h.request({ method: "PATCH", url, headers, payload: {} })).statusCode).toBe(400);
    const renamed = await h.request({
      method: "PATCH",
      url,
      headers,
      payload: { name: "Oak A4 natural" },
    });
    expect(renamed.json()).toMatchObject({ name: "Oak A4 natural", stock: 3 });
    const missing = await h.request({
      method: "PATCH",
      url: "/api/v1/admin/frames/0b6f1a3e-8c5d-4e7f-9a2b-1c3d4e5f6a7b",
      headers,
      payload: { name: "x" },
    });
    expect(missing.statusCode).toBe(404);
  });

  it("replaces the photo (metadata stripped) and removes the old file", async () => {
    const created = (await createFrame(frameParts(OAK, jpegPhoto()))).json();
    const before = await h.storedFiles();
    const body = await multipart([
      {
        name: "photo",
        value: Buffer.from(TINY_WEBP_BASE64, "base64"),
        filename: "new.webp",
        type: "image/webp",
      },
    ]);
    const res = await h.request({
      method: "PUT",
      url: `/api/v1/admin/frames/${created.id}/photo`,
      headers: { ...adminHeaders(cookie), ...body.headers },
      payload: body.payload,
    });
    expect(res.statusCode).toBe(200);
    const after = await h.storedFiles();
    expect(after).toHaveLength(1);
    expect(after).not.toEqual(before);
    const photo = await h.request({ method: "GET", url: `/api/v1/frames/${created.id}/photo` });
    expect(photo.headers["content-type"]).toBe("image/webp");
  });

  it("AC-043 a supplier delivery of +5 puts a sold-out frame back on offer", async () => {
    const black = await seedFrame(h, { name: "Black A4", priceCents: 3995, stock: 0 });
    expect((await h.request({ method: "GET", url: "/api/v1/frames" })).json().frames).toEqual([]);
    const res = await h.request({
      method: "POST",
      url: `/api/v1/admin/frames/${black.id}/stock-adjustments`,
      headers: adminHeaders(cookie),
      payload: { delta: 5 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().stock).toBe(5);
    expect(
      (await h.request({ method: "GET", url: "/api/v1/frames" }))
        .json()
        .frames.map((f: { name: string }) => f.name),
    ).toEqual(["Black A4"]);
  });

  it("AC-044 rejects an adjustment below zero and keeps the stock", async () => {
    const oak = await seedFrame(h, { name: "Oak A4", priceCents: 4995, stock: 2 });
    const url = `/api/v1/admin/frames/${oak.id}/stock-adjustments`;
    const res = await h.request({
      method: "POST",
      url,
      headers: adminHeaders(cookie),
      payload: { delta: -3 },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("stock_negative");
    expect(res.json().error.message).toContain("Stock can't go below zero");
    expect(await frameStock(h, oak.id)).toBe(2);
    expect(
      (
        await h.request({
          method: "POST",
          url,
          headers: adminHeaders(cookie),
          payload: { delta: 0 },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await h.request({
          method: "POST",
          url,
          headers: adminHeaders(cookie),
          payload: { delta: -2 },
        })
      ).json().stock,
    ).toBe(0);
  });
});

describe("admin settings", () => {
  it("AC-045 a new lead time applies to orders placed afterwards only", async () => {
    const oak = await seedFrame(h, { name: "Oak A4", priceCents: 4995, stock: 5 });
    h.setNow("2026-11-06T13:00:00Z");
    cookie = await h.login();
    const first = await placeOrder(h, orderBody(await createPreview(h), oak.id), "10.8.0.1");
    expect(first.json().estimatedDeliveryDate).toBe("2026-11-17");
    const res = await h.request({
      method: "PUT",
      url: "/api/v1/admin/settings",
      headers: adminHeaders(cookie),
      payload: { leadTimeWorkingDays: 10 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      leadTimeWorkingDays: 10,
      drawingAreaWidthMm: 180,
      drawingAreaHeightMm: 267,
    });
    h.setNow("2026-11-09T09:00:00Z");
    const second = await placeOrder(h, orderBody(await createPreview(h), oak.id), "10.8.0.2");
    expect(second.json().estimatedDeliveryDate).toBe("2026-11-23");
    const rows = await h.db.select().from(orders);
    expect(
      rows.find((o) => o.orderNumber === first.json().orderNumber)!.estimatedDeliveryDate,
    ).toBe("2026-11-17");
  });

  it("AC-046 rejects 0, 2.5 and 61 and keeps 7", async () => {
    for (const value of [0, 2.5, 61, "7"]) {
      const res = await h.request({
        method: "PUT",
        url: "/api/v1/admin/settings",
        headers: adminHeaders(cookie),
        payload: { leadTimeWorkingDays: value },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.details).toEqual([
        {
          field: "leadTimeWorkingDays",
          message: "The lead time must be a whole number from 1 to 60",
        },
      ]);
    }
    const settings = await h.request({
      method: "GET",
      url: "/api/v1/admin/settings",
      headers: adminHeaders(cookie, false),
    });
    expect(settings.json().leadTimeWorkingDays).toBe(7);
  });
});

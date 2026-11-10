import { request as httpRequest } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import {
  drawingSvg,
  gifBytes,
  heicBytes,
  HTML_FILE,
  jpegBytes,
  multipart,
  pngBytes,
  SVG_FILE,
  workerSuccess,
} from "./helpers/fixtures.js";
import { useHarness, WORKER_TOKEN } from "./helpers/harness.js";

const h = useHarness();

async function upload(
  file: Buffer,
  options: { filename?: string; type?: string; headers?: Record<string, string> } = {},
) {
  const body = await multipart([
    {
      name: "photo",
      value: file,
      filename: options.filename ?? "photo.jpg",
      type: options.type ?? "image/jpeg",
    },
  ]);
  return h.request({
    method: "POST",
    url: "/api/v1/drawings",
    payload: body.payload,
    headers: { ...body.headers, ...options.headers },
  });
}

describe("GET /api/v1/health", () => {
  it("answers ok when the database is reachable", async () => {
    const res = await h.request({ method: "GET", url: "/api/v1/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
  });
});

describe("POST /api/v1/drawings", () => {
  it("AC-001 accepts a HEIC phone photo, converts it and returns the preview", async () => {
    const res = await upload(heicBytes(3_100_000), {
      filename: "IMG_0001.HEIC",
      type: "image/heic",
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.svg).toBe(drawingSvg());
    expect(body).toMatchObject({ widthMm: 180, heightMm: 267, strokeCount: 3, totalLengthMm: 300 });
    expect(body.previewToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(body.expiresAt).toBe("2026-11-07T13:00:00.000Z");
    expect(res.headers["cache-control"]).toBe("no-store");

    // The worker got the photo under a fixed name, with the configured area and budget.
    const call = h.worker.calls[0]!;
    expect(call.authorization).toBe(`Bearer ${WORKER_TOKEN}`);
    expect(call.fileName).toBe("photo");
    expect(call.fileType).toBe("image/heic");
    expect(call.fileSize).toBe(3_100_000);
    expect(call.fields).toEqual({
      areaWidthMm: "180",
      areaHeightMm: "267",
      maxStrokes: "1500",
      maxTotalLengthMm: "25000",
      minShortSidePx: "800",
    });

    // Photo and SVG are stored, and the token is stored only as a hash.
    expect((await h.storedFiles()).map((f) => f.split("/")[0])).toEqual(["drawings", "photos"]);
    const rows = await h.db.query.drawings.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.previewTokenHash).not.toContain(body.previewToken);
    expect(rows[0]!.previewTokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(rows[0]!.photoContentType).toBe("image/heic");
  });

  it("AC-007 sends the photo only to our own worker, and answers within the time limit", async () => {
    const realFetch = globalThis.fetch;
    const destinations: string[] = [];
    globalThis.fetch = (input, init) => {
      destinations.push(new URL(input instanceof Request ? input.url : String(input)).origin);
      return realFetch(input, init);
    };
    try {
      const started = Date.now();
      const res = await upload(jpegBytes(14_800_000));
      expect(res.statusCode).toBe(201);
      expect(Date.now() - started).toBeLessThan(30_000);
    } finally {
      globalThis.fetch = realFetch;
    }
    expect(destinations).toEqual([new URL(h.config.worker.url).origin]);
  });

  it("AC-002 rejects a GIF by its content: nothing stored, no conversion", async () => {
    const res = await upload(gifBytes(2_000_000), { filename: "photo.gif", type: "image/gif" });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toEqual({
      code: "photo_unsupported_type",
      message: "Use a JPEG, PNG or HEIC photo.",
    });
    expect(h.worker.calls).toHaveLength(0);
    expect(await h.storedFiles()).toEqual([]);
  });

  it("AC-050 rejects an SVG and an HTML file named photo.jpg and declared as JPEG", async () => {
    for (const file of [SVG_FILE, HTML_FILE]) {
      const res = await upload(file, { filename: "photo.jpg", type: "image/jpeg" });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe("photo_unsupported_type");
      expect(res.json().error.message).toBe("Use a JPEG, PNG or HEIC photo.");
    }
    expect(h.worker.calls).toHaveLength(0);
    expect(await h.storedFiles()).toEqual([]);
  });

  it("AC-003 rejects a photo over 15 MB with photo_too_large and stores nothing", async () => {
    const res = await upload(pngBytes(16_200_000), { type: "image/png" });
    expect(res.statusCode).toBe(413);
    expect(res.json().error).toEqual({
      code: "photo_too_large",
      message: "The photo must be at most 15 MB.",
    });
    expect(h.worker.calls).toHaveLength(0);
    expect(await h.storedFiles()).toEqual([]);
  });

  it("AC-003 accepts exactly 15 MiB and refuses one byte more", async () => {
    expect((await upload(jpegBytes(15 * 1024 * 1024))).statusCode).toBe(201);
    expect((await upload(jpegBytes(15 * 1024 * 1024 + 1))).statusCode).toBe(413);
  });

  it("AC-003 refuses an upload without a declared length as soon as it passes 15 MB, before the rest is sent, parsing and storing nothing more", async () => {
    await h.app.listen({ port: 0, host: "127.0.0.1" });
    const port = (h.app.server.address() as AddressInfo).port;
    const boundary = "----finelineboundary";
    const head = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="photo"; filename="big.png"\r\nContent-Type: image/png\r\n\r\n`,
    );
    const chunk = pngBytes(1024 * 1024);
    const totalChunks = 64; // 64 MB if the server kept reading
    let sent = 0;
    let responded = false;
    const result = await new Promise<{ status: number; body: string }>((resolve, reject) => {
      const req = httpRequest(
        {
          host: "127.0.0.1",
          port,
          method: "POST",
          path: "/api/v1/drawings",
          headers: {
            "content-type": `multipart/form-data; boundary=${boundary}`,
            "transfer-encoding": "chunked",
          },
        },
        (res) => {
          responded = true;
          let body = "";
          res.on("data", (d: Buffer) => (body += d.toString()));
          res.on("end", () => {
            resolve({ status: res.statusCode ?? 0, body });
            req.destroy();
          });
        },
      );
      req.on("error", (err) => {
        // After the answer arrived the client destroys the request itself; anything earlier is a failure.
        if (!responded) reject(err);
      });
      req.write(head);
      // Keep sending until the answer arrives; the server must answer long before 64 MB.
      const pump = () => {
        if (responded) return;
        if (sent === totalChunks) return void req.end(`\r\n--${boundary}--\r\n`);
        sent += 1;
        if (req.write(chunk)) setImmediate(pump);
        else req.once("drain", pump);
      };
      pump();
    });
    expect(result.status).toBe(413);
    expect(JSON.parse(result.body).error.code).toBe("photo_too_large");
    expect(sent).toBeLessThan(32); // about 15 MB plus socket buffers, not 64 MB
    expect(h.worker.calls).toHaveLength(0);
    expect(await h.storedFiles()).toEqual([]);
  });

  it("AC-052 rejects an upload with two photo files: nothing stored, no conversion", async () => {
    const body = await multipart([
      { name: "photo", value: jpegBytes(2_000_000), filename: "a.jpg", type: "image/jpeg" },
      { name: "photo", value: jpegBytes(2_000_000), filename: "b.jpg", type: "image/jpeg" },
    ]);
    const res = await h.request({
      method: "POST",
      url: "/api/v1/drawings",
      payload: body.payload,
      headers: body.headers,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("validation_failed");
    expect(h.worker.calls).toHaveLength(0);
    expect(await h.storedFiles()).toEqual([]);
  });

  it("rejects unexpected fields and a missing photo", async () => {
    const extra = await multipart([
      { name: "photo", value: jpegBytes(), filename: "a.jpg", type: "image/jpeg" },
      { name: "detail", value: "high" },
    ]);
    const res = await h.request({
      method: "POST",
      url: "/api/v1/drawings",
      payload: extra.payload,
      headers: extra.headers,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("validation_failed");

    const none = await multipart([{ name: "note", value: "x" }]);
    const missing = await h.request({
      method: "POST",
      url: "/api/v1/drawings",
      payload: none.payload,
      headers: none.headers,
    });
    expect(missing.statusCode).toBe(400);

    const empty = await h.request({ method: "POST", url: "/api/v1/drawings", payload: {} });
    expect(empty.statusCode).toBe(400);
    expect(empty.json().error.code).toBe("photo_missing");
    expect(h.worker.calls).toHaveLength(0);
  });

  it.each([
    [
      "AC-004",
      400,
      "photo_too_small",
      "photo_too_small",
      "The photo's shortest side must be at least 800 pixels.",
    ],
    [
      "AC-051",
      400,
      "photo_too_many_pixels",
      "photo_too_many_pixels",
      "The photo may have at most 50 megapixels.",
    ],
    [
      "AC-053",
      400,
      "photo_too_many_pixels",
      "photo_too_many_pixels",
      "The photo may have at most 50 megapixels.",
    ],
    ["photo_unreadable", 400, "photo_unreadable", "photo_unreadable", undefined],
    [
      "AC-008",
      422,
      "no_drawable_content",
      "photo_no_drawable_content",
      "We couldn't make a drawing from this photo. Please try another photo.",
    ],
  ])(
    "%s maps worker %i %s to public 400 %s and stores nothing",
    async (_id, status, workerCode, publicCode, message) => {
      h.worker.reply = () => ({
        status,
        body: { error: { code: workerCode, message: "worker says no" } },
      });
      const res = await upload(jpegBytes());
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe(publicCode);
      if (message) expect(res.json().error.message).toBe(message);
      expect(await h.storedFiles()).toEqual([]);
      expect(await h.db.query.drawings.findMany()).toEqual([]);
    },
  );

  it("AC-053 keeps serving after a refused image bomb: the next accepted photo gets its preview", async () => {
    h.worker.reply = () => ({
      status: 400,
      body: { error: { code: "photo_too_many_pixels", message: "" } },
    });
    expect((await upload(pngBytes(900), { type: "image/png" })).statusCode).toBe(400);
    h.worker.reply = () => workerSuccess();
    expect((await upload(jpegBytes())).statusCode).toBe(201);
  });

  it("AC-051 accepts a 48-megapixel phone photo of 12 MB", async () => {
    const res = await upload(jpegBytes(12_000_000));
    expect(res.statusCode).toBe(201);
  });

  it.each([
    [
      "worker 400 validation_failed",
      { status: 400, body: { error: { code: "validation_failed", message: "" } } },
    ],
    ["worker 401", { status: 401, body: { error: { code: "unauthenticated", message: "" } } }],
    ["worker 500", { status: 500, body: { error: { code: "internal_error", message: "" } } }],
    ["worker success body of the wrong shape", { status: 200, body: { svg: 3 } }],
  ])("maps %s to 503 conversion_unavailable", async (_label, reply) => {
    h.worker.reply = () => reply;
    const res = await upload(jpegBytes());
    expect(res.statusCode).toBe(503);
    expect(res.json().error).toEqual({
      code: "conversion_unavailable",
      message: "We can't make drawings right now. Please try again in a few minutes.",
    });
    expect(res.headers["retry-after"]).toBeUndefined();
    expect(await h.storedFiles()).toEqual([]);
  });

  it("maps a worker timeout to 503 conversion_unavailable", async () => {
    h.worker.reply = () => ({ ...workerSuccess(), delayMs: 6_000 });
    const res = await upload(jpegBytes());
    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe("conversion_unavailable");
  }, 15_000);

  it("AC-054 a busy worker answers 503 with Retry-After at once, and the same photo works later", async () => {
    h.worker.reply = () => ({
      status: 503,
      body: { error: { code: "busy", message: "" } },
      headers: { "retry-after": "20" },
    });
    const started = Date.now();
    const res = await upload(jpegBytes());
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(res.statusCode).toBe(503);
    expect(res.json().error.message).toBe(
      "We can't make drawings right now. Please try again in a few minutes.",
    );
    expect(res.headers["retry-after"]).toBe("20");
    expect(await h.storedFiles()).toEqual([]);

    h.worker.reply = () => workerSuccess();
    expect((await upload(jpegBytes())).statusCode).toBe(201);
  });

  it("AC-054 a third concurrent upload is refused within 2 seconds while two conversions run", async () => {
    h.worker.reply = () => ({ ...workerSuccess(), delayMs: 1_500 });
    const first = upload(jpegBytes());
    const second = upload(jpegBytes());
    await new Promise((r) => setTimeout(r, 300));
    const started = Date.now();
    const third = await upload(jpegBytes());
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(third.statusCode).toBe(503);
    expect(third.json().error.code).toBe("conversion_unavailable");
    expect(Number(third.headers["retry-after"])).toBeGreaterThan(0);
    expect((await first).statusCode).toBe(201);
    expect((await second).statusCode).toBe(201);
    expect(h.worker.calls).toHaveLength(2);
    // After the running conversions finished, the photo gets its preview.
    h.worker.reply = () => workerSuccess();
    expect((await upload(jpegBytes())).statusCode).toBe(201);
  });

  it.each([
    ["a script element", drawingSvg().replace("</svg>", "<script>alert(1)</script></svg>")],
    [
      "an onload attribute",
      drawingSvg().replace('version="1.1"', 'version="1.1" onload="alert(1)"'),
    ],
    [
      "a foreignObject",
      drawingSvg().replace("</svg>", "<foreignObject><div/></foreignObject></svg>"),
    ],
    [
      "an external image",
      drawingSvg().replace("</svg>", '<image href="https://evil.example/x.png"/></svg>'),
    ],
    [
      "a DOCTYPE with an entity",
      `<!DOCTYPE svg [<!ENTITY x "y">]>${drawingSvg().replace(/^<\?xml[^>]*\?>/, "")}`,
    ],
  ])("AC-055 a conversion result with %s is not shown or stored", async (_label, svg) => {
    h.worker.reply = () => workerSuccess(svg);
    const res = await upload(jpegBytes());
    expect(res.statusCode).toBe(503);
    expect(res.json().error).toEqual({
      code: "conversion_unavailable",
      message: "We can't make drawings right now. Please try again in a few minutes.",
    });
    expect(await h.storedFiles()).toEqual([]);
    expect(await h.db.query.drawings.findMany()).toEqual([]);
    expect(h.logs.join("")).toContain('"event":"svg_rejected"');
  });

  it("AC-005 the preview fits the default area in mm with black unfilled strokes only", async () => {
    const res = await upload(jpegBytes());
    const svg: string = res.json().svg;
    expect(svg).toMatch(/width="180mm"/);
    expect(svg).toMatch(/height="267mm"/);
    expect(svg).not.toMatch(/<(image|text|linearGradient|radialGradient|script)/);
    for (const path of svg.match(/<path [^>]*>/g) ?? []) {
      expect(path).toContain('fill="none"');
      expect(path).toContain('stroke="#000"');
    }
  });

  it("AC-006 recomputes the metrics itself and refuses a result over the stroke budget despite understated worker metrics", async () => {
    h.worker.reply = () =>
      workerSuccess(drawingSvg({ strokes: 1501, length: 10 }), {
        strokeCount: 1400,
        totalLengthMm: 15_010,
      });
    const res = await upload(jpegBytes());
    expect(res.statusCode).toBe(503);

    h.worker.reply = () =>
      workerSuccess(drawingSvg({ strokes: 1500, length: 16 }), {
        strokeCount: 1,
        totalLengthMm: 1,
      });
    const ok = await upload(jpegBytes());
    expect(ok.statusCode).toBe(201);
    expect(ok.json().strokeCount).toBe(1500);
    expect(ok.json().totalLengthMm).toBe(24_000);
  });

  it("AC-009 a second upload gets its own new preview", async () => {
    const first = (await upload(jpegBytes())).json();
    h.worker.reply = () => workerSuccess(drawingSvg({ strokes: 5 }));
    const second = (await upload(jpegBytes())).json();
    expect(second.drawingId).not.toBe(first.drawingId);
    expect(second.previewToken).not.toBe(first.previewToken);
    expect(second.strokeCount).toBe(5);
  });

  it("AC-057 the 11th upload in an hour is refused, also with a made-up X-Forwarded-For, and works again after the window", async () => {
    h.setNow("2026-11-06T08:00:00Z"); // 09:00 Amsterdam
    for (let i = 0; i < 10; i++) {
      expect((await upload(jpegBytes())).statusCode).toBe(201);
      h.advance(4 * 60_000);
    }
    h.setNow("2026-11-06T08:45:00Z");
    for (const headers of [{}, { "x-forwarded-for": "1.2.3.4" }] as Record<string, string>[]) {
      const res = await upload(jpegBytes(), { headers });
      expect(res.statusCode).toBe(429);
      expect(res.json().error).toEqual({
        code: "rate_limited",
        message:
          "You've made a lot of drawings in a short time. Please wait 15 minutes and try again.",
      });
      expect(res.headers["retry-after"]).toBe("900");
    }
    expect(h.worker.calls).toHaveLength(10);
    expect(await h.db.query.drawings.findMany()).toHaveLength(10);

    h.setNow("2026-11-06T09:01:00Z");
    expect((await upload(jpegBytes())).statusCode).toBe(201);
  });

  it("AC-057 counts uploads globally too: at most 60 an hour from all addresses", async () => {
    for (let i = 0; i < 60; i++) {
      const ip = `10.0.${Math.floor(i / 10)}.1`;
      const res = await h.request({
        method: "POST",
        url: "/api/v1/drawings",
        remoteAddress: ip,
        payload: {},
      });
      expect(res.statusCode).toBe(400); // counted even though there is no photo
    }
    const res = await h.request({
      method: "POST",
      url: "/api/v1/drawings",
      remoteAddress: "10.9.9.9",
      payload: {},
    });
    expect(res.statusCode).toBe(429);
  });
});

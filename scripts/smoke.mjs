#!/usr/bin/env node
// End-to-end smoke test of the running stack (task 4.4). No dependencies; Node 22+.
//
// Walks the customer and admin flows through the public HTTP interface:
//   health -> admin login -> add a frame -> upload a generated photo (real worker) -> preview SVG
//   -> list frames -> place an order -> admin order list -> download for the arm -> status "drawing"
//   -> security headers on the shop page (when run through nginx).
// Covers AC-001 (accepted photo -> preview), AC-005, AC-007, AC-018, AC-031 and AC-065 end to end.
//
// Usage:
//   SMOKE_BASE_URL=http://localhost:8080 SMOKE_ADMIN_USERNAME=admin SMOKE_ADMIN_PASSWORD=... node scripts/smoke.mjs
// Set SMOKE_CHECK_HEADERS=0 when running against the API directly (no nginx in front).

import { deflateSync } from "node:zlib";

const base = (process.env.SMOKE_BASE_URL ?? "http://localhost:8080").replace(/\/$/, "");
const adminUser = process.env.SMOKE_ADMIN_USERNAME ?? "admin";
const adminPassword = process.env.SMOKE_ADMIN_PASSWORD;
const checkHeaders = process.env.SMOKE_CHECK_HEADERS !== "0";
const CSRF = { "X-Requested-With": "fineline" };

if (!adminPassword) {
  console.error("SMOKE_ADMIN_PASSWORD is required");
  process.exit(2);
}

let failures = 0;
function check(condition, message) {
  if (condition) {
    console.log(`  ok   ${message}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${message}`);
  }
  return condition;
}

// ---- tiny PNG encoder (grayscale, 8 bit) ----
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(width, height, pixel) {
  const raw = Buffer.alloc((width + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width + 1)] = 0;
    for (let x = 0; x < width; x += 1) raw[y * (width + 1) + 1 + x] = pixel(x, y);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // grayscale
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// A synthetic, face-like portrait: light background, head, hair, eyes, nose and mouth.
function portrait() {
  const w = 1200;
  const h = 1600;
  const inEllipse = (x, y, cx, cy, rx, ry) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
  return png(w, h, (x, y) => {
    if (inEllipse(x, y, 480, 640, 55, 30) || inEllipse(x, y, 720, 640, 55, 30)) return 30; // eyes
    if (inEllipse(x, y, 600, 1000, 140, 35)) return 60; // mouth
    if (x > 585 && x < 615 && y > 680 && y < 860) return 110; // nose
    if (inEllipse(x, y, 600, 420, 330, 200) && y < 520) return 45; // hair
    if (inEllipse(x, y, 600, 780, 320, 430)) return 200; // face
    if (y > 1250 && inEllipse(x, y, 600, 1600, 520, 380)) return 90; // shoulders
    return 235 - Math.floor(y / 40); // background
  });
}

async function call(path, init = {}) {
  const res = await fetch(base + path, init);
  return res;
}

async function main() {
  console.log(`Smoke test against ${base}`);

  const health = await call("/api/v1/health");
  check(health.status === 200, "GET /api/v1/health is 200");

  // Admin login
  const login = await call("/api/v1/admin/session", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...CSRF },
    body: JSON.stringify({ username: adminUser, password: adminPassword }),
  });
  check(login.status === 200, "admin login is 200 (AC-024)");
  const setCookie = login.headers.get("set-cookie") ?? "";
  const cookie = setCookie.split(";")[0];
  check(cookie.startsWith("fineline_admin="), "login sets the fineline_admin cookie");
  check(/httponly/i.test(setCookie) && /samesite=strict/i.test(setCookie), "cookie is HttpOnly and SameSite=Strict");
  const admin = { Cookie: cookie };

  // Add a frame so the customer can order
  const framePhoto = png(400, 300, (x, y) => ((x + y) % 50 < 25 ? 120 : 200));
  const frameForm = new FormData();
  frameForm.set("name", `Smoke Oak ${Date.now()}`);
  frameForm.set("widthMm", "210");
  frameForm.set("heightMm", "297");
  frameForm.set("priceCents", "4995");
  frameForm.set("stock", "2");
  frameForm.set("photo", new Blob([framePhoto], { type: "image/png" }), "frame.png");
  const frameRes = await call("/api/v1/admin/frames", { method: "POST", headers: { ...admin, ...CSRF }, body: frameForm });
  check(frameRes.status === 201, "admin adds a frame (AC-039)");
  const frame = await frameRes.json();

  // Upload a photo -> real conversion
  const photoForm = new FormData();
  photoForm.set("photo", new Blob([portrait()], { type: "image/png" }), "portrait.png");
  const started = Date.now();
  const drawingRes = await call("/api/v1/drawings", { method: "POST", body: photoForm });
  const seconds = (Date.now() - started) / 1000;
  check(drawingRes.status === 201, `upload converts to a preview (AC-001) in ${seconds.toFixed(1)} s`);
  check(seconds < 30, "preview arrives within 30 s (AC-007)");
  const drawing = await drawingRes.json();
  const svg = String(drawing.svg ?? "");
  check(svg.includes("<svg") && svg.includes('width="180mm"'), "preview is an SVG sized to the drawing area (AC-005)");
  check(!/<(script|image|text|style)\b/i.test(svg) && !/fill="(?!none)/i.test(svg), "preview has strokes only (AC-005)");
  check(drawing.strokeCount > 0 && drawing.strokeCount <= 1500, `stroke count ${drawing.strokeCount} within budget (AC-006)`);
  check(drawing.totalLengthMm <= 25000, `total length ${Math.round(drawing.totalLengthMm)} mm within budget (AC-006)`);

  // Customer sees the frame and orders
  const framesRes = await call("/api/v1/frames");
  const frames = (await framesRes.json()).frames ?? [];
  check(frames.some((f) => f.id === frame.id), "new frame is offered to customers (AC-013)");

  const orderRes = await call("/api/v1/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      drawingId: drawing.drawingId,
      previewToken: drawing.previewToken,
      frameId: frame.id,
      customer: { name: "Smoke Test", email: "smoke@example.com" },
      address: { street: "Teststraat", houseNumber: "1", postalCode: "1234 AB", city: "Utrecht", country: "NL" },
      acceptedPhotoTerms: true,
    }),
  });
  check(orderRes.status === 201, "order is placed (AC-018)");
  const confirmation = await orderRes.json();
  check(/^FL-\d{4}-\d{4,}$/.test(confirmation.orderNumber ?? ""), `order number ${confirmation.orderNumber} (AC-018)`);
  check(/^\d{4}-\d{2}-\d{2}$/.test(confirmation.estimatedDeliveryDate ?? ""), `estimated delivery ${confirmation.estimatedDeliveryDate}`);

  // Admin handles the order
  const listRes = await call("/api/v1/admin/orders?status=received", { headers: admin });
  const orders = (await listRes.json()).orders ?? [];
  const order = orders.find((o) => o.orderNumber === confirmation.orderNumber);
  check(Boolean(order), "order appears in the admin list as received (AC-029)");
  if (order) {
    const view = await call(`/api/v1/admin/orders/${order.id}/drawing.svg`, { headers: admin });
    check(view.status === 200, "viewing the drawing works");
    const viewed = await (await call(`/api/v1/admin/orders/${order.id}`, { headers: admin })).json();
    check(viewed.status === "received", "viewing does not change the status (AC-030)");

    const dl = await call(`/api/v1/admin/orders/${order.id}/drawing-download`, { method: "POST", headers: { ...admin, ...CSRF } });
    check(dl.status === 200, "download for the arm is 200 (AC-031)");
    check((dl.headers.get("content-disposition") ?? "").includes(`${confirmation.orderNumber}.svg`), "attachment is named after the order number");
    check((await dl.text()) === svg, "downloaded SVG is identical to the preview (AC-021)");
    const after = await (await call(`/api/v1/admin/orders/${order.id}`, { headers: admin })).json();
    check(after.status === "drawing", "status is now drawing (AC-031)");
  }

  const anon = await call("/api/v1/admin/orders");
  check(anon.status === 401, "admin API without login is 401 (AC-026)");

  if (checkHeaders) {
    const page = await call("/");
    const csp = page.headers.get("content-security-policy") ?? "";
    check(page.status === 200, "shop page is served");
    check(csp.includes("frame-ancestors 'none'") && csp.includes("script-src 'self'"), "shop page has the CSP (AC-065)");
    check(page.headers.get("x-content-type-options") === "nosniff", "nosniff on the shop page");
    const adminPage = await call("/admin/login");
    check((adminPage.headers.get("content-security-policy") ?? "").includes("frame-ancestors 'none'"), "admin login page has the CSP (AC-065)");
  }

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed`);
    process.exit(1);
  }
  console.log("\nSmoke test passed");
}

main().catch((error) => {
  console.error("Smoke test crashed:", error);
  process.exit(1);
});

/** Test files built in code (no real faces or personal photos committed). */

/** Bytes that start like a JPEG; the API only checks magic bytes, the worker is stubbed. */
export function jpegBytes(size = 2048): Buffer {
  const b = Buffer.alloc(size, 0x11);
  b.set([0xff, 0xd8, 0xff, 0xe0], 0);
  return b;
}

export function pngBytes(size = 2048): Buffer {
  const b = Buffer.alloc(size, 0x22);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  return b;
}

/** ISO-BMFF with an `ftyp` box of major brand `heic`, like an iPhone photo. */
export function heicBytes(size = 2048): Buffer {
  const b = Buffer.alloc(size, 0x33);
  b.writeUInt32BE(0x18, 0);
  b.write("ftypheic", 4, "latin1");
  return b;
}

export function gifBytes(size = 2048): Buffer {
  const b = Buffer.alloc(size, 0x44);
  b.write("GIF89a", 0, "latin1");
  return b;
}

export const SVG_FILE = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
);
export const HTML_FILE = Buffer.from(
  "<!doctype html><html><body><script>alert(1)</script></body></html>",
);

/** A drawing as the worker returns it: `strokes` horizontal lines, each `length` mm long. */
export function drawingSvg(
  options: { strokes?: number; length?: number; width?: number; height?: number } = {},
): string {
  const { strokes = 3, length = 100, width = 180, height = 267 } = options;
  const paths = Array.from({ length: strokes }, (_, i) => {
    const y = 10 + (i % 250);
    return `<path d="M10 ${y} L${10 + length} ${y}" fill="none" stroke="#000" stroke-width="0.5" stroke-linecap="round" stroke-linejoin="round"/>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="${width}mm" height="${height}mm" viewBox="0 0 ${width} ${height}" version="1.1">${paths.join("")}</svg>`;
}

export function workerSuccess(
  svg = drawingSvg(),
  metrics?: Partial<{ strokeCount: number; totalLengthMm: number }>,
) {
  return {
    status: 200,
    body: { svg, widthMm: 180, heightMm: 267, strokeCount: 3, totalLengthMm: 300, ...metrics },
  };
}

/** A multipart body built by the platform's FormData, as a browser would send it. */
export async function multipart(
  parts: { name: string; value: string | Buffer; filename?: string; type?: string }[],
): Promise<{ payload: Buffer; headers: Record<string, string> }> {
  const form = new FormData();
  for (const part of parts) {
    if (typeof part.value === "string" && part.filename === undefined)
      form.append(part.name, part.value);
    else {
      const data = typeof part.value === "string" ? Buffer.from(part.value) : part.value;
      form.append(
        part.name,
        new Blob([data], { type: part.type ?? "application/octet-stream" }),
        part.filename ?? "file",
      );
    }
  }
  const request = new Request("http://test", { method: "POST", body: form });
  return {
    payload: Buffer.from(await request.arrayBuffer()),
    headers: { "content-type": request.headers.get("content-type") as string },
  };
}

/** Real 8x8 images generated with Pillow (flat colours). */
export const TINY_JPEG_BASE64 =
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABALDA4MChAODQ4SERATGCgaGBYWGDEjJR0oOjM9PDkzODdASFxOQERXRTc4UG1RV19iZ2hnPk1xeXBkeFxlZ2P/wAALCAAIAAgBAREA/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/9oACAEBAAA/ACv/2Q==";
export const TINY_WEBP_BASE64 =
  "UklGRjoAAABXRUJQVlA4IC4AAADwAQCdASoIAAgAAUAmJaACdLoB+AAEyAAA/q4X/zYEDND6YP/SbPE2eJs+OYAA";
/** PNG with a `tEXt` chunk "GPS" = "52.0907N". */
export const TINY_PNG_WITH_TEXT_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAADHRFWHRHUFMANTIuMDkwN07YlKcuAAAAFElEQVR4nGM8kWLEgA0wYRUdtBIAFmEBbiBAe9oAAAAASUVORK5CYII=";

/** A tiny but real baseline JPEG (8x8 grey), with a hand-built EXIF APP1 segment carrying GPS. */
export function jpegWithGpsExif(): { file: Buffer; scanData: Buffer } {
  const base = Buffer.from(TINY_JPEG_BASE64, "base64");
  // TIFF header + IFD0 with a GPS IFD pointer + GPS IFD with latitude 52.0907 N and longitude 5.1214 E.
  const tiff = Buffer.alloc(120);
  tiff.write("MM", 0, "latin1");
  tiff.writeUInt16BE(42, 2);
  tiff.writeUInt32BE(8, 4);
  tiff.writeUInt16BE(1, 8); // IFD0: one entry
  tiff.writeUInt16BE(0x8825, 10); // GPSInfo pointer
  tiff.writeUInt16BE(4, 12);
  tiff.writeUInt32BE(1, 14);
  tiff.writeUInt32BE(26, 18);
  tiff.writeUInt32BE(0, 22);
  tiff.writeUInt16BE(4, 26); // GPS IFD: four entries
  const entry = (offset: number, tag: number, type: number, count: number, value: number) => {
    tiff.writeUInt16BE(tag, offset);
    tiff.writeUInt16BE(type, offset + 2);
    tiff.writeUInt32BE(count, offset + 4);
    tiff.writeUInt32BE(value, offset + 8);
  };
  entry(28, 0x0001, 2, 2, 0x4e000000); // GPSLatitudeRef "N"
  entry(40, 0x0002, 5, 3, 80); // GPSLatitude rationals at 80
  entry(52, 0x0003, 2, 2, 0x45000000); // GPSLongitudeRef "E"
  entry(64, 0x0004, 5, 3, 104 - 24); // GPSLongitude (shares the block; fine for the test)
  tiff.writeUInt32BE(0, 76);
  [52, 1, 5, 1, 2652, 100].forEach((v, i) => tiff.writeUInt32BE(v, 80 + i * 4));
  const payload = Buffer.concat([Buffer.from("Exif\0\0", "latin1"), tiff]);
  const app1 = Buffer.alloc(4);
  app1.writeUInt16BE(0xffe1, 0);
  app1.writeUInt16BE(payload.length + 2, 2);
  const xmpPayload = Buffer.from(
    'http://ns.adobe.com/xap/1.0/\0<x:xmpmeta><rdf:Description exif:GPSLatitude="52,5.442N"/></x:xmpmeta>',
    "latin1",
  );
  const xmp = Buffer.alloc(4);
  xmp.writeUInt16BE(0xffe1, 0);
  xmp.writeUInt16BE(xmpPayload.length + 2, 2);
  const file = Buffer.concat([
    base.subarray(0, 2),
    app1,
    payload,
    xmp,
    xmpPayload,
    base.subarray(2),
  ]);
  const sos = base.indexOf(Buffer.from([0xff, 0xda]));
  return { file, scanData: base.subarray(sos) };
}

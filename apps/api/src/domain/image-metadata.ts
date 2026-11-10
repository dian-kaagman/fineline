/**
 * Removes embedded metadata (EXIF, XMP, IPTC, comments, text chunks) from frame photos before they
 * are stored and served publicly (SR-023). Pixel data is copied unchanged. Returns null when the
 * file's structure is malformed, so it can be refused instead of stored half-cleaned.
 */
import type { FramePhotoType } from "./image-type.js";

export function stripImageMetadata(bytes: Buffer, type: FramePhotoType): Buffer | null {
  switch (type) {
    case "image/jpeg":
      return stripJpeg(bytes);
    case "image/png":
      return stripPng(bytes);
    case "image/webp":
      return stripWebp(bytes);
  }
}

// JPEG markers kept before the scan: APP0 (JFIF), APP2 (ICC profile), APP14 (Adobe colour transform)
// and every non-APP structural segment. Dropped: APP1 (EXIF/XMP), APP3-APP13 (incl. IPTC), APP15, COM.
const KEPT_APP_MARKERS = new Set([0xe0, 0xe2, 0xee]);

function stripJpeg(bytes: Buffer): Buffer | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const out: Buffer[] = [bytes.subarray(0, 2)];
  let pos = 2;
  while (pos < bytes.length) {
    if (bytes[pos] !== 0xff) return null;
    // Fill bytes (0xFF padding) before a marker are allowed.
    while (bytes[pos + 1] === 0xff) pos += 1;
    const marker = bytes[pos + 1];
    if (marker === undefined) return null;
    if (marker === 0xd9) {
      out.push(bytes.subarray(pos, pos + 2));
      return Buffer.concat(out);
    }
    // Standalone markers without a length.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      out.push(bytes.subarray(pos, pos + 2));
      pos += 2;
      continue;
    }
    if (pos + 4 > bytes.length) return null;
    const length = bytes.readUInt16BE(pos + 2);
    if (length < 2 || pos + 2 + length > bytes.length) return null;
    const segment = bytes.subarray(pos, pos + 2 + length);
    if (marker === 0xda) {
      // Start of scan: entropy-coded data and everything after it is image data; copy verbatim.
      out.push(bytes.subarray(pos));
      return Buffer.concat(out);
    }
    const isApp = marker >= 0xe0 && marker <= 0xef;
    const keep = isApp ? KEPT_APP_MARKERS.has(marker) : marker !== 0xfe;
    if (keep) out.push(segment);
    pos += 2 + length;
  }
  return null;
}

const PNG_SIGNATURE_LENGTH = 8;
const PNG_DROPPED_CHUNKS = new Set(["eXIf", "tEXt", "zTXt", "iTXt", "tIME"]);

function stripPng(bytes: Buffer): Buffer | null {
  if (bytes.length < PNG_SIGNATURE_LENGTH) return null;
  const out: Buffer[] = [bytes.subarray(0, PNG_SIGNATURE_LENGTH)];
  let pos = PNG_SIGNATURE_LENGTH;
  while (pos < bytes.length) {
    if (pos + 12 > bytes.length) return null;
    const length = bytes.readUInt32BE(pos);
    const type = bytes.toString("latin1", pos + 4, pos + 8);
    const end = pos + 12 + length;
    if (end > bytes.length) return null;
    if (!PNG_DROPPED_CHUNKS.has(type)) out.push(bytes.subarray(pos, end));
    pos = end;
    if (type === "IEND") return Buffer.concat(out);
  }
  return null;
}

const WEBP_DROPPED_CHUNKS = new Set(["EXIF", "XMP "]);
const VP8X_EXIF_FLAG = 0x08;
const VP8X_XMP_FLAG = 0x04;

function stripWebp(bytes: Buffer): Buffer | null {
  if (bytes.length < 12) return null;
  const riffSize = bytes.readUInt32LE(4);
  if (riffSize + 8 > bytes.length || riffSize < 4) return null;
  const chunks: Buffer[] = [];
  let pos = 12;
  const end = 8 + riffSize;
  while (pos < end) {
    if (pos + 8 > end) return null;
    const type = bytes.toString("latin1", pos, pos + 4);
    const size = bytes.readUInt32LE(pos + 4);
    const padded = size + (size % 2);
    if (pos + 8 + size > end) return null;
    const chunk = Buffer.from(bytes.subarray(pos, Math.min(pos + 8 + padded, end)));
    if (type === "VP8X" && size >= 1) {
      chunk[8] = (chunk[8] as number) & ~(VP8X_EXIF_FLAG | VP8X_XMP_FLAG);
    }
    if (!WEBP_DROPPED_CHUNKS.has(type)) chunks.push(chunk);
    pos += 8 + padded;
  }
  const body = Buffer.concat(chunks);
  const header = Buffer.alloc(12);
  header.write("RIFF", 0, "latin1");
  header.writeUInt32LE(body.length + 4, 4);
  header.write("WEBP", 8, "latin1");
  return Buffer.concat([header, body]);
}

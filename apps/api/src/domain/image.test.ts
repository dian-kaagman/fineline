import { describe, expect, it } from "vitest";
import { stripImageMetadata } from "./image-metadata.js";
import { detectCustomerPhotoType, detectFramePhotoType } from "./image-type.js";

const TINY_JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABALDA4MChAODQ4SERATGCgaGBYWGDEjJR0oOjM9PDkzODdASFxOQERXRTc4UG1RV19iZ2hnPk1xeXBkeFxlZ2P/wAALCAAIAAgBAREA/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/9oACAEBAAA/ACv/2Q==",
  "base64",
);
/** 16x16 progressive JPEG (10 scans) generated with Pillow. */
const PROGRESSIVE_JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEmKzcvJik0KSEiMEExNDk7Pj4+JS5ESUM8SDc9Pjv/2wBDAQoLCw4NDhwQEBw7KCIoOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozv/wgARCAAQABADASIAAhEBAxEB/8QAFgABAQEAAAAAAAAAAAAAAAAAAwAE/8QAFAEBAAAAAAAAAAAAAAAAAAAABf/aAAwDAQACEAMQAAABztCep//EABYQAQEBAAAAAAAAAAAAAAAAADMAEP/aAAgBAQABBQI9O//EABURAQEAAAAAAAAAAAAAAAAAAAAx/9oACAEDAQE/AY//xAAVEQEBAAAAAAAAAAAAAAAAAAAAMf/aAAgBAgEBPwGv/8QAFxAAAwEAAAAAAAAAAAAAAAAAAGKxEP/aAAgBAQAGPwJJqQ//xAAYEAADAQEAAAAAAAAAAAAAAAAxcfCxEP/aAAgBAQABPyGqMQ5VGIf/2gAMAwEAAgADAAAAEGf/xAAVEQEBAAAAAAAAAAAAAAAAAAAAof/aAAgBAwEBPxCH/8QAFREBAQAAAAAAAAAAAAAAAAAAAKH/2gAIAQIBAT8Qp//EABQQAQAAAAAAAAAAAAAAAAAAACD/2gAIAQEAAT8QBgx//9k=",
  "base64",
);
const TINY_PNG_WITH_TEXT = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAADHRFWHRHUFMANTIuMDkwN07YlKcuAAAAFElEQVR4nGM8kWLEgA0wYRUdtBIAFmEBbiBAe9oAAAAASUVORK5CYII=",
  "base64",
);
const TINY_WEBP = Buffer.from(
  "UklGRjoAAABXRUJQVlA4IC4AAADwAQCdASoIAAgAAUAmJaACdLoB+AAEyAAA/q4X/zYEDND6YP/SbPE2eJs+OYAA",
  "base64",
);

function jpegSegment(marker: number, payload: Buffer): Buffer {
  const head = Buffer.alloc(4);
  head.writeUInt16BE(0xff00 | marker, 0);
  head.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([head, payload]);
}

function webpChunk(type: string, payload: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.write(type, 0, "latin1");
  head.writeUInt32LE(payload.length, 4);
  return Buffer.concat([head, payload, payload.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0)]);
}

describe("file type from magic bytes (SR-002)", () => {
  it("detects customer photos by content only", () => {
    expect(detectCustomerPhotoType(TINY_JPEG)).toBe("image/jpeg");
    expect(detectCustomerPhotoType(TINY_PNG_WITH_TEXT)).toBe("image/png");
    const heic = Buffer.alloc(32);
    heic.write("ftypmif1", 4, "latin1");
    expect(detectCustomerPhotoType(heic)).toBe("image/heic");
    expect(detectCustomerPhotoType(TINY_WEBP)).toBeNull();
    expect(detectCustomerPhotoType(Buffer.from("GIF89a....."))).toBeNull();
    expect(
      detectCustomerPhotoType(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>")),
    ).toBeNull();
    const avif = Buffer.alloc(32);
    avif.write("ftypavif", 4, "latin1");
    expect(detectCustomerPhotoType(avif)).toBeNull();
  });

  it("detects frame photos (JPEG, PNG, WebP)", () => {
    expect(detectFramePhotoType(TINY_WEBP)).toBe("image/webp");
    expect(detectFramePhotoType(Buffer.from("<svg/>"))).toBeNull();
  });
});

describe("metadata stripping (SR-023)", () => {
  it("AC-066 removes EXIF (with GPS), XMP and comments from a JPEG and keeps the image data", () => {
    const exif = jpegSegment(
      0xe1,
      Buffer.concat([Buffer.from("Exif\0\0MM", "latin1"), Buffer.from("GPS 52.0907 N 5.1214 E")]),
    );
    const xmp = jpegSegment(
      0xe1,
      Buffer.from("http://ns.adobe.com/xap/1.0/\0<x:xmpmeta>GPS</x:xmpmeta>", "latin1"),
    );
    const iptc = jpegSegment(0xed, Buffer.from("Photoshop 3.0\0city", "latin1"));
    const comment = jpegSegment(0xfe, Buffer.from("taken at home", "latin1"));
    const file = Buffer.concat([
      TINY_JPEG.subarray(0, 2),
      exif,
      xmp,
      iptc,
      comment,
      TINY_JPEG.subarray(2),
    ]);
    const clean = stripImageMetadata(file, "image/jpeg");
    expect(clean).toEqual(TINY_JPEG);
  });

  it("AC-066 drops data appended after the end of the image and APP2 MPF indexes (motion photos)", () => {
    const mpf = jpegSegment(0xe2, Buffer.from("MPF\0MM\0*\0\0\0\x08", "latin1"));
    const appended = Buffer.concat([
      TINY_JPEG.subarray(0, 2),
      jpegSegment(0xe1, Buffer.from("Exif\0\0GPS 52.09N")),
      Buffer.from("ftypmp42 video"),
    ]);
    const file = Buffer.concat([TINY_JPEG.subarray(0, 2), mpf, TINY_JPEG.subarray(2), appended]);
    expect(stripImageMetadata(file, "image/jpeg")).toEqual(TINY_JPEG);
  });

  it("keeps every scan and table of a progressive JPEG", () => {
    expect(PROGRESSIVE_JPEG.includes(Buffer.from([0xff, 0xda]))).toBe(true);
    const comment = jpegSegment(0xfe, Buffer.from("taken at home"));
    const file = Buffer.concat([
      PROGRESSIVE_JPEG.subarray(0, 2),
      comment,
      PROGRESSIVE_JPEG.subarray(2),
    ]);
    expect(stripImageMetadata(file, "image/jpeg")).toEqual(PROGRESSIVE_JPEG);
    expect(
      stripImageMetadata(PROGRESSIVE_JPEG.subarray(0, PROGRESSIVE_JPEG.length - 2), "image/jpeg"),
    ).toBeNull();
  });

  it("drops data after PNG IEND and beyond the WebP RIFF size", () => {
    const trailer = Buffer.from("Exif GPS 52.0907 N");
    const png = stripImageMetadata(
      Buffer.concat([TINY_PNG_WITH_TEXT, trailer]),
      "image/png",
    ) as Buffer;
    expect(png.includes(trailer)).toBe(false);
    const webp = stripImageMetadata(Buffer.concat([TINY_WEBP, trailer]), "image/webp") as Buffer;
    expect(webp).toEqual(TINY_WEBP);
  });

  it("removes PNG text chunks and keeps a valid PNG", () => {
    const clean = stripImageMetadata(TINY_PNG_WITH_TEXT, "image/png") as Buffer;
    expect(clean.includes(Buffer.from("tEXt"))).toBe(false);
    expect(clean.includes(Buffer.from("52.0907"))).toBe(false);
    expect(clean.includes(Buffer.from("IDAT"))).toBe(true);
    expect(clean.subarray(-12).includes(Buffer.from("IEND"))).toBe(true);
  });

  it("removes WebP EXIF and XMP chunks, clears their VP8X flags and fixes the RIFF size", () => {
    const image = TINY_WEBP.subarray(12);
    const vp8x = webpChunk("VP8X", Buffer.from([0x0c, 0, 0, 0, 7, 0, 0, 7, 0, 0]));
    const exif = webpChunk("EXIF", Buffer.from("MM GPS 52.0907 N"));
    const xmp = webpChunk("XMP ", Buffer.from("<x:xmpmeta>GPS</x:xmpmeta>!"));
    const body = Buffer.concat([vp8x, image, exif, xmp]);
    const header = Buffer.alloc(12);
    header.write("RIFF", 0, "latin1");
    header.writeUInt32LE(body.length + 4, 4);
    header.write("WEBP", 8, "latin1");
    const clean = stripImageMetadata(Buffer.concat([header, body]), "image/webp") as Buffer;
    expect(clean.includes(Buffer.from("EXIF"))).toBe(false);
    expect(clean.includes(Buffer.from("XMP "))).toBe(false);
    expect(clean.readUInt32LE(4)).toBe(clean.length - 8);
    expect(clean[20]! & 0x0c).toBe(0);
    expect(clean.includes(image)).toBe(true);
  });

  it("refuses malformed files instead of storing them half-cleaned", () => {
    expect(stripImageMetadata(TINY_JPEG.subarray(0, 30), "image/jpeg")).toBeNull();
    expect(stripImageMetadata(TINY_PNG_WITH_TEXT.subarray(0, 20), "image/png")).toBeNull();
    expect(stripImageMetadata(TINY_WEBP.subarray(0, 16), "image/webp")).toBeNull();
  });
});

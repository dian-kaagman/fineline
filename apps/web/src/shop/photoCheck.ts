// Browser pre-checks of a chosen photo, with the same rules and messages as the API (BR-001, F3).
import type { MessageKey } from "../i18n/t";

export const MAX_PHOTO_BYTES = 15 * 1024 * 1024; // 15 MiB, as the API enforces (SR-001)
export const MIN_SHORT_SIDE_PX = 800;

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/heic", "image/heif"];
const ALLOWED_EXTENSIONS = /\.(jpe?g|png|heic|heif)$/i;

/** The type and size checks; null when the photo may be sent. */
export function checkPhotoFile(file: File): MessageKey | null {
  const typeKnown = file.type !== "" && file.type !== "application/octet-stream";
  const typeOk = typeKnown ? ALLOWED_TYPES.includes(file.type) : ALLOWED_EXTENSIONS.test(file.name);
  if (!typeOk) return "c1.error.unsupportedType";
  if (file.size > MAX_PHOTO_BYTES) return "c1.error.tooLarge";
  return null;
}

/**
 * Reads the pixel size when the browser can (not HEIC outside Safari) and reports a short side
 * under 800 px. Resolves null when the size is fine or unknown: the API checks again.
 */
export function checkPhotoDimensions(file: File, timeoutMs = 1500): Promise<MessageKey | null> {
  if (typeof URL.createObjectURL !== "function" || typeof Image === "undefined") {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    const finish = (result: MessageKey | null) => {
      clearTimeout(timer);
      image.onload = null;
      image.onerror = null;
      URL.revokeObjectURL(url);
      resolve(result);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    image.onload = () => {
      const shortSide = Math.min(image.naturalWidth, image.naturalHeight);
      finish(shortSide > 0 && shortSide < MIN_SHORT_SIDE_PX ? "c1.error.tooSmall" : null);
    };
    image.onerror = () => finish(null);
    image.src = url;
  });
}

/** All browser pre-checks: type and size first, then the pixel size when readable. */
export async function precheckPhoto(file: File): Promise<MessageKey | null> {
  return checkPhotoFile(file) ?? (await checkPhotoDimensions(file));
}

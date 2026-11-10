// Maps the answer to POST /drawings onto the C1 error notice (docs/ux/content.md "C1 errors").
import { ApiError, NetworkError } from "../api/client";
import { t } from "../i18n/t";
import { formatWait } from "../lib/format";

export interface PhotoError {
  message: string;
  /** F3b: the same photo may work later, so C1 offers "Try again". */
  retryable: boolean;
}

const CODE_MESSAGES = {
  photo_missing: "c1.error.missing",
  photo_unsupported_type: "c1.error.unsupportedType",
  photo_too_large: "c1.error.tooLarge",
  photo_too_small: "c1.error.tooSmall",
  photo_too_many_pixels: "c1.error.tooManyPixels",
  photo_unreadable: "c1.error.unreadable",
  photo_no_drawable_content: "c1.error.noDrawableContent",
  validation_failed: "c1.error.invalidUpload",
} as const;

export function photoErrorFor(error: unknown): PhotoError {
  if (error instanceof ApiError) {
    // Any 413 means too large, also nginx's own without our JSON body (AC-003).
    if (error.status === 413) return { message: t("c1.error.tooLarge"), retryable: false };
    if (error.status === 429) {
      return {
        message: t("c1.error.rateLimited", { wait: formatWait(error.retryAfterSeconds) }),
        retryable: true,
      };
    }
    if (error.status >= 500) {
      return { message: t("c1.error.conversionUnavailable"), retryable: true };
    }
    if (error.code in CODE_MESSAGES) {
      return {
        message: t(CODE_MESSAGES[error.code as keyof typeof CODE_MESSAGES]),
        retryable: false,
      };
    }
    return { message: error.apiMessage ?? t("c1.error.unreadable"), retryable: false };
  }
  if (error instanceof NetworkError) return { message: t("c1.error.network"), retryable: true };
  return { message: t("c1.error.network"), retryable: true };
}

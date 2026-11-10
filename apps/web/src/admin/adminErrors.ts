// Generic admin error texts (docs/ux/content.md "Admin shared").
import { ApiError } from "../api/client";
import { t } from "../i18n/t";
import { formatWait } from "../lib/format";

/** The message for an admin action error that has no more specific text. */
export function adminErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 403 && error.code === "csrf_failed") return t("admin.error.csrf");
    if (error.status === 404) return t("admin.error.notFound");
    if (error.status === 429)
      return t("admin.error.rateLimited", { wait: formatWait(error.retryAfterSeconds) });
    if (error.status >= 500) return t("admin.error.server");
    return error.apiMessage ?? t("admin.error.server");
  }
  return t("admin.error.network");
}

/** True for the 401 that already sent the admin to the login page (nothing more to show). */
export function isSessionEnd(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}

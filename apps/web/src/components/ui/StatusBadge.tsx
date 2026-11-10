import type { OrderStatus } from "../../api/admin";
import { t } from "../../i18n/t";

/** Status label plus colour, never colour alone (UX-011). */
export function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span className={`badge badge--${status.replace(/_/g, "-")}`}>{t(`status.${status}`)}</span>
  );
}

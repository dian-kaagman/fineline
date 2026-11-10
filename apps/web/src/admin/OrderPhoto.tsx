import { useState } from "react";
import { orderPhotoUrl } from "../api/admin";
import { t } from "../i18n/t";
import { useAdmin } from "./AdminContext";

type PhotoView = "image" | "checking" | "noPreview" | "deleted";

interface OrderPhotoProps {
  orderId: string;
  orderNumber: string;
  /** False once the photo was deleted under the retention rule (BR-010). */
  available: boolean;
}

/**
 * The customer's original photo on A3. When the browser can't show it (HEIC outside Safari) it
 * offers a download instead; a deleted photo (photoAvailable false or 410) says so (AC-012).
 */
export function OrderPhoto({ orderId, orderNumber, available }: OrderPhotoProps) {
  const { api } = useAdmin();
  const [view, setView] = useState<PhotoView>("image");
  const url = orderPhotoUrl(orderId);

  function handleError() {
    setView("checking");
    api
      .getOrderPhotoStatus(orderId)
      .then((status) => setView(status === 410 ? "deleted" : "noPreview"))
      .catch(() => setView("noPreview"));
  }

  if (!available || view === "deleted") {
    return <p>{t("a3.photo.deleted")}</p>;
  }
  if (view === "noPreview") {
    return (
      <div className="stack">
        <p>{t("a3.photo.noPreview")}</p>
        <p>
          <a href={url} download>
            {t("a3.photo.download")}
          </a>
        </p>
      </div>
    );
  }
  return (
    <img
      className="order-photo"
      src={url}
      alt={t("a3.photo.alt", { orderNumber })}
      hidden={view === "checking"}
      onError={handleError}
    />
  );
}

import type { OrderConfirmation } from "../../api/shop";
import { Button } from "../../components/ui/Button";
import { Icon } from "../../components/ui/Icon";
import { t } from "../../i18n/t";
import { formatDateLong, formatPrice } from "../../lib/format";
import { AddressLines } from "../AddressLines";

interface ConfirmationStepProps {
  confirmation: OrderConfirmation;
  onAgain: () => void;
}

/**
 * C6 Confirmation. Every value comes from the API's OrderConfirmation, never from the form, so a
 * replayed order (200) shows the original order's values (AC-018, AC-058).
 */
export function ConfirmationStep({ confirmation, onAgain }: ConfirmationStepProps) {
  return (
    <div className="step step--confirmation stack">
      <span className="confirmation__icon">
        <Icon name="success" />
      </span>
      <h1 id="step-heading" tabIndex={-1}>
        {t("c6.heading")}
      </h1>
      <div className="order-number">
        <p className="order-number__label">{t("c6.orderNumber.label")}</p>
        <p className="order-number__value">{confirmation.orderNumber}</p>
      </div>
      <p>{t("c6.keepNumber")}</p>
      <dl className="facts">
        <div>
          <dt>{t("c6.delivery.label")}</dt>
          <dd>{formatDateLong(confirmation.estimatedDeliveryDate)}</dd>
        </div>
        <div>
          <dt>{t("c6.frame.label")}</dt>
          <dd>{confirmation.frameName}</dd>
        </div>
        <div>
          <dt>{t("c6.price.label")}</dt>
          <dd>{t("c6.price.value", { price: formatPrice(confirmation.priceCents) })}</dd>
        </div>
        <div>
          <dt>{t("c6.name.label")}</dt>
          <dd>{confirmation.customerName}</dd>
        </div>
        <div>
          <dt>{t("c6.address.label")}</dt>
          <dd>
            <AddressLines address={confirmation.address} />
          </dd>
        </div>
      </dl>
      <section aria-labelledby="next-heading">
        <h2 id="next-heading">{t("c6.next.heading")}</h2>
        <ol>
          <li>{t("c6.next.draw")}</li>
          <li>{t("c6.next.frame")}</li>
          <li>{t("c6.next.ship")}</li>
        </ol>
      </section>
      <p>{t("c6.payment")}</p>
      <div className="actions">
        <Button variant="secondary" onClick={onAgain}>
          {t("c6.again")}
        </Button>
      </div>
    </div>
  );
}

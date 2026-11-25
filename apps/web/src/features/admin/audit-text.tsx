"use client";

import { useTranslations } from "next-intl";
import type { AuditEntry } from "./admin-api";

/** `product.stock` -> `product_stock`: ICU түлхүүрт цэг байж болохгүй. */
const key = (action: string) => action.replace(".", "_");

const str = (value: unknown) => (typeof value === "string" ? value : "");

/**
 * Журналын мөрийг хүнд уншигдах текст, объект руу очих холбоос болгоно. Dashboard, агуулахын
 * самбар, журналын хуудас гурвуулаа адил хэлээр бичнэ.
 */
export function useAuditText() {
  const t = useTranslations("admin.audit");
  return (entry: AuditEntry) => {
    const data = entry.data as Record<string, unknown>;
    let detail: string | null = null;
    switch (entry.action) {
      case "product.create":
        detail = str(data.name) || null;
        break;
      case "product.update":
        detail = Array.isArray(data.fields) ? t("detail.fields", { fields: data.fields.join(", ") }) : null;
        break;
      case "product.stock":
        detail = t("detail.stock", { previous: Number(data.previous), quantity: Number(data.quantity) });
        break;
      case "order.ship":
        detail = t("detail.ship", { carrier: str(data.carrier), tracking: str(data.tracking_number) });
        break;
      case "order.cancel":
        detail = str(data.reason) ? t("detail.reason", { reason: str(data.reason) }) : null;
        break;
      case "order.refund":
        detail = [
          str(data.reason) ? t("detail.reason", { reason: str(data.reason) }) : null,
          data.restock ? t("detail.restocked") : t("detail.notRestocked"),
        ]
          .filter(Boolean)
          .join(" · ");
        break;
    }
    const isProduct = entry.entity_type === "product";
    return {
      what: t(`action.${key(entry.action)}` as "action.product_stock"),
      detail,
      object: isProduct ? t("product", { id: entry.entity_id }) : entry.entity_id,
      href: isProduct ? `/admin/products/${entry.entity_id}` : `/admin/orders/${entry.entity_id}`,
      who: entry.actor_id === null && !entry.actor_label ? t("removedStaff") : entry.actor_label,
    };
  };
}

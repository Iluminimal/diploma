import { useTranslations } from "next-intl";
import type { ShippingZone } from "./checkout-api";

type Method = { id: string; label: string; description?: string; estimated_days: string };

/**
 * Хүргэлтийн аргын нэр, тайлбар, хугацаа: API монголоор өгдөг тул танигдсан `id` (standard, express,
 * pickup) бүрийг идэвхтэй хэл рүү орчуулж, үл мэдэгдэх аргыг API-аас ирсэн хэвээрээ харуулна. Энгийн
 * хүргэлтийн тайлбар, хугацаа бүсээс (`ub`, `rural`) хамаарна. Авах цэгийн тайлбар нь хаяг тул API-аас.
 */
export function useShippingText(zone: ShippingZone = "ub") {
  const t = useTranslations("checkout.shipping") as unknown as ((key: string) => string) & {
    has: (key: string) => boolean;
  };
  const pick = (method: Method, field: "label" | "description" | "days", fallback: string | undefined) => {
    for (const key of [`${method.id}.${zone}.${field}`, `${method.id}.${field}`]) {
      if (t.has(key)) return t(key);
    }
    return fallback ?? "";
  };
  return {
    label: (method: Method) => pick(method, "label", method.label),
    description: (method: Method) => pick(method, "description", method.description),
    days: (method: Method) => pick(method, "days", method.estimated_days),
  };
}

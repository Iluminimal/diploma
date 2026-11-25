/**
 * Монголын засаг захиргааны нэгж: хүргэлтийн хаяг болон хүргэлтийн бүс. API-ийн
 * `angel/core/mongolia.py`-тэй ижил жагсаалт (өөрчлөхдөө хоёуланг нь шинэчилнэ).
 */
export const CAPITAL = "Улаанбаатар";

export const AIMAGS = [
  "Архангай",
  "Баян-Өлгий",
  "Баянхонгор",
  "Булган",
  "Говь-Алтай",
  "Говьсүмбэр",
  "Дархан-Уул",
  "Дорноговь",
  "Дорнод",
  "Дундговь",
  "Завхан",
  "Орхон",
  "Өвөрхангай",
  "Өмнөговь",
  "Сүхбаатар",
  "Сэлэнгэ",
  "Төв",
  "Увс",
  "Ховд",
  "Хөвсгөл",
  "Хэнтий",
] as const;

/** Нийслэл эхэнд, дараа нь аймгууд цагаан толгойн дарааллаар. */
export const REGIONS = [CAPITAL, ...AIMAGS] as const;

/** Нийслэлийн 9 дүүрэг: нийслэлд хаяг заавал эдгээрийн нэгээр тодорхойлогдоно. */
export const CAPITAL_DISTRICTS = [
  "Баянгол",
  "Баянзүрх",
  "Сонгинохайрхан",
  "Сүхбаатар",
  "Хан-Уул",
  "Чингэлтэй",
  "Налайх",
  "Багануур",
  "Багахангай",
] as const;

export type ShippingZone = "ub" | "rural";

export const isCapital = (region: string | null | undefined) => region === CAPITAL;

/** Хүргэлтийн бүс: нийслэл бол `ub` (шуурхай хүргэлттэй), аймаг бол `rural`. */
export const zoneFor = (region: string | null | undefined): ShippingZone => (isCapital(region) ? "ub" : "rural");

/** Утасны дугаар: 8 орон. "+976", зай, зураас байж болно. Цэвэр 8 оронг буцаана, буруу бол null. */
export function localPhoneDigits(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  const local = digits.startsWith("976") && digits.length === 11 ? digits.slice(3) : digits;
  return /^[0-9]{8}$/.test(local) ? local : null;
}

/** "+97699112233" -> "+976 9911 2233" (жагсаалт, захиалгад харуулах). */
export function displayPhone(e164: string | null | undefined): string {
  const local = e164 ? localPhoneDigits(e164) : null;
  return local ? `+976 ${local.slice(0, 4)} ${local.slice(4)}` : (e164 ?? "");
}

/** "+97699112233" -> "9911 2233" (маягтад харуулах). */
export function formatLocalPhone(e164: string | null | undefined): string {
  const local = e164 ? localPhoneDigits(e164) : null;
  return local ? `${local.slice(0, 4)} ${local.slice(4)}` : (e164 ?? "");
}

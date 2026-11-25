/**
 * Дэлгүүрийн цорын ганц валют нь төгрөг (Amazon, Apple зах зээл бүрдээ орон нутгийн валютаар үнэлдэг
 * шиг). Үнэ API-д бага нэгжээр (төгрөг x 100) ирнэ. Ханшийн хөрвүүлэлт байхгүй: харуулсан дүн яг
 * төлөх дүн.
 */
export const BASE_CURRENCY = "MNT";

/**
 * Мөнгөний дүрслэл: төгрөг бутархайгүй, "₮" тэмдэгтэй, урд нь ("₮125,383"). Төгрөгийн хэлбэрийг
 * `Intl`-ээр биш өөрсдөө угсарна: сервер (Node), хөтөч хоёрын ICU өгөгдөл төгрөгийн тэмдэгтийн
 * зайг өөр өөрөөр гаргадаг тул hydration алдаа өгдөг байсан. Тоог нь "en-US" бүлэглэлтээр (таслал)
 * гаргана: монгол хэлний бүлэглэлтэй ижил, хаана ч адилхан. Өөр валют (хуучин USD захиалгын түүх)
 * өөрийн бутархай, `Intl`-тэйгээ.
 */
export function formatMoney(minor: number, currency: string, tag: string): string {
  if (currency === "MNT") {
    const whole = Math.round(Math.abs(minor) / 100);
    return `${minor < 0 ? "-" : ""}₮${whole.toLocaleString("en-US")}`;
  }
  return new Intl.NumberFormat(tag, {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: minor % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(minor / 100);
}

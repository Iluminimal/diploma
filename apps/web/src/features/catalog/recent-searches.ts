const KEY = "angel:recent-searches";
const MAX = 5;

/**
 * Энэ төхөөрөмж дээрх сүүлийн хэдэн текст хайлт. Storage хаалттай эсвэл дүүрэн байж болно: тэгвэл
 * хоосон гэсэн үг.
 */
export function readRecentSearches(): string[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string").slice(0, MAX) : [];
  } catch {
    return [];
  }
}

/** Шинэ нь түрүүнд, давхардалгүй (том жижиг үсгийг үл хамаарна). Хадгалсан жагсаалтыг буцаана. */
export function rememberSearch(query: string): string[] {
  const text = query.trim();
  if (!text) return readRecentSearches();
  const next = [text, ...readRecentSearches().filter((q) => q.toLowerCase() !== text.toLowerCase())].slice(0, MAX);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Санахгүй байсан ч зүгээр.
  }
  return next;
}

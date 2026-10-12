const KEY = "angel:recent-searches";
const MAX = 5;

/** The last few text searches on this device. Storage can be blocked or full: that just means none. */
export function readRecentSearches(): string[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string").slice(0, MAX) : [];
  } catch {
    return [];
  }
}

/** Newest first, no duplicates (ignoring case). Returns the stored list. */
export function rememberSearch(query: string): string[] {
  const text = query.trim();
  if (!text) return readRecentSearches();
  const next = [text, ...readRecentSearches().filter((q) => q.toLowerCase() !== text.toLowerCase())].slice(0, MAX);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Not remembering is fine.
  }
  return next;
}

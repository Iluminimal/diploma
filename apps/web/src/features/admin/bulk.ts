/**
 * `items` бүрт `fn`-ийг нэгэн зэрэг хамгийн ихдээ `limit` ширхгээр ажиллуулна (олон бараа нэг дор
 * хасахад API-г хэт ачаалахгүйн тулд). Нэг нь унасан ч бусад үргэлжилнэ: үр дүн бүрийг дарааллаар нь
 * буцаана.
 */
export async function runLimited<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      try {
        results[index] = { status: "fulfilled", value: await fn(items[index]!) };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/** `runLimited`-ийн үр дүнгээс амжилттай, амжилтгүй тоо. */
export function tally(results: readonly PromiseSettledResult<unknown>[]) {
  const done = results.filter((result) => result.status === "fulfilled").length;
  return { done, failed: results.length - done };
}

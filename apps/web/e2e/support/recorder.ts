import type { Page } from "@playwright/test";

export type RecordedSearch = { url: string; fields: string[] };

/**
 * Records the multipart forms the page sends to the search endpoints. (Playwright cannot read a
 * multipart body that contains a Blob, so the page's own `fetch` is wrapped instead.)
 */
export async function recordSearches(page: Page) {
  await page.addInitScript(() => {
    const original = window.fetch;
    const w = window as unknown as { __searches: { url: string; fields: string[] }[] };
    w.__searches = [];
    window.fetch = (input, init) => {
      const url = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
      if (url.includes("/api/v1/search/") && init?.body instanceof FormData) {
        const fields = [...init.body.entries()].map(([key, value]) =>
          value instanceof File ? `${key}=<file ${value.name} ${value.type}>` : `${key}=${value}`,
        );
        w.__searches.push({ url, fields });
      }
      return original(input, init);
    };
  });
  return {
    all: () => page.evaluate(() => (window as unknown as { __searches: RecordedSearch[] }).__searches),
    clear: () => page.evaluate(() => ((window as unknown as { __searches: RecordedSearch[] }).__searches = [])),
  };
}

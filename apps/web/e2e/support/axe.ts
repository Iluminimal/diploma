import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"];

export const VIEWPORTS = {
  phone: { width: 390, height: 844 },
  desktop: { width: 1440, height: 900 },
} as const;
export const SCHEMES = ["light", "dark"] as const;

export type Variant = { viewport: keyof typeof VIEWPORTS; scheme: (typeof SCHEMES)[number] };

export const VARIANTS: Variant[] = Object.keys(VIEWPORTS).flatMap((viewport) =>
  SCHEMES.map((scheme) => ({ viewport: viewport as Variant["viewport"], scheme })),
);

/** Хуудас агуулгаа зурсан: юу ч ачаалж байхгүй, web font болон transition тогтсон. */
export async function settled(page: Page) {
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
  // Contrast-ыг зурагдсан зүйлээр хэмждэг: эхлээд fade болон slide-in дуусгана.
  await page.waitForTimeout(400);
}

type Found = { variant: string; rule: string; impact: string; help: string; targets: string[] };

/** Одоогийн хуудсан дээр axe ажиллуулж, олсон зүйлийг дүрэм бүрээр нэг мөрөөр буцаана. */
export async function scan(page: Page, label: string): Promise<Found[]> {
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  return results.violations.map((violation) => ({
    variant: label,
    rule: violation.id,
    impact: violation.impact ?? "unknown",
    help: violation.help,
    targets: violation.nodes.slice(0, 4).map((node) => `${node.target.join(" ")}\n      ${node.html.slice(0, 140)}`),
  }));
}

/**
 * Дэлгэцийг viewport болон өнгөний горим бүрээр ачаалж шалгана. `open` нь хуудсыг шалгах төлөвт
 * оруулж (dialog нээх, үр дүн харуулах), навигаци бүрийн дараа ажиллана.
 */
export async function sweep(
  page: Page,
  url: string,
  options: { ready?: () => Promise<void>; variants?: Variant[] } = {},
) {
  const found: Found[] = [];
  for (const variant of options.variants ?? VARIANTS) {
    await page.setViewportSize(VIEWPORTS[variant.viewport]);
    await page.emulateMedia({ colorScheme: variant.scheme, reducedMotion: "reduce" });
    await page.goto(url);
    await (options.ready ?? (async () => {}))();
    await settled(page);
    found.push(...(await scan(page, `${variant.viewport}/${variant.scheme}`)));
  }
  expectNoViolations(found, url);
}

export function expectNoViolations(found: Found[], where: string) {
  const text = found
    .map(
      (f) =>
        `[${f.variant}] ${f.rule} (${f.impact}): ${f.help}\n    ${f.targets.map((t) => `${t}`).join("\n    ")}`,
    )
    .join("\n");
  expect(found, `accessibility violations on ${where}:\n${text}`).toEqual([]);
}

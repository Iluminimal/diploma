import { expect, type Page } from "@playwright/test";
import type { CatalogProduct } from "./api";

/** Opens the header's search panel (the magnifier) and returns its field. */
export async function openSearch(page: Page) {
  await page.getByRole("button", { name: "Search", exact: true }).click();
  const box = page.getByRole("combobox");
  await expect(box).toBeVisible();
  await expect(box).toBeFocused();
  return box;
}

// The phone tab bar has a cart button too (hidden on a computer): the one that can be seen.
export const cartButton = (page: Page) => page.locator('button[aria-label^="Bag"]:visible');

export async function openProduct(page: Page, product: CatalogProduct) {
  await page.goto(`/products/${product.id}/${product.slug}`);
  await expect(page.getByRole("heading", { level: 1, name: product.name })).toBeVisible();
}

/** Chooses the first size the product offers (adult sizes, kids' sizes and shoe sizes all differ). */
export async function chooseSize(page: Page): Promise<string> {
  const label = page.locator("fieldset label").first();
  const size = (await label.innerText()).trim();
  await label.click();
  return size;
}

/** Picks a size and adds the product; leaves the mini-cart drawer open. Returns the size chosen. */
export async function addToCartFromProductPage(page: Page, product: CatalogProduct): Promise<string> {
  await openProduct(page, product);
  const size = await chooseSize(page);
  await page.getByRole("button", { name: /add to bag/i }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  return size;
}

export async function signInThroughTheForm(page: Page, email: string, password: string) {
  await page.getByRole("tab", { name: "Email" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

export const money = (cents: number) => `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;

/** Spread tests over the catalogue so parallel purchases rarely meet on the last unit of one product. */
export function pickProduct(products: CatalogProduct[], testIndex: number): CatalogProduct {
  return products[testIndex % products.length]!;
}

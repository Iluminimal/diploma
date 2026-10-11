import type { APIRequestContext } from "@playwright/test";
import { API_URL } from "./env";

type Node = { name: string; slug: string; path: string; product_count: number; children: Node[] };
type Department = { slug: string; name: string; product_count: number; groups: Node[] };

/**
 * Where to click in whatever catalogue this stack has (the real one or the CI seed): the biggest
 * department, its first group, and that group's biggest sub-category.
 */
export async function pickCategory(request: APIRequestContext) {
  const response = await request.get(`${API_URL}/api/v1/catalog/nav`);
  const { departments } = (await response.json()) as { departments: Department[] };
  const department = [...departments].sort((a, b) => b.product_count - a.product_count)[0]!;
  const group = department.groups[0]!;
  const sub = group.children[0]!;
  return { department, group, sub };
}

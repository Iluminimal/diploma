import type { APIRequestContext } from "@playwright/test";
import { API_URL } from "./env";

type Node = { name: string; slug: string; path: string; product_count: number; children: Node[] };
type Department = { slug: string; name: string; product_count: number; groups: Node[] };

/**
 * Энэ stack-ийн каталогт (жинхэнэ эсвэл CI seed) хаана дарахыг заана: хамгийн том department,
 * түүний эхний бүлэг, тэр бүлгийн хамгийн том дэд ангилал.
 */
export async function pickCategory(request: APIRequestContext) {
  const response = await request.get(`${API_URL}/api/v1/catalog/nav`);
  const { departments } = (await response.json()) as { departments: Department[] };
  const department = [...departments].sort((a, b) => b.product_count - a.product_count)[0]!;
  const group = department.groups[0]!;
  const sub = group.children[0]!;
  return { department, group, sub };
}

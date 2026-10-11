import { resolveTrail } from "@/features/catalog/category-trail";

/**
 * Checks the category before anything streams. The page itself sits behind `loading.tsx`, and by
 * the time it could call `notFound()` the response would already be a 200: a layout answers with
 * a real 404 status, which is what search engines need to drop a dead URL.
 */
export default async function CategoryLayout({ children, params }: LayoutProps<"/c/[department]/[[...path]]">) {
  await resolveTrail(params);
  return children;
}

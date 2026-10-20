import { resolveTrail } from "@/features/catalog/category-trail";

/**
 * Stream эхлэхээс өмнө ангиллыг шалгана. Хуудас өөрөө `loading.tsx`-ийн ард байдаг бөгөөд
 * `notFound()` дуудах үед хариу аль хэдийн 200 болсон байдаг; layout жинхэнэ 404 статус өгдөг,
 * хайлтын систем үхсэн URL-ыг хасахад яг үүнийг хүлээдэг.
 */
export default async function CategoryLayout({ children, params }: LayoutProps<"/c/[department]/[[...path]]">) {
  await resolveTrail(params);
  return children;
}

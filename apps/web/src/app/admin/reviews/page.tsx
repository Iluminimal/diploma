import type { Metadata } from "next";
import { parseReviewParams } from "@/features/admin/list-params";
import { ReviewsList } from "@/features/admin/reviews-views";

export const metadata: Metadata = { title: "Reviews" };

export default async function AdminReviewsPage({ searchParams }: PageProps<"/admin/reviews">) {
  return <ReviewsList params={parseReviewParams(await searchParams)} />;
}

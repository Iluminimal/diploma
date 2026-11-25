"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { AppliedFilters } from "@/features/search/applied-filters";
import { RefineForm } from "@/features/search/refine-form";
import { searchSimilarWithText } from "@/features/search/search-api";
import { useUserMessage } from "@/lib/api/use-user-message";
import type { Product } from "./product";
import { ProductRail, RailSkeleton } from "./product-rail";

type Props = { productId: number; initial: Product[]; label: string };

/**
 * "Танд таалагдаж магадгүй" мөр + "энэ шиг, гэхдээ цэнхэр" тодруулга. Анхны жагсаалт server-ээс
 * ирдэг (SSR); текст оруулмагц хадгалсан embedding-д текст нэмсэн хайлт хийнэ.
 */
export function SimilarRefine({ productId, initial, label }: Props) {
  const t = useTranslations("catalog.similarRefine");
  const userMessage = useUserMessage();
  const [text, setText] = useState("");
  const refined = useQuery({
    queryKey: ["similar-refine", productId, text],
    queryFn: ({ signal }) => searchSimilarWithText(productId, text, 12, signal),
    enabled: text !== "",
    staleTime: Infinity,
    gcTime: 60_000,
    retry: false,
  });

  const products = text ? (refined.data?.results.map((hit) => hit.product) ?? []) : initial;

  return (
    <div className="space-y-5">
      <div className="max-w-xl">
        <RefineForm applied={text} onSubmit={setText} />
      </div>
      {text && <AppliedFilters applied={refined.data?.applied ?? []} />}
      {text && refined.isPending ? (
        <RailSkeleton />
      ) : text && refined.isError ? (
        <p role="alert" className="text-destructive type-caption">
          {userMessage(refined.error)}
        </p>
      ) : products.length === 0 ? (
        <p className="text-muted-foreground type-caption">{t("none")}</p>
      ) : (
        <ProductRail products={products} label={label} />
      )}
    </div>
  );
}

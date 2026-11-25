import { browserApi, call } from "@/lib/api/browser";
import { toApiFilters, type ListingQuery } from "./filters";

/** `listProducts`-тай ижил хүсэлт, гэхдээ browser-оос: "Нэмж харах" дараагийн хуудсыг ингэж татна. */
export const fetchProductPage = (query: ListingQuery, page: number, pageSize: number) =>
  call(
    browserApi().GET("/api/v1/products", {
      params: {
        query: {
          ...toApiFilters(query),
          q: query.q,
          department: query.department,
          category: query.category,
          sort: query.sort,
          page,
          page_size: pageSize,
        },
      },
    }),
  );

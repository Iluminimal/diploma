"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ArrowLeft, ImageUp, RefreshCw, SearchX, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, type DragEvent } from "react";
import { ProductCard } from "@/components/product/product-card";
import { ProductGridSkeleton } from "@/components/product/product-grid";
import { Button } from "@/components/ui/button";
import type { CatalogFilterOptions } from "@/features/catalog/product";
import { useUserMessage } from "@/lib/api/use-user-message";
import { useDebounced } from "@/lib/use-debounced";
import { AppliedFilters } from "./applied-filters";
import { DetectedChip } from "./detected-chip";
import { GarmentSections } from "./garment-sections";
import { ImageDropzone } from "./image-dropzone";
import { RefineForm } from "./refine-form";
import { RegionOverlay } from "./region-overlay";
import { garmentAsSearchResponse, searchByImage, searchGarments } from "./search-api";
import { SearchFilterBar } from "./search-filter-bar";
import { useSearchStore } from "./search-store";
import { SimilarityBadge } from "./similarity-badge";
import { firstImage, useImageInput, usePasteImage } from "./use-image-input";

// Шүүлтүүрийн сонголтуудыг багцалдаг тул хурдан хэдэн товшилт нэг хүсэлт болно (зургийн хайлт rate
// limit-тэй).
const FILTER_DEBOUNCE_MS = 400;

function allArticleTypes(options: CatalogFilterOptions): string[] {
  const names = new Set<string>();
  const walk = (nodes: CatalogFilterOptions["categories"]) =>
    nodes.forEach((n) => (n.level === 3 ? names.add(n.name) : walk(n.children)));
  walk(options.categories);
  return [...names].sort((a, b) => a.localeCompare(b));
}

export function SearchView({ options }: { options: CatalogFilterOptions }) {
  const t = useTranslations("search.view");
  const tGarments = useTranslations("search.garments");
  const userMessage = useUserMessage();
  const image = useSearchStore((s) => s.image);
  const filters = useSearchStore((s) => s.filters);
  const articleType = useSearchStore((s) => s.articleType);
  const refinement = useSearchStore((s) => s.refinement);
  const regionIndex = useSearchStore((s) => s.regionIndex);
  const focused = useSearchStore((s) => s.focused);
  const { clearImage, setFilters, setArticleType, setRefinement, focusRegion, showAllGarments } =
    useSearchStore.getState();

  const { pick, busy, error: inputError } = useImageInput();
  usePasteImage(useCallback((file) => void pick(file), [pick]));

  const debouncedFilters = useDebounced(filters, FILTER_DEBOUNCE_MS);
  const imageId = image?.id;
  // Хэрэглэгч нэг хувцас сонгоогүй, ангилал, үгээр нарийсгаагүй бол зурагт олдсон бүх хувцсыг нэг дор
  // хайна; үгүй бол (нэг хувцас, ангилал, hybrid) нэг-хувцасны хайлт.
  const grouped = !focused && !refinement && articleType === null;
  // Шүүлтүүр солигдох үед өмнөх үр дүнг харуулсаар байна, гэхдээ өөр зургийнхыг хэзээ ч биш.
  const keepWithinImage = <T,>(previous: T | undefined, previousQuery?: { queryKey: readonly unknown[] }) =>
    previousQuery?.queryKey[1] === imageId ? keepPreviousData(previous) : undefined;
  const garmentSearch = useQuery({
    queryKey: ["garment-search", imageId, debouncedFilters],
    queryFn: ({ signal }) => searchGarments(image!.file, { filters: debouncedFilters }, signal),
    enabled: Boolean(image) && grouped,
    staleTime: Infinity,
    gcTime: 60_000,
    retry: false,
    placeholderData: keepWithinImage,
  });
  const singleSearch = useQuery({
    queryKey: ["image-search", imageId, debouncedFilters, articleType, refinement, regionIndex],
    queryFn: ({ signal }) =>
      searchByImage(image!.file, { filters: debouncedFilters, articleType, refinement, region: regionIndex }, signal),
    enabled: Boolean(image) && !grouped,
    staleTime: Infinity,
    gcTime: 60_000,
    retry: false,
    placeholderData: keepWithinImage,
  });
  const search = grouped ? garmentSearch : singleSearch;
  const garments = grouped ? garmentSearch.data?.garments : undefined;
  const severalGarments = garments !== undefined && garments.length > 1;
  const data =
    grouped && garmentSearch.data
      ? garments!.length === 1
        ? garmentAsSearchResponse(garmentSearch.data)
        : undefined
      : singleSearch.data;
  // Хайрцгууд: нэг-хувцасны хариу ирэхээс өмнө (шилжих үед) нэгдсэн хариунаас авна.
  const regions = data?.regions ?? garmentSearch.data?.garments.map((g) => g.region) ?? [];

  function onDrop(event: DragEvent) {
    event.preventDefault();
    const files = event.dataTransfer.files;
    const file = firstImage(files) ?? files[0];
    if (file) void pick(file);
  }

  const refreshing = search.isPlaceholderData;

  return (
    <div
      className="container-page py-8 md:py-12"
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      <div className="mb-8 max-w-2xl space-y-2">
        <h1 className="type-display">{t("title")}</h1>
        <p className="text-muted-foreground type-intro">
          {t("intro")}
        </p>
      </div>

      {!image ? (
        <ImageDropzone className="max-w-3xl" />
      ) : (
        <div className="grid gap-8 lg:grid-cols-[19rem_1fr] lg:gap-12">
          <aside className="space-y-5 self-start lg:sticky lg:top-24">
            <div className="flex gap-4 lg:block">
              <div className="tile w-28 shrink-0 sm:w-36 lg:w-full">
                {/* Wrapper нь зурагтай яг ижил хэмжээтэй (тайрахгүй), ингэснээр detector-ийн хайрцгууд
                    зураг дээр яг давхцана. */}
                <div className="relative mx-auto w-fit max-w-full">
                  {/* eslint-disable-next-line @next/next/no-img-element -- локал blob URL, optimize хийх боломжгүй */}
                  <img src={image.previewUrl} alt={t("yourPhoto")} className="block max-h-[26rem] w-auto max-w-full" />
                  {search.isFetching && (
                    // Хайлт явагдах үед зураг дээгүүр зөөлөн зурвас доош сэлгэнэ.
                    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
                      <div className="animate-scan from-brand/0 via-brand/45 to-brand/0 absolute inset-x-0 top-0 h-1/3 bg-linear-to-b" />
                    </div>
                  )}
                  <RegionOverlay regions={regions} selected={grouped ? -1 : regionIndex} onSelect={focusRegion} />
                </div>
              </div>
              <div className="flex min-w-0 flex-1 flex-col justify-center gap-2 lg:mt-3 lg:flex-row lg:flex-initial lg:justify-start">
                <ReplaceButton onPick={pick} busy={busy} />
                <Button variant="ghost" size="lg" className="h-10 justify-start lg:justify-center" onClick={clearImage}>
                  <Trash2 /> {t("remove")}
                </Button>
              </div>
            </div>
            {inputError && (
              <p role="alert" className="text-destructive type-caption">
                {inputError}
              </p>
            )}
            {!severalGarments && (
              <DetectedChip
                detected={data?.detected ?? []}
                value={articleType}
                allTypes={allArticleTypes(options)}
                onChange={setArticleType}
              />
            )}
            <RefineForm applied={refinement} onSubmit={setRefinement} />
            <p className="text-muted-foreground type-fine">{t("private")}</p>
          </aside>

          <section aria-label={t("results")} className="min-w-0 space-y-5">
            <SearchFilterBar options={options} filters={filters} onChange={setFilters} />

            <p className="text-muted-foreground min-h-5 type-caption" role="status" aria-live="polite">
              {search.isPending
                ? t("searching")
                : severalGarments
                  ? t("timing", {
                      count: t("garmentsFound", { count: garments.length }),
                      ms: Math.round(garmentSearch.data!.timings.total_ms),
                    })
                  : data
                  ? t("timing", {
                      count: refinement
                        ? t("countFor", { count: data.results.length, query: refinement })
                        : t("count", { count: data.results.length }),
                      ms: Math.round(data.timings.total_ms),
                    })
                  : ""}
            </p>

            <AppliedFilters applied={data?.applied ?? []} />

            {focused && (
              <Button variant="ghost" size="lg" className="h-10 -ml-3" onClick={showAllGarments}>
                <ArrowLeft /> {tGarments("back")}
              </Button>
            )}

            {search.isError ? (
              <div role="alert" className="tile flex flex-col items-center gap-4 px-6 py-16 text-center">
                <p className="max-w-sm type-caption">{userMessage(search.error)}</p>
                <Button variant="outline" size="lg" onClick={() => void search.refetch()}>
                  <RefreshCw /> {t("tryAgain")}
                </Button>
              </div>
            ) : search.isPending ? (
              <ProductGridSkeleton count={9} columns={3} />
            ) : severalGarments ? (
              <GarmentSections garments={garments} onFocus={focusRegion} refreshing={refreshing} />
            ) : data && data.results.length === 0 ? (
              <div className="tile flex flex-col items-center gap-3 px-6 py-16 text-center">
                <SearchX className="text-muted-foreground size-8" />
                <p className="font-medium">{t("none")}</p>
                <p className="text-muted-foreground max-w-sm type-caption">
                  {t("noneHint")}
                </p>
              </div>
            ) : (
              data && (
                <ul
                  className={`grid grid-cols-2 gap-x-3 gap-y-8 transition-opacity sm:grid-cols-3 sm:gap-x-5 ${refreshing ? "opacity-50" : ""}`}
                  aria-busy={refreshing}
                >
                  {data.results.map((hit, i) => (
                    <li
                      key={hit.product.id}
                      // Үр дүн нэг нэгээр дээшилж гарна; саатал есөн мөр тутамд давтагдана.
                      className="animate-in fade-in slide-in-from-bottom-3 fill-mode-backwards duration-500"
                      style={{ animationDelay: `${(i % 9) * 45}ms` }}
                    >
                      <ProductCard
                        product={hit.product}
                        priority={i < 3}
                        headingLevel={2}
                        sizes="(min-width: 1024px) 22vw, (min-width: 640px) 30vw, 50vw"
                        badge={<SimilarityBadge similarity={hit.similarity} />}
                      />
                    </li>
                  ))}
                </ul>
              )
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function ReplaceButton({ onPick, busy }: { onPick: (file: File) => Promise<boolean>; busy: boolean }) {
  const t = useTranslations("search.view");
  return (
    <Button variant="outline" size="lg" className="h-10" disabled={busy} asChild>
      <label className="cursor-pointer">
        <ImageUp /> {busy ? t("preparing") : t("replace")}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void onPick(file);
            e.target.value = "";
          }}
        />
      </label>
    </Button>
  );
}

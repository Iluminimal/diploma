"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ImageUp, RefreshCw, SearchX, Trash2 } from "lucide-react";
import { useCallback, type DragEvent } from "react";
import { ProductCard } from "@/components/product-card";
import { ProductGridSkeleton } from "@/components/product-grid";
import { Button } from "@/components/ui/button";
import type { CatalogFilterOptions } from "@/features/catalog/product";
import { userMessage } from "@/lib/api/errors";
import { useDebounced } from "@/lib/use-debounced";
import { DetectedChip } from "./detected-chip";
import { ImageDropzone } from "./image-dropzone";
import { RefineForm } from "./refine-form";
import { searchByImage } from "./search-api";
import { SearchFilterBar } from "./search-filter-bar";
import { useSearchStore } from "./search-store";
import { SimilarityBadge } from "./similarity-badge";
import { firstImage, useImageInput, usePasteImage } from "./use-image-input";

// Filter toggles are batched so a few quick taps cost one request (image search is rate limited).
const FILTER_DEBOUNCE_MS = 400;

function allArticleTypes(options: CatalogFilterOptions): string[] {
  const names = new Set<string>();
  const walk = (nodes: CatalogFilterOptions["categories"]) =>
    nodes.forEach((n) => (n.level === 3 ? names.add(n.name) : walk(n.children)));
  walk(options.categories);
  return [...names].sort((a, b) => a.localeCompare(b));
}

export function SearchView({ options }: { options: CatalogFilterOptions }) {
  const image = useSearchStore((s) => s.image);
  const filters = useSearchStore((s) => s.filters);
  const articleType = useSearchStore((s) => s.articleType);
  const refinement = useSearchStore((s) => s.refinement);
  const { clearImage, setFilters, setArticleType, setRefinement } = useSearchStore.getState();

  const { pick, busy, error: inputError } = useImageInput();
  usePasteImage(useCallback((file) => void pick(file), [pick]));

  const debouncedFilters = useDebounced(filters, FILTER_DEBOUNCE_MS);
  const imageId = image?.id;
  const search = useQuery({
    queryKey: ["image-search", imageId, debouncedFilters, articleType, refinement],
    queryFn: ({ signal }) => searchByImage(image!.file, { filters: debouncedFilters, articleType, refinement }, signal),
    enabled: Boolean(image),
    staleTime: Infinity,
    gcTime: 60_000,
    retry: false,
    // Keep showing the previous results while a filter changes, but never another photo's.
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[1] === imageId ? keepPreviousData(previous) : undefined,
  });

  function onDrop(event: DragEvent) {
    event.preventDefault();
    const files = event.dataTransfer.files;
    const file = firstImage(files) ?? files[0];
    if (file) void pick(file);
  }

  const data = search.data;
  const refreshing = search.isPlaceholderData;

  return (
    <div
      className="container-page py-8 md:py-12"
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      <div className="mb-8 max-w-2xl space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Search by photo</h1>
        <p className="text-muted-foreground text-sm md:text-base">
          Upload a picture of something you like and we&apos;ll find similar pieces in our catalogue.
        </p>
      </div>

      {!image ? (
        <ImageDropzone className="max-w-3xl" />
      ) : (
        <div className="grid gap-8 lg:grid-cols-[19rem_1fr] lg:gap-12">
          <aside className="space-y-5 self-start lg:sticky lg:top-24">
            <div className="flex gap-4 lg:block">
              <div className="bg-muted relative aspect-[3/4] w-28 shrink-0 overflow-hidden rounded-2xl sm:w-36 lg:w-full">
                {/* eslint-disable-next-line @next/next/no-img-element -- a local blob URL, not optimizable */}
                <img src={image.previewUrl} alt="Your photo" className="size-full object-cover" />
              </div>
              <div className="flex min-w-0 flex-1 flex-col justify-center gap-2 lg:mt-3 lg:flex-row lg:flex-initial lg:justify-start">
                <ReplaceButton onPick={pick} busy={busy} />
                <Button variant="ghost" size="lg" className="h-10 justify-start lg:justify-center" onClick={clearImage}>
                  <Trash2 /> Remove
                </Button>
              </div>
            </div>
            {inputError && (
              <p role="alert" className="text-destructive text-sm">
                {inputError}
              </p>
            )}
            <DetectedChip
              detected={data?.detected ?? []}
              value={articleType}
              allTypes={allArticleTypes(options)}
              onChange={setArticleType}
            />
            <RefineForm applied={refinement} onSubmit={setRefinement} />
            <p className="text-muted-foreground text-xs">Your photo is used only for this search and is never stored.</p>
          </aside>

          <section aria-label="Results" className="min-w-0 space-y-5">
            <SearchFilterBar options={options} filters={filters} onChange={setFilters} />

            <p className="text-muted-foreground min-h-5 text-sm" role="status" aria-live="polite">
              {search.isPending
                ? "Searching…"
                : data
                  ? `${data.results.length} similar ${data.results.length === 1 ? "item" : "items"}${
                      refinement ? ` for “${refinement}”` : ""
                    } · ${Math.round(data.timings.total_ms)} ms`
                  : ""}
            </p>

            {search.isError ? (
              <div role="alert" className="border-border flex flex-col items-center gap-4 rounded-3xl border border-dashed px-6 py-16 text-center">
                <p className="max-w-sm text-sm">{userMessage(search.error)}</p>
                <Button variant="outline" size="lg" onClick={() => void search.refetch()}>
                  <RefreshCw /> Try again
                </Button>
              </div>
            ) : search.isPending ? (
              <ProductGridSkeleton count={9} columns={3} />
            ) : data && data.results.length === 0 ? (
              <div className="border-border flex flex-col items-center gap-3 rounded-3xl border border-dashed px-6 py-16 text-center">
                <SearchX className="text-muted-foreground size-8" />
                <p className="font-medium">No close matches</p>
                <p className="text-muted-foreground max-w-sm text-sm">
                  Try removing a filter or the category, or use a clearer photo of a single item.
                </p>
              </div>
            ) : (
              data && (
                <ul
                  className={`grid grid-cols-2 gap-x-3 gap-y-8 transition-opacity sm:grid-cols-3 sm:gap-x-5 ${refreshing ? "opacity-50" : ""}`}
                  aria-busy={refreshing}
                >
                  {data.results.map((hit, i) => (
                    <li key={hit.product.id}>
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
  return (
    <Button variant="outline" size="lg" className="h-10" disabled={busy} asChild>
      <label className="cursor-pointer">
        <ImageUp /> {busy ? "Preparing…" : "Replace photo"}
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

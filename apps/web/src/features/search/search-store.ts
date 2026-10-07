import { create } from "zustand";
import { emptyFilters, type CatalogFilters } from "@/features/catalog/filters";

export type PickedImage = {
  /** Changes with every new photo; part of the query key so results never mix between photos. */
  id: number;
  file: File;
  /** Object URL for the preview. Revoked when the photo is replaced or removed. */
  previewUrl: string;
};

type SearchState = {
  image: PickedImage | null;
  filters: CatalogFilters;
  /** Category the user chose (null = any). Detected categories are suggestions only. */
  articleType: string | null;
  refinement: string;
  setImage: (file: File) => void;
  clearImage: () => void;
  setFilters: (filters: CatalogFilters) => void;
  setArticleType: (articleType: string | null) => void;
  setRefinement: (text: string) => void;
};

let nextId = 1;

/**
 * Small client state for the visual search flow. The photo lives only here, in memory (never in
 * localStorage or on a server), which is also how the home page hands a photo to /search.
 */
export const useSearchStore = create<SearchState>((set, get) => ({
  image: null,
  filters: emptyFilters(),
  articleType: null,
  refinement: "",
  setImage: (file) => {
    const previous = get().image;
    if (previous) URL.revokeObjectURL(previous.previewUrl);
    set({
      image: { id: nextId++, file, previewUrl: URL.createObjectURL(file) },
      articleType: null,
      refinement: "",
    });
  },
  clearImage: () => {
    const previous = get().image;
    if (previous) URL.revokeObjectURL(previous.previewUrl);
    set({ image: null, articleType: null, refinement: "" });
  },
  setFilters: (filters) => set({ filters }),
  setArticleType: (articleType) => set({ articleType }),
  setRefinement: (refinement) => set({ refinement }),
}));

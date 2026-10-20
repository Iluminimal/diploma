import { create } from "zustand";
import { emptyFilters, type CatalogFilters } from "@/features/catalog/filters";

export type PickedImage = {
  /** Шинэ зураг бүрт өөрчлөгдөнө; query key-ийн хэсэг тул үр дүн зургуудын хооронд хольцохгүй. */
  id: number;
  file: File;
  /** Preview-ийн Object URL. Зургийг солих, устгах үед revoke хийнэ. */
  previewUrl: string;
};

type SearchState = {
  image: PickedImage | null;
  filters: CatalogFilters;
  /** Хэрэглэгчийн сонгосон ангилал (null = аль ч). Илрүүлсэн ангилал зөвхөн санал. */
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
 * Visual search flow-ийн жижиг client state. Зураг зөвхөн энд, санах ойд байна (localStorage эсвэл
 * server-т хэзээ ч биш); нүүр хуудас зургийг /search-д ингэж дамжуулдаг.
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

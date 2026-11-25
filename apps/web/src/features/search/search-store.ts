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
  /** Зураг дээр олдсон хувцасны аль нь хайгдах вэ (API-ийн `regions` дахь индекс, 0 = хамгийн тод). */
  regionIndex: number;
  /** true бол нэг хувцасны (`regionIndex`) дэлгэрэнгүй харагдац; false бол бүх хувцас нэг дор. */
  focused: boolean;
  setImage: (file: File) => void;
  clearImage: () => void;
  setFilters: (filters: CatalogFilters) => void;
  setArticleType: (articleType: string | null) => void;
  setRefinement: (text: string) => void;
  /** Нэг хувцас руу шилжиж, түүнийг л хайна. */
  focusRegion: (index: number) => void;
  /** Бүх хувцасны нэгдсэн харагдац руу буцна. */
  showAllGarments: () => void;
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
  regionIndex: 0,
  focused: false,
  setImage: (file) => {
    const previous = get().image;
    if (previous) URL.revokeObjectURL(previous.previewUrl);
    set({
      image: { id: nextId++, file, previewUrl: URL.createObjectURL(file) },
      articleType: null,
      refinement: "",
      regionIndex: 0,
      focused: false,
    });
  },
  clearImage: () => {
    const previous = get().image;
    if (previous) URL.revokeObjectURL(previous.previewUrl);
    set({ image: null, articleType: null, refinement: "", regionIndex: 0, focused: false });
  },
  setFilters: (filters) => set({ filters }),
  setArticleType: (articleType) => set({ articleType }),
  setRefinement: (refinement) => set({ refinement }),
  focusRegion: (regionIndex) => set({ regionIndex, focused: true }),
  showAllGarments: () => set({ regionIndex: 0, focused: false }),
}));

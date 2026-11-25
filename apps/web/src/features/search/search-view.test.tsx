import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyFilters } from "@/features/catalog/filters";
import { ApiError } from "@/lib/api/errors";
import { asGarmentResponse, filterOptions, makeGarmentResponse, makeProduct, makeSearchResponse } from "@/test/fixtures";
import { searchByImage, searchGarments } from "./search-api";
import { useSearchStore } from "./search-store";
import { SearchView } from "./search-view";

vi.mock("./search-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./search-api")>()),
  searchByImage: vi.fn(),
  searchGarments: vi.fn(),
}));
// `search` = нэг хувцасны хайлт (ангилал, үг, сонгосон хувцас); `garments` = зургийн анхны, бүх хувцасны хайлт.
const search = vi.mocked(searchByImage);
const garments = vi.mocked(searchGarments);

/** Нэг хувцастай (эсвэл хувцас олдоогүй) зураг: хоёр хайлт ижил үр дүн өгнө. */
function serve(response: ReturnType<typeof makeSearchResponse>) {
  search.mockResolvedValue(response);
  garments.mockResolvedValue(asGarmentResponse(response));
}

function renderView() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SearchView options={filterOptions} />
    </QueryClientProvider>,
  );
}

function pickPhoto() {
  act(() => useSearchStore.getState().setImage(new File(["jpeg"], "photo.jpg", { type: "image/jpeg" })));
}

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:preview");
  URL.revokeObjectURL = vi.fn();
  useSearchStore.setState({ image: null, filters: emptyFilters(), articleType: null, refinement: "", regionIndex: 0, focused: false });
  search.mockReset();
  garments.mockReset();
});

describe("SearchView", () => {
  it("starts with the upload area and no request", () => {
    renderView();
    expect(screen.getByText("Drop a photo here")).toBeInTheDocument();
    expect(search).not.toHaveBeenCalled();
  });

  it("searches as soon as a photo is chosen and shows results with similarity badges", async () => {
    serve(makeSearchResponse([makeProduct(), makeProduct({ id: 2, slug: "b-2", name: "Second Kurta" })]));
    renderView();
    pickPhoto();
    expect(await screen.findByText("Alma Women Blue Kurta")).toBeInTheDocument();
    expect(screen.getByText("Second Kurta")).toBeInTheDocument();
    expect(screen.getByLabelText("99 percent match")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("2 similar items");
    expect(screen.getByRole("button", { name: /Detected: Shirts/ })).toBeInTheDocument();
    expect(garments).toHaveBeenCalledTimes(1);
    expect(search).not.toHaveBeenCalled();
  });

  it("sweeps a scanning band over the photo while it is searched, and stops when the results are in", async () => {
    let finish: (value: ReturnType<typeof makeSearchResponse>) => void = () => {};
    garments.mockReturnValue(new Promise((resolve) => (finish = (value) => resolve(asGarmentResponse(value)))));
    const { container } = renderView();
    pickPhoto();
    await screen.findByAltText("Your photo");
    expect(container.querySelector(".animate-scan")).not.toBeNull();

    await act(async () => finish(makeSearchResponse([makeProduct()])));

    await screen.findByText("Alma Women Blue Kurta");
    expect(container.querySelector(".animate-scan")).toBeNull();
  });

  it("shows skeletons while waiting", async () => {
    garments.mockReturnValue(new Promise(() => {}));
    renderView();
    pickPhoto();
    expect(await screen.findByRole("status", { name: "Loading products" })).toBeInTheDocument();
  });

  it("searches again with the category the user picks instead of the detected one", async () => {
    serve(makeSearchResponse());
    renderView();
    pickPhoto();
    await userEvent.click(await screen.findByRole("button", { name: /Detected: Shirts/ }));
    await userEvent.click(screen.getByRole("menuitemradio", { name: /Tshirts/ }));
    await waitFor(() => expect(search).toHaveBeenCalledTimes(1));
    expect(search.mock.calls[0]?.[1]).toMatchObject({ articleType: "Tshirts", refinement: "" });
    expect(await screen.findByRole("button", { name: /Category: Tshirts/ })).toBeInTheDocument();
  });

  it("refines with words (hybrid search) and clearing it reuses the cached photo-only results", async () => {
    serve(makeSearchResponse());
    renderView();
    pickPhoto();
    await screen.findByText("Alma Women Blue Kurta");
    await userEvent.type(screen.getByLabelText("Refine with words"), "in red");
    await userEvent.click(screen.getByRole("button", { name: "Refine" }));
    await waitFor(() => expect(search).toHaveBeenCalledTimes(1));
    expect(search.mock.calls[0]?.[1]).toMatchObject({ refinement: "in red" });
    expect(await screen.findByText(/for “in red”/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Clear refinement" }));
    // Зөвхөн зургийн үр дүн рүү буцна, тэр нь cache-д байгаа: шинэ хүсэлт байхгүй (rate limit-тэй).
    await waitFor(() => expect(screen.queryByText(/for “in red”/)).not.toBeInTheDocument());
    expect(search).toHaveBeenCalledTimes(1);
    expect(garments).toHaveBeenCalledTimes(1);
  });

  it("shows what the API understood from the refinement words", async () => {
    garments.mockResolvedValue(asGarmentResponse(makeSearchResponse()));
    search.mockResolvedValueOnce({
      ...makeSearchResponse(),
      applied: [
        { key: "color", value: "Blue" },
        { key: "max_price", value: "17500000" },
      ],
    });
    renderView();
    pickPhoto();
    await screen.findByText("Alma Women Blue Kurta");
    expect(screen.queryByText("Understood from your words")).not.toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Refine with words"), "цэнхэр 50$-аас доош");
    await userEvent.click(screen.getByRole("button", { name: "Refine" }));

    expect(await screen.findByText("Colour: Blue")).toBeInTheDocument();
    expect(screen.getByText("Up to ₮175,000")).toBeInTheDocument();
  });

  describe("several garments in the photo", () => {
    const manyGarments = () => makeGarmentResponse([{}, { label: "shoe" }]);

    it("shows each garment as its own section with its own products", async () => {
      garments.mockResolvedValue(manyGarments());
      renderView();
      pickPhoto();
      expect(await screen.findByRole("heading", { name: "Garment 1" })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Garment 2" })).toBeInTheDocument();
      expect(screen.getByText("Garment 0 item")).toBeInTheDocument();
      expect(screen.getByText("Garment 1 item")).toBeInTheDocument();
      expect(screen.getByRole("status")).toHaveTextContent("2 garments found");
      expect(garments).toHaveBeenCalledTimes(1);
      expect(search).not.toHaveBeenCalled();
      // Detector-ийн label биш, CLIP-ийн таамаг.
      expect(screen.getAllByText("Looks like: Shirts")).toHaveLength(2);
      expect(screen.queryByRole("button", { name: /Detected:/ })).not.toBeInTheDocument();
    });

    it("surrounds each garment with a numbered dotted frame, like the sections", async () => {
      garments.mockResolvedValue(
        makeGarmentResponse([{ box: { x: 0, y: 0, width: 1, height: 0.5 } }, { box: { x: 0.1, y: 0.6, width: 0.5, height: 0.4 } }]),
      );
      renderView();
      pickPhoto();
      const second = await screen.findByRole("button", { name: "Search for garment 2" });
      expect(screen.getByRole("button", { name: "Search for garment 1" })).toHaveAttribute("aria-pressed", "false");
      expect(second).toHaveStyle({ left: "10%", top: "60%", width: "50%", height: "40%" });
      expect(second).toHaveTextContent("2");
    });

    it("opens one garment with more results from its button, and goes back from the cache", async () => {
      garments.mockResolvedValue(manyGarments());
      search.mockResolvedValue({ ...makeSearchResponse([makeProduct({ id: 7, slug: "shoe-7", name: "Shoe seven" })]), regions: manyGarments().garments.map((g) => g.region) });
      renderView();
      pickPhoto();
      await userEvent.click((await screen.findAllByRole("button", { name: /See all matches/ }))[1]!);
      await waitFor(() => expect(search).toHaveBeenCalledTimes(1));
      expect(search.mock.calls[0]?.[1]).toMatchObject({ region: 1 });
      expect(await screen.findByText("Shoe seven")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Search for garment 2" })).toHaveAttribute("aria-pressed", "true");

      await userEvent.click(screen.getByRole("button", { name: "All garments in this photo" }));

      expect(await screen.findByRole("heading", { name: "Garment 1" })).toBeInTheDocument();
      expect(garments).toHaveBeenCalledTimes(1); // cache-ээс, шинэ хүсэлтгүй
    });

    it("jumps to a garment when its box on the photo is clicked", async () => {
      garments.mockResolvedValue(manyGarments());
      search.mockResolvedValue({ ...makeSearchResponse(), regions: manyGarments().garments.map((g) => g.region) });
      renderView();
      pickPhoto();
      await userEvent.click(await screen.findByRole("button", { name: "Search for garment 1" }));
      await waitFor(() => expect(search).toHaveBeenCalledTimes(1));
      expect(search.mock.calls[0]?.[1]).toMatchObject({ region: 0 });
      expect(screen.getByRole("button", { name: "All garments in this photo" })).toBeInTheDocument();
    });

    it("keeps the usual view and no boxes for a photo with one garment", async () => {
      garments.mockResolvedValue(makeGarmentResponse([{}]));
      renderView();
      pickPhoto();
      expect(await screen.findByText("Garment 0 item")).toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "Garment 1" })).not.toBeInTheDocument();
      expect(screen.queryByRole("group", { name: "Garments found in your photo" })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Detected: Shirts/ })).toBeInTheDocument();
    });

    it("tells when a garment has no close matches", async () => {
      garments.mockResolvedValue(makeGarmentResponse([{}, { products: [] }]));
      renderView();
      pickPhoto();
      expect(await screen.findByText("No close matches for this garment.")).toBeInTheDocument();
      expect(screen.getAllByRole("button", { name: /See all matches/ })).toHaveLength(1);
    });

    it("starts from all garments again for a new photo", async () => {
      garments.mockResolvedValue(manyGarments());
      search.mockResolvedValue({ ...makeSearchResponse(), regions: manyGarments().garments.map((g) => g.region) });
      renderView();
      pickPhoto();
      await userEvent.click(await screen.findByRole("button", { name: "Search for garment 2" }));
      await waitFor(() => expect(search).toHaveBeenCalledTimes(1));

      pickPhoto();

      await waitFor(() => expect(garments).toHaveBeenCalledTimes(2));
      expect(await screen.findByRole("heading", { name: "Garment 2" })).toBeInTheDocument();
    });
  });

  it("applies a filter chip", async () => {
    serve(makeSearchResponse());
    renderView();
    pickPhoto();
    await screen.findByText("Alma Women Blue Kurta");
    await userEvent.click(screen.getByRole("button", { name: "Women" }));
    await waitFor(() => expect(garments).toHaveBeenCalledTimes(2));
    expect(garments.mock.calls[1]?.[1].filters.gender).toEqual(["Women"]);
  });

  it("explains an API failure and retries on request", async () => {
    garments.mockRejectedValueOnce(new ApiError({ status: 429, title: "Too many", retryAfter: 30 }));
    garments.mockResolvedValueOnce(asGarmentResponse(makeSearchResponse()));
    renderView();
    pickPhoto();
    expect(await screen.findByRole("alert")).toHaveTextContent("Try again in 30 seconds");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Alma Women Blue Kurta")).toBeInTheDocument();
  });

  it("has a friendly empty state", async () => {
    serve({ ...makeSearchResponse(), results: [] });
    renderView();
    pickPhoto();
    expect(await screen.findByText("No close matches")).toBeInTheDocument();
  });

  it("removing the photo returns to the upload area", async () => {
    serve(makeSearchResponse());
    renderView();
    pickPhoto();
    await screen.findByText("Alma Women Blue Kurta");
    await userEvent.click(screen.getByRole("button", { name: /Remove/ }));
    expect(screen.getByText("Drop a photo here")).toBeInTheDocument();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview");
  });
});

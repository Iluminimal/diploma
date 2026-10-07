import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyFilters } from "@/features/catalog/filters";
import { ApiError } from "@/lib/api/errors";
import { filterOptions, makeProduct, makeSearchResponse } from "@/test/fixtures";
import { searchByImage } from "./search-api";
import { useSearchStore } from "./search-store";
import { SearchView } from "./search-view";

vi.mock("./search-api", () => ({ searchByImage: vi.fn() }));
const search = vi.mocked(searchByImage);

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
  useSearchStore.setState({ image: null, filters: emptyFilters(), articleType: null, refinement: "" });
  search.mockReset();
});

describe("SearchView", () => {
  it("starts with the upload area and no request", () => {
    renderView();
    expect(screen.getByText("Drop a photo here")).toBeInTheDocument();
    expect(search).not.toHaveBeenCalled();
  });

  it("searches as soon as a photo is chosen and shows results with similarity badges", async () => {
    search.mockResolvedValue(makeSearchResponse([makeProduct(), makeProduct({ id: 2, slug: "b-2", name: "Second Kurta" })]));
    renderView();
    pickPhoto();
    expect(await screen.findByText("Alma Women Blue Kurta")).toBeInTheDocument();
    expect(screen.getByText("Second Kurta")).toBeInTheDocument();
    expect(screen.getByLabelText("99 percent match")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("2 similar items");
    expect(screen.getByRole("button", { name: /Detected: Shirts/ })).toBeInTheDocument();
    expect(search).toHaveBeenCalledTimes(1);
  });

  it("shows skeletons while waiting", async () => {
    search.mockReturnValue(new Promise(() => {}));
    renderView();
    pickPhoto();
    expect(await screen.findByRole("status", { name: "Loading products" })).toBeInTheDocument();
  });

  it("searches again with the category the user picks instead of the detected one", async () => {
    search.mockResolvedValue(makeSearchResponse());
    renderView();
    pickPhoto();
    await userEvent.click(await screen.findByRole("button", { name: /Detected: Shirts/ }));
    await userEvent.click(screen.getByRole("menuitemradio", { name: /Tshirts/ }));
    await waitFor(() => expect(search).toHaveBeenCalledTimes(2));
    expect(search.mock.calls[1]?.[1]).toMatchObject({ articleType: "Tshirts", refinement: "" });
    expect(await screen.findByRole("button", { name: /Category: Tshirts/ })).toBeInTheDocument();
  });

  it("refines with words (hybrid search) and clearing it reuses the cached photo-only results", async () => {
    search.mockResolvedValue(makeSearchResponse());
    renderView();
    pickPhoto();
    await screen.findByText("Alma Women Blue Kurta");
    await userEvent.type(screen.getByLabelText("Refine with words"), "in red");
    await userEvent.click(screen.getByRole("button", { name: "Refine" }));
    await waitFor(() => expect(search).toHaveBeenCalledTimes(2));
    expect(search.mock.calls[1]?.[1]).toMatchObject({ refinement: "in red" });
    expect(await screen.findByText(/for “in red”/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Clear refinement" }));
    // Back to the photo-only results, which are still cached: no third request (they are rate limited).
    await waitFor(() => expect(screen.queryByText(/for “in red”/)).not.toBeInTheDocument());
    expect(search).toHaveBeenCalledTimes(2);
  });

  it("applies a filter chip", async () => {
    search.mockResolvedValue(makeSearchResponse());
    renderView();
    pickPhoto();
    await screen.findByText("Alma Women Blue Kurta");
    await userEvent.click(screen.getByRole("button", { name: "Women" }));
    await waitFor(() => expect(search).toHaveBeenCalledTimes(2));
    expect(search.mock.calls[1]?.[1].filters.gender).toEqual(["Women"]);
  });

  it("explains an API failure and retries on request", async () => {
    search.mockRejectedValueOnce(new ApiError({ status: 429, title: "Too many", retryAfter: 30 }));
    search.mockResolvedValueOnce(makeSearchResponse());
    renderView();
    pickPhoto();
    expect(await screen.findByRole("alert")).toHaveTextContent("Try again in 30 seconds");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Alma Women Blue Kurta")).toBeInTheDocument();
  });

  it("has a friendly empty state", async () => {
    search.mockResolvedValue({ ...makeSearchResponse(), results: [] });
    renderView();
    pickPhoto();
    expect(await screen.findByText("No close matches")).toBeInTheDocument();
  });

  it("removing the photo returns to the upload area", async () => {
    search.mockResolvedValue(makeSearchResponse());
    renderView();
    pickPhoto();
    await screen.findByText("Alma Women Blue Kurta");
    await userEvent.click(screen.getByRole("button", { name: /Remove/ }));
    expect(screen.getByText("Drop a photo here")).toBeInTheDocument();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview");
  });
});

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { suggestProducts } from "@/features/catalog/suggest";
import { catalogNav, makeProduct } from "@/test/fixtures";
import { SearchBar } from "./search-bar";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/features/catalog/suggest", () => ({ suggestProducts: vi.fn() }));
vi.mock("@/features/catalog/use-catalog-nav", () => ({
  useCatalogNav: () => ({ data: catalogNav }),
}));
vi.mock("@/features/search/photo-search-dialog", () => ({
  PhotoSearchDialog: ({ open }: { open: boolean }) => (open ? <div role="dialog" aria-label="Search by photo" /> : null),
}));
vi.mock("@/features/search/normalize-image", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/search/normalize-image")>()),
  normalizeImage: vi.fn(async (blob: Blob) => new File([blob], "photo.jpg", { type: "image/jpeg" })),
}));
const suggest = vi.mocked(suggestProducts);

function renderBar() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SearchBar />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  push.mockReset();
  suggest.mockReset();
  window.localStorage.clear();
});

describe("SearchBar", () => {
  it("waits for the user to pause and for two characters before asking the API", async () => {
    suggest.mockResolvedValue([makeProduct()]);
    renderBar();
    await userEvent.type(screen.getByRole("combobox"), "k");
    await new Promise((r) => setTimeout(r, 350));
    expect(suggest).not.toHaveBeenCalled();
    await userEvent.type(screen.getByRole("combobox"), "urta");
    expect(await screen.findByRole("option", { name: /Alma Women Blue Kurta/ })).toBeInTheDocument();
    expect(suggest).toHaveBeenCalledTimes(1);
    expect(suggest.mock.calls[0]?.[0]).toBe("kurta");
  });

  it("goes to the listing on Enter", async () => {
    renderBar();
    await userEvent.type(screen.getByRole("combobox"), "red dress{Enter}");
    expect(push).toHaveBeenCalledWith("/products?q=red%20dress");
  });

  it("opens the highlighted suggestion with the keyboard", async () => {
    suggest.mockResolvedValue([makeProduct()]);
    renderBar();
    await userEvent.type(screen.getByRole("combobox"), "kurta");
    await screen.findByRole("option", { name: /Alma/ });
    await userEvent.keyboard("{ArrowDown}{Enter}");
    await waitFor(() => expect(push).toHaveBeenCalledWith("/products/41885/alma-women-blue-kurta-60000"));
  });

  it("Escape hides the suggestions without clearing the text or leaving one selected", async () => {
    suggest.mockResolvedValue([makeProduct()]);
    renderBar();
    const box = screen.getByRole("combobox");
    await userEvent.type(box, "kurta");
    await screen.findByRole("option", { name: /Alma/ });
    await userEvent.keyboard("{ArrowDown}{Escape}");

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(box).toHaveValue("kurta");
    await userEvent.keyboard("{Enter}");
    expect(push).toHaveBeenCalledWith("/products?q=kurta");
  });

  it("does nothing for an empty query", async () => {
    renderBar();
    await userEvent.type(screen.getByRole("combobox"), "   {Enter}");
    expect(push).not.toHaveBeenCalled();
  });

  it("offers matching categories above the products and opens one with the keyboard", async () => {
    suggest.mockResolvedValue([makeProduct()]);
    renderBar();
    await userEvent.type(screen.getByRole("combobox"), "shirt");
    await screen.findByRole("option", { name: /Alma/ });
    const options = screen.getAllByRole("option");

    expect(options[0]).toHaveTextContent("T-shirts in Men");
    expect(options[0]).toHaveTextContent("200");
    expect(options.map((o) => o.textContent).join("|")).toContain("Alma Women Blue Kurta");
    await userEvent.keyboard("{ArrowDown}{Enter}");
    expect(push).toHaveBeenCalledWith("/c/men/apparel/topwear/tshirts");
  });

  it("remembers searches and offers them again on an empty field", async () => {
    renderBar();
    const box = screen.getByRole("combobox");
    await userEvent.type(box, "red dress{Enter}");
    await userEvent.clear(box);
    await userEvent.click(box);

    const recent = await screen.findByRole("option", { name: "red dress" });
    await userEvent.click(recent);
    expect(push).toHaveBeenLastCalledWith("/products?q=red%20dress");
  });

  it("has a camera button inside the search field that opens the photo picker", async () => {
    renderBar();
    const form = screen.getByRole("search");
    const button = within(form).getByRole("button", { name: "Search by photo" });

    await userEvent.click(button);

    expect(await screen.findByRole("dialog", { name: "Search by photo" })).toBeInTheDocument();
  });

  it("searches with a photo dropped on the bar", async () => {
    renderBar();
    const photo = new File(["x"], "look.jpg", { type: "image/jpeg" });

    fireEvent.drop(screen.getByRole("search"), { dataTransfer: { files: [photo], types: ["Files"] } });

    await waitFor(() => expect(push).toHaveBeenCalledWith("/search"));
  });

  it("searches with a photo pasted into the field, without a text search", async () => {
    renderBar();
    const photo = new File(["x"], "shot.png", { type: "image/png" });

    fireEvent.paste(screen.getByRole("combobox"), { clipboardData: { files: [photo] } });

    await waitFor(() => expect(push).toHaveBeenCalledWith("/search"));
    expect(push).not.toHaveBeenCalledWith(expect.stringContaining("/products"));
  });
});

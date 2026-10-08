import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { suggestProducts } from "@/features/catalog/suggest";
import { makeProduct } from "@/test/fixtures";
import { SearchBar } from "./search-bar";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/features/catalog/suggest", () => ({ suggestProducts: vi.fn() }));
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
});

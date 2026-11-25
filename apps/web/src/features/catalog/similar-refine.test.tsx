import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { searchSimilarWithText } from "@/features/search/search-api";
import { ApiError } from "@/lib/api/errors";
import { makeProduct, makeSearchResponse } from "@/test/fixtures";
import { renderWithQuery } from "@/test/render";
import { SimilarRefine } from "./similar-refine";

vi.mock("@/features/search/search-api", () => ({ searchSimilarWithText: vi.fn() }));
const similar = vi.mocked(searchSimilarWithText);

const initial = [makeProduct({ id: 1, name: "Original rail item" })];

function renderRefine() {
  return renderWithQuery(<SimilarRefine productId={9} initial={initial} label="Similar products" />);
}

async function refineWith(text: string) {
  await userEvent.type(screen.getByRole("textbox"), text);
  await userEvent.click(screen.getByRole("button", { name: "Refine" }));
}

beforeEach(() => similar.mockReset());

describe("SimilarRefine", () => {
  it("shows the server-rendered rail first and makes no request", () => {
    renderRefine();

    expect(screen.getByText("Original rail item")).toBeInTheDocument();
    expect(similar).not.toHaveBeenCalled();
  });

  it("swaps the rail for results that follow the words and shows what was understood", async () => {
    similar.mockResolvedValue({
      ...makeSearchResponse([makeProduct({ id: 2, name: "Blue refined item" })]),
      applied: [{ key: "color", value: "Blue" }],
    });
    renderRefine();

    await refineWith("цэнхэр");

    expect(await screen.findByText("Blue refined item")).toBeInTheDocument();
    expect(screen.queryByText("Original rail item")).not.toBeInTheDocument();
    expect(screen.getByText("Colour: Blue")).toBeInTheDocument();
    expect(similar).toHaveBeenCalledWith(9, "цэнхэр", 12, expect.anything());
  });

  it("goes back to the original rail when the refinement is cleared", async () => {
    similar.mockResolvedValue(makeSearchResponse([makeProduct({ id: 2, name: "Blue refined item" })]));
    renderRefine();
    await refineWith("red");
    await screen.findByText("Blue refined item");

    await userEvent.click(screen.getByRole("button", { name: "Clear refinement" }));

    expect(await screen.findByText("Original rail item")).toBeInTheDocument();
  });

  it("says so when nothing matches", async () => {
    similar.mockResolvedValue(makeSearchResponse([]));
    renderRefine();

    await refineWith("purple");

    expect(await screen.findByText(/Nothing matches those words/)).toBeInTheDocument();
  });

  it("reports a failed request", async () => {
    similar.mockRejectedValueOnce(new ApiError({ title: "Search unavailable", status: 503 }));
    renderRefine();

    await refineWith("red");

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
  });
});

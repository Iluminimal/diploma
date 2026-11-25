import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { json, problem, stubApi } from "@/test/api-mock";
import { makeProduct } from "@/test/fixtures";
import { renderWithQuery } from "@/test/render";
import { parseListingQuery } from "./parse-listing-query";
import { LoadMore } from "./load-more";

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

const first = makeProduct({ id: 1, name: "First Shirt" });
const second = makeProduct({ id: 2, name: "Second Shirt" });
const third = makeProduct({ id: 3, name: "Third Shirt" });

const page = (n: number, pages: number, items = [second]) => ({
  items,
  total: 3,
  page: n,
  page_size: 1,
  pages,
});

function renderMore(props: Partial<Parameters<typeof LoadMore>[0]> = {}) {
  return renderWithQuery(
    <LoadMore
      query={parseListingQuery({ gender: "Men" })}
      path="/products"
      shownIds={[first.id]}
      total={3}
      pages={3}
      pageSize={1}
      {...props}
    />,
  );
}

describe("LoadMore", () => {
  it("shows progress and appends the next page when the button is pressed", async () => {
    const api = stubApi({ "GET /api/v1/products": { body: page(2, 3) } });
    renderMore();
    expect(screen.getByRole("status")).toHaveTextContent("Showing 1 of 3");

    await userEvent.click(screen.getByRole("button", { name: "Show more" }));

    expect(await screen.findByText("Second Shirt")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Showing 2 of 3");
    expect(api.calls[0]?.search).toContain("page=2");
    expect(api.calls[0]?.search).toContain("gender=Men");
    expect(window.location.search).toBe("?gender=Men&page=2");
  });

  it("hides the button once the last page has been loaded", async () => {
    stubApi({
      "GET /api/v1/products": ({ search }) =>
        json(search.includes("page=2") ? page(2, 3) : page(3, 3, [third])),
    });
    renderMore();

    await userEvent.click(screen.getByRole("button", { name: "Show more" }));
    await screen.findByText("Second Shirt");
    await userEvent.click(screen.getByRole("button", { name: "Show more" }));

    expect(await screen.findByText("Third Shirt")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show more" })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Showing 3 of 3");
  });

  it("has no button when everything is already shown", () => {
    renderMore({ total: 1, pages: 1 });
    expect(screen.queryByRole("button", { name: "Show more" })).not.toBeInTheDocument();
  });

  it("starts after the page the server rendered and counts the earlier ones", async () => {
    const api = stubApi({ "GET /api/v1/products": { body: page(3, 3, [third]) } });
    renderMore({ query: parseListingQuery({ page: "2" }) });
    expect(screen.getByRole("status")).toHaveTextContent("Showing 2 of 3");

    await userEvent.click(screen.getByRole("button", { name: "Show more" }));

    expect(await screen.findByText("Third Shirt")).toBeInTheDocument();
    expect(api.calls[0]?.search).toContain("page=3");
  });

  it("skips products the server page already shows", async () => {
    stubApi({ "GET /api/v1/products": { body: page(2, 3, [first, second]) } });
    renderMore();

    await userEvent.click(screen.getByRole("button", { name: "Show more" }));

    await screen.findByText("Second Shirt");
    expect(screen.queryAllByText("First Shirt")).toHaveLength(0);
    expect(screen.getByRole("status")).toHaveTextContent("Showing 2 of 3");
  });

  it("offers a retry when loading fails and leaves the URL alone", async () => {
    stubApi({ "GET /api/v1/products": () => problem(500, "Server error") });
    renderMore();

    await userEvent.click(screen.getByRole("button", { name: "Show more" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load more products.");
    expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
    expect(window.location.search).toBe("");
  });
});

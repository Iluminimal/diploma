import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "@/features/auth/auth-store";
import { respond, stubApi } from "@/test/api-mock";
import { makeAdminReview } from "@/test/fixtures";
import { renderWithQuery } from "@/test/render";
import type { ReviewListParams } from "./admin-api";
import { ReviewsList } from "./reviews-views";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/admin/reviews",
}));

const params: ReviewListParams = { q: "", status: "all", rating: 0, page: 1 };
const page = (items = [makeAdminReview(), makeAdminReview({ id: 12, rating: 1, status: "hidden", title: "Awful", author: "Bob K." })]) => ({
  items,
  total: items.length,
  page: 1,
  page_size: 25,
  pages: 1,
  status_counts: { published: 1, hidden: 1 },
});

beforeEach(() => {
  replace.mockClear();
  useAuth.setState({
    status: "signedIn",
    accessToken: "t",
    user: { id: 1, email: "a@b.co", full_name: "Admin", role: "admin", avatar_url: null, has_password: true, phone: null, email_verified: false, phone_verified: false, providers: [] as string[] },
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("ReviewsList", () => {
  it("shows each review with its stars, text, product and author", async () => {
    stubApi({ "GET /api/v1/admin/reviews": respond(page()) });
    renderWithQuery(<ReviewsList params={params} />);

    const list = await screen.findByRole("list", { name: "Reviews, newest first" });
    const [nice, awful] = within(list).getAllByRole("listitem");
    expect(within(nice!).getByRole("img", { name: "4 out of 5 stars" })).toBeInTheDocument();
    expect(nice).toHaveTextContent("Nice fit");
    expect(nice).toHaveTextContent("Runs a little large.");
    expect(within(nice!).getByRole("link", { name: "Alma Women Blue Kurta" })).toHaveAttribute("href", "/admin/products/41885");
    expect(within(nice!).getByRole("link", { name: "ada@example.com" })).toHaveAttribute("href", "/admin/customers/3");
    expect(awful).toHaveTextContent("Hidden");
  });

  it("has tabs with counts that keep the other filters", async () => {
    stubApi({ "GET /api/v1/admin/reviews": respond(page()) });
    renderWithQuery(<ReviewsList params={{ ...params, q: "fit", rating: 4 }} />);
    await screen.findByRole("list", { name: "Reviews, newest first" });

    const tabs = within(screen.getByRole("navigation", { name: "Review status" }));
    expect(tabs.getByRole("link", { name: "All 2" })).toHaveAttribute("href", "/admin/reviews?q=fit&rating=4");
    expect(tabs.getByRole("link", { name: "Hidden 1" })).toHaveAttribute("href", "/admin/reviews?q=fit&status=hidden&rating=4");
  });

  it("filters by stars through the URL", async () => {
    stubApi({ "GET /api/v1/admin/reviews": respond(page()) });
    renderWithQuery(<ReviewsList params={params} />);
    await screen.findByRole("list", { name: "Reviews, newest first" });

    await userEvent.selectOptions(screen.getByLabelText("Stars"), "2");

    expect(replace).toHaveBeenCalledWith("/admin/reviews?rating=2");
  });

  it("hides a published review", async () => {
    const api = stubApi({
      "GET /api/v1/admin/reviews": respond(page()),
      "POST /api/v1/admin/reviews/11/hide": respond(makeAdminReview({ status: "hidden" })),
    });
    renderWithQuery(<ReviewsList params={params} />);

    await userEvent.click(await screen.findByRole("button", { name: "Hide the review by Ada L." }));

    await waitFor(() => expect(api.calls.some((c) => c.path === "/api/v1/admin/reviews/11/hide")).toBe(true));
  });

  it("publishes a hidden review again", async () => {
    const api = stubApi({
      "GET /api/v1/admin/reviews": respond(page()),
      "POST /api/v1/admin/reviews/12/publish": respond(makeAdminReview({ id: 12 })),
    });
    renderWithQuery(<ReviewsList params={params} />);

    await userEvent.click(await screen.findByRole("button", { name: "Publish the review by Bob K." }));

    await waitFor(() => expect(api.calls.some((c) => c.path === "/api/v1/admin/reviews/12/publish")).toBe(true));
  });

  it("has an empty state", async () => {
    stubApi({ "GET /api/v1/admin/reviews": respond({ ...page([]), status_counts: {} }) });
    renderWithQuery(<ReviewsList params={params} />);

    expect(await screen.findByText("No reviews found")).toBeInTheDocument();
  });
});

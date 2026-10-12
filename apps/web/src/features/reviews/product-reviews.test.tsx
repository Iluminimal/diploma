import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "@/features/auth/auth-store";
import { problem, respond, stubApi } from "@/test/api-mock";
import { makeReview, makeReviewPage } from "@/test/fixtures";
import { renderWithQuery } from "@/test/render";
import { ProductReviews } from "./product-reviews";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }), usePathname: () => "/products/41885/x" }));

const user = { id: 1, email: "a@b.co", full_name: "Ada", avatar_url: null, has_password: true, providers: [] as string[] };
const signedIn = () => useAuth.setState({ status: "signedIn", accessToken: "t", user: { ...user, role: "customer" } });
const signedOut = () => useAuth.setState({ status: "signedOut", accessToken: null, user: null });
const URL = "GET /api/v1/products/41885/reviews";

beforeEach(signedOut);
afterEach(() => vi.unstubAllGlobals());

describe("ProductReviews for a visitor", () => {
  it("shows the average, how it is made up and the reviews, from what the server sent", () => {
    stubApi({ [URL]: respond(makeReviewPage()) });
    renderWithQuery(<ProductReviews productId={41885} initial={makeReviewPage()} />);

    // At once, before anything has been asked for.
    expect(screen.getByRole("heading", { level: 2, name: "Customer reviews" })).toBeInTheDocument();
    expect(screen.getByText("4.5")).toBeInTheDocument();
    expect(screen.getByText("2 reviews")).toBeInTheDocument();
    expect(screen.getByText("Showing 1–2 of 2")).toBeInTheDocument();
    const bars = within(screen.getByRole("list", { name: "Ratings by number of stars" })).getAllByRole("listitem");
    expect(bars).toHaveLength(5);
    expect(bars[0]).toHaveTextContent("5 stars");
    expect(bars[0]).toHaveTextContent("1 review");
    const list = within(screen.getByRole("list", { name: "Reviews" }));
    expect(list.getByRole("heading", { name: "Nice fit" })).toBeInTheDocument();
    expect(list.getByText("Runs a little large.")).toBeInTheDocument();
    expect(list.getByText(/Bob K\./)).toBeInTheDocument();
  });

  it("then fetches a current copy, because the server's may be a minute old", async () => {
    const newer = makeReviewPage({
      items: [makeReview({ id: 40, title: "Posted a moment ago" })],
      total: 1,
      summary: { average: 4, count: 1, distribution: [0, 0, 0, 1, 0] },
    });
    const api = stubApi({ [URL]: respond(newer) });
    renderWithQuery(<ProductReviews productId={41885} initial={makeReviewPage()} />);

    expect(await screen.findByRole("heading", { name: "Posted a moment ago" })).toBeInTheDocument();
    expect(api.calls).toHaveLength(1);
    expect(screen.queryByRole("heading", { name: "Perfect" })).not.toBeInTheDocument();
  });

  it("invites the visitor to sign in, and brings them back to the reviews", () => {
    stubApi({});
    renderWithQuery(<ProductReviews productId={41885} initial={makeReviewPage()} />);

    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login?next=%2Fproducts%2F41885%23reviews");
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
  });

  it("says there are no reviews yet", () => {
    stubApi({});
    renderWithQuery(
      <ProductReviews
        productId={41885}
        initial={makeReviewPage({ items: [], total: 0, pages: 0, summary: { average: null, count: 0, distribution: [0, 0, 0, 0, 0] } })}
      />,
    );

    expect(screen.getByText(/No reviews yet/)).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Reviews" })).not.toBeInTheDocument();
  });

  it("asks for another order and page when sorted or paged", async () => {
    const api = stubApi({ [URL]: respond(makeReviewPage({ page: 2, pages: 3, total: 11 })) });
    renderWithQuery(<ProductReviews productId={41885} initial={makeReviewPage({ pages: 3, total: 11 })} />);
    const asked = () => api.calls.map((call) => Object.fromEntries(new URLSearchParams(call.search)));

    await userEvent.selectOptions(screen.getByLabelText("Sort reviews"), "lowest");
    await waitFor(() => expect(asked()).toContainEqual(expect.objectContaining({ sort: "lowest", page: "1", page_size: "5" })));
    await userEvent.click(await screen.findByRole("button", { name: "Next" }));

    await waitFor(() => expect(asked()).toContainEqual(expect.objectContaining({ sort: "lowest", page: "2" })));
  });

  it("reports a failure to load and can try again", async () => {
    stubApi({ [URL]: problem(500, "Boom") });
    signedIn();
    renderWithQuery(<ProductReviews productId={41885} initial={null} />);

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});

describe("ProductReviews for a signed-in customer", () => {
  it("fetches its own copy, which says whether they can review", async () => {
    const api = stubApi({
      [URL]: respond(makeReviewPage({ viewer: { purchased: false, review: null, can_review: false } })),
    });
    signedIn();
    renderWithQuery(<ProductReviews productId={41885} initial={makeReviewPage()} />);

    expect(await screen.findByText(/Only customers who have bought this product can review it/)).toBeInTheDocument();
    expect(api.calls[0]?.headers.get("authorization")).toBe("Bearer t");
  });

  it("does not ask while the session is still being restored", () => {
    const api = stubApi({});
    useAuth.setState({ status: "unknown", accessToken: null, user: null });
    renderWithQuery(<ProductReviews productId={41885} initial={null} />);

    expect(api.calls).toHaveLength(0);
    expect(screen.getByText("Loading reviews…")).toBeInTheDocument();
  });

  it("lets a buyer rate and write, then shows what was posted", async () => {
    let posted = false;
    const api = stubApi({
      [URL]: () =>
        Response.json(
          makeReviewPage({
            viewer: posted
              ? { purchased: true, review: makeReview({ id: 20, rating: 5, title: "Lovely", body: "Soft." }), can_review: false }
              : { purchased: true, review: null, can_review: true },
          }),
        ),
      "POST /api/v1/products/41885/reviews": () => {
        posted = true;
        return Response.json(makeReview({ id: 20, rating: 5, title: "Lovely", body: "Soft." }), { status: 201 });
      },
    });
    signedIn();
    renderWithQuery(<ProductReviews productId={41885} initial={null} />);

    const form = await screen.findByRole("form", { name: "Write a review" });
    await userEvent.click(within(form).getByRole("button", { name: "Post review" }));
    expect(await within(form).findByText("Choose a rating")).toBeInTheDocument();
    await userEvent.click(within(form).getByRole("radio", { name: "5 stars, Excellent" }));
    await userEvent.type(within(form).getByLabelText("Headline (optional)"), "  Lovely ");
    await userEvent.type(within(form).getByLabelText("Your review (optional)"), "Soft.");
    await userEvent.click(within(form).getByRole("button", { name: "Post review" }));

    await waitFor(() => expect(api.calls.some((c) => c.method === "POST")).toBe(true));
    expect(api.calls.find((c) => c.method === "POST")?.body).toEqual({ rating: 5, title: "Lovely", body: "Soft." });
    expect(await screen.findByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(screen.queryByRole("form", { name: "Write a review" })).not.toBeInTheDocument();
  });

  it("sends nothing for the parts left empty", async () => {
    const api = stubApi({
      [URL]: respond(makeReviewPage({ viewer: { purchased: true, review: null, can_review: true } })),
      "POST /api/v1/products/41885/reviews": respond(makeReview(), 201),
    });
    signedIn();
    renderWithQuery(<ProductReviews productId={41885} initial={null} />);

    const form = await screen.findByRole("form", { name: "Write a review" });
    await userEvent.click(within(form).getByRole("radio", { name: "3 stars, Good" }));
    await userEvent.click(within(form).getByRole("button", { name: "Post review" }));

    await waitFor(() => expect(api.calls.some((c) => c.method === "POST")).toBe(true));
    expect(api.calls.find((c) => c.method === "POST")?.body).toEqual({ rating: 3, title: null, body: null });
  });

  it("shows their own review with edit and delete, and the review in the list is theirs", async () => {
    const mine = makeReview({ id: 11, author: "Ada L." });
    stubApi({ [URL]: respond(makeReviewPage({ viewer: { purchased: true, review: mine, can_review: false } })) });
    signedIn();
    renderWithQuery(<ProductReviews productId={41885} initial={null} />);

    const list = within(await screen.findByRole("list", { name: "Reviews" }));
    expect(list.getByText(/^You/)).toBeInTheDocument();
    expect(list.getAllByRole("button", { name: "Edit" })).toHaveLength(1);
    expect(screen.queryByRole("form", { name: "Write a review" })).not.toBeInTheDocument();
  });

  it("edits their review", async () => {
    const mine = makeReview({ id: 11 });
    const api = stubApi({
      [URL]: respond(makeReviewPage({ viewer: { purchased: true, review: mine, can_review: false } })),
      "PATCH /api/v1/reviews/11": respond(makeReview({ id: 11, rating: 2, title: null })),
    });
    signedIn();
    renderWithQuery(<ProductReviews productId={41885} initial={null} />);

    await userEvent.click(await screen.findByRole("button", { name: "Edit" }));
    const form = screen.getByRole("form", { name: "Edit your review" });
    expect(within(form).getByLabelText("Headline (optional)")).toHaveValue("Nice fit");
    expect(within(form).getByRole("radio", { name: "4 stars, Very good" })).toBeChecked();
    await userEvent.click(within(form).getByRole("radio", { name: "2 stars, Fair" }));
    await userEvent.clear(within(form).getByLabelText("Headline (optional)"));
    await userEvent.click(within(form).getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(api.calls.some((c) => c.method === "PATCH")).toBe(true));
    expect(api.calls.find((c) => c.method === "PATCH")?.body).toEqual({ rating: 2, title: null, body: "Runs a little large." });
  });

  it("asks before deleting", async () => {
    const mine = makeReview({ id: 11 });
    const api = stubApi({
      [URL]: respond(makeReviewPage({ viewer: { purchased: true, review: mine, can_review: false } })),
      "DELETE /api/v1/reviews/11": () => new Response(null, { status: 204 }),
    });
    signedIn();
    renderWithQuery(<ProductReviews productId={41885} initial={null} />);

    await userEvent.click(await screen.findByRole("button", { name: "Delete" }));
    const dialog = await screen.findByRole("dialog");
    expect(api.calls.some((c) => c.method === "DELETE")).toBe(false);
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete review" }));

    await waitFor(() => expect(api.calls.some((c) => c.method === "DELETE")).toBe(true));
  });

  it("tells them when the shop has hidden their review, and still lets them see it", async () => {
    const hidden = makeReview({ id: 30, status: "hidden", title: "Mine" });
    stubApi({
      [URL]: respond(makeReviewPage({ viewer: { purchased: true, review: hidden, can_review: false } })),
    });
    signedIn();
    renderWithQuery(<ProductReviews productId={41885} initial={null} />);

    expect(await screen.findByText(/The shop has hidden this review/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Mine" })).toBeInTheDocument();
  });
});

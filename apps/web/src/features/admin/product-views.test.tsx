import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "@/features/auth/auth-store";
import { json, stubApi } from "@/test/api-mock";
import { makeAdminCategory, makeAdminProduct } from "@/test/fixtures";
import { renderWithQuery } from "@/test/render";
import { EditProductView, NewProductView } from "./product-views";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/admin/products/new",
}));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));
// jsdom has no object URLs.
vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:preview", revokeObjectURL: () => {} }));

const categories = [
  makeAdminCategory({ id: 9, article_type: "Shirts" }),
  makeAdminCategory({ id: 10, article_type: "Jeans", sub_category: "Bottomwear", path: "apparel/bottomwear/jeans" }),
];
const photo = () => new File(["pixels"], "shirt.jpg", { type: "image/jpeg" });

beforeEach(() => {
  push.mockClear();
  useAuth.setState({
    status: "signedIn",
    accessToken: "t",
    user: { id: 1, email: "a@b.co", full_name: "Ada", role: "admin" },
  });
});
afterEach(() => vi.unstubAllGlobals());

async function fillRequired(price = "49.99") {
  await userEvent.type(screen.getByLabelText("Name"), "Linen camp shirt");
  await userEvent.selectOptions(screen.getByLabelText("Category"), "9");
  await userEvent.type(screen.getByLabelText("Price (USD)"), price);
}

describe("NewProductView", () => {
  it("offers the categories grouped by their parents", async () => {
    stubApi({ "GET /api/v1/admin/categories": { body: categories } });
    renderWithQuery(<NewProductView />);

    const select = await screen.findByLabelText("Category");
    expect(within(select).getByRole("group", { name: "Apparel › Topwear" })).toBeInTheDocument();
    expect(within(select).getByRole("group", { name: "Apparel › Bottomwear" })).toBeInTheDocument();
  });

  it("does not create anything without a photo or with invalid details", async () => {
    const api = stubApi({ "GET /api/v1/admin/categories": { body: categories } });
    renderWithQuery(<NewProductView />);
    await screen.findByLabelText("Category");

    await userEvent.click(screen.getByRole("button", { name: "Create product" }));

    expect(await screen.findByText("Enter a name")).toBeInTheDocument();
    expect(screen.getByText("Choose a category")).toBeInTheDocument();
    expect(screen.getByText("Enter a price like 49.99")).toBeInTheDocument();
    await fillRequired();
    await userEvent.click(screen.getByRole("button", { name: "Create product" }));
    expect(await screen.findByText("Choose a photo of the product.")).toBeInTheDocument();
    expect(api.calls.filter((c) => c.method === "POST")).toHaveLength(0);
  });

  it("rejects a photo of the wrong type before uploading", async () => {
    const api = stubApi({ "GET /api/v1/admin/categories": { body: categories } });
    renderWithQuery(<NewProductView />);
    await screen.findByLabelText("Category");

    // `accept` only filters the file picker; a dragged-in or renamed file still reaches the form.
    await userEvent
      .setup({ applyAccept: false })
      .upload(screen.getByLabelText("Photo"), new File(["x"], "doc.pdf", { type: "application/pdf" }));

    expect(await screen.findByText("Use a JPEG, PNG or WebP photo.")).toBeInTheDocument();
    expect(screen.queryByAltText("Preview of the chosen photo")).not.toBeInTheDocument();
    expect(api.calls.filter((c) => c.method === "POST")).toHaveLength(0);
  });

  it("uploads the photo with the price in cents and opens the new product", async () => {
    const created = makeAdminProduct({ id: 41 });
    const api = stubApi({
      "GET /api/v1/admin/categories": { body: categories },
      "POST /api/v1/admin/products": { body: created, status: 201 },
    });
    renderWithQuery(<NewProductView />);
    await screen.findByLabelText("Category");

    await userEvent.upload(screen.getByLabelText("Photo"), photo());
    expect(screen.getByAltText("Preview of the chosen photo")).toBeInTheDocument();
    await fillRequired("49.99");
    await userEvent.type(screen.getByLabelText("Colour (optional)"), "Blue");
    await userEvent.click(screen.getByRole("button", { name: "Create product" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/admin/products/41"));
    const post = api.calls.find((c) => c.method === "POST")!;
    expect(post.headers.get("authorization")).toBe("Bearer t");
    expect(post.form?.get("file")).toBeInstanceOf(File);
    expect(Object.fromEntries([...post.form!.entries()].filter(([key]) => key !== "file"))).toEqual({
      name: "Linen camp shirt",
      category_id: "9",
      gender: "Women",
      base_colour: "Blue",
      price_cents: "4999",
      stock_quantity: "0",
      is_active: "true",
    });
  });

  it("keeps what was typed when the server refuses", async () => {
    stubApi({
      "GET /api/v1/admin/categories": { body: categories },
      "POST /api/v1/admin/products": json(
        { title: "Invalid image", status: 422, type: "urn:lookalike:problem:invalid-image" },
        422,
      ),
    });
    renderWithQuery(<NewProductView />);
    await screen.findByLabelText("Category");
    await userEvent.upload(screen.getByLabelText("Photo"), photo());
    await fillRequired();

    await userEvent.click(screen.getByRole("button", { name: "Create product" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Create product" })).toBeEnabled());
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Name")).toHaveValue("Linen camp shirt");
  });
});

describe("EditProductView", () => {
  const product = makeAdminProduct({ id: 7, price_cents: 4999, base_colour: "Blue" });
  const routes = {
    "GET /api/v1/admin/categories": { body: categories },
    "GET /api/v1/admin/products/7": { body: product },
  };

  it("shows the product's current values", async () => {
    stubApi(routes);
    renderWithQuery(<EditProductView id={7} />);

    expect(await screen.findByLabelText("Name")).toHaveValue("Linen camp shirt");
    expect(screen.getByLabelText("Price (USD)")).toHaveValue("49.99");
    expect(screen.getByLabelText("Stock")).toHaveValue("12");
    expect(screen.getByLabelText("Category")).toHaveValue("9");
    expect(screen.getByText("On sale")).toBeInTheDocument();
  });

  it("sends only details in a PATCH, clearing emptied options with null", async () => {
    const api = stubApi({
      ...routes,
      "PATCH /api/v1/admin/products/7": { body: { ...product, price_cents: 2500 } },
    });
    renderWithQuery(<EditProductView id={7} />);
    const price = await screen.findByLabelText("Price (USD)");

    await userEvent.clear(price);
    await userEvent.type(price, "25");
    await userEvent.clear(screen.getByLabelText("Colour (optional)"));
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(api.count("PATCH /api/v1/admin/products/7")).toBe(1));
    expect(api.calls.find((c) => c.method === "PATCH")!.body).toEqual({
      name: "Linen camp shirt",
      category_id: 9,
      gender: "Women",
      base_colour: null,
      season: "Fall",
      usage: "Ethnic",
      year: 2012,
      price_cents: 2500,
      stock_quantity: 12,
    });
  });

  it("replaces the photo through its own endpoint", async () => {
    const api = stubApi({
      ...routes,
      "PUT /api/v1/admin/products/7/image": { body: product },
    });
    renderWithQuery(<EditProductView id={7} />);
    await screen.findByLabelText("Name");

    await userEvent.click(screen.getByRole("button", { name: "Replace photo" }));
    expect(await screen.findByText("Choose a new photo first.")).toBeInTheDocument();
    await userEvent.upload(screen.getByLabelText("New photo"), photo());
    await userEvent.click(screen.getByRole("button", { name: "Replace photo" }));

    await waitFor(() => expect(api.count("PUT /api/v1/admin/products/7/image")).toBe(1));
    expect(api.calls.find((c) => c.method === "PUT")!.form?.get("file")).toBeInstanceOf(File);
  });

  it("withdraws and restores from the product page", async () => {
    const api = stubApi({
      ...routes,
      "POST /api/v1/admin/products/7/deactivate": { body: { ...product, is_active: false } },
    });
    renderWithQuery(<EditProductView id={7} />);

    await userEvent.click(await screen.findByRole("button", { name: "Withdraw" }));

    await waitFor(() => expect(api.count("POST /api/v1/admin/products/7/deactivate")).toBe(1));
  });

  it("says when the product does not exist", async () => {
    stubApi({
      "GET /api/v1/admin/categories": { body: categories },
      "GET /api/v1/admin/products/7": json({ title: "Product not found", status: 404 }, 404),
    });
    renderWithQuery(<EditProductView id={7} />);

    expect(await screen.findByText("There is no such product.")).toBeInTheDocument();
  });
});

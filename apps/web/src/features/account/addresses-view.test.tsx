import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "@/features/auth/auth-store";
import { json, stubApi } from "@/test/api-mock";
import { makeAddress } from "@/test/fixtures";
import { renderWithQuery } from "@/test/render";
import { AddressesView } from "./addresses-view";

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));

const home = makeAddress({ id: 1, line1: "12 Analytical Way", is_default: true });
const work = makeAddress({ id: 2, full_name: "Ada at Work", line1: "1 Engine Road", is_default: false });

beforeEach(() =>
  useAuth.setState({ status: "signedIn", accessToken: "t", user: { id: 1, email: "a@b.co", full_name: "Ada" } }),
);
afterEach(() => vi.unstubAllGlobals());

describe("AddressesView", () => {
  it("lists addresses and marks the default one", async () => {
    stubApi({ "GET /api/v1/addresses": { body: { items: [home, work] } } });
    renderWithQuery(<AddressesView />);

    const list = await screen.findByRole("list", { name: "Saved addresses" });
    const [first, second] = within(list).getAllByRole("listitem");
    expect(first).toHaveTextContent("Default");
    expect(first).toHaveTextContent("12 Analytical Way");
    expect(second).not.toHaveTextContent("Default");
    expect(within(second!).getByRole("button", { name: "Make default" })).toBeInTheDocument();
  });

  it("makes another address the default", async () => {
    const api = stubApi({
      "GET /api/v1/addresses": { body: { items: [home, work] } },
      "PATCH /api/v1/addresses/2": { body: { ...work, is_default: true } },
    });
    renderWithQuery(<AddressesView />);

    await userEvent.click(await screen.findByRole("button", { name: "Make default" }));

    await waitFor(() => expect(api.calls.find((c) => c.method === "PATCH")?.body).toEqual({ is_default: true }));
  });

  it("asks before deleting, and only deletes on confirmation", async () => {
    const api = stubApi({
      "GET /api/v1/addresses": { body: { items: [home, work] } },
      "DELETE /api/v1/addresses/2": new Response(null, { status: 204 }),
    });
    renderWithQuery(<AddressesView />);

    await userEvent.click(await screen.findByRole("button", { name: /Delete address for Ada at Work/ }));
    const dialog = await screen.findByRole("dialog", { name: "Delete this address?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Keep it" }));
    expect(api.count("DELETE /api/v1/addresses/2")).toBe(0);

    await userEvent.click(screen.getByRole("button", { name: /Delete address for Ada at Work/ }));
    await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(api.count("DELETE /api/v1/addresses/2")).toBe(1));
  });

  it("edits an address in place", async () => {
    const api = stubApi({
      "GET /api/v1/addresses": { body: { items: [home] } },
      "PATCH /api/v1/addresses/1": { body: { ...home, city: "Leeds" } },
    });
    renderWithQuery(<AddressesView />);

    await userEvent.click(await screen.findByRole("button", { name: /Edit address for Ada Lovelace/ }));
    const city = screen.getByLabelText("City");
    expect(city).toHaveValue("London");
    await userEvent.clear(city);
    await userEvent.type(city, "Leeds");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(api.count("PATCH /api/v1/addresses/1")).toBe(1));
    expect(api.calls.find((c) => c.method === "PATCH")?.body).toMatchObject({ city: "Leeds", country: "GB" });
  });

  it("adds an address and validates the form first", async () => {
    let items = [home];
    const api = stubApi({
      "GET /api/v1/addresses": () => json({ items }),
      "POST /api/v1/addresses": () => {
        items = [...items, work];
        return json(work, 201);
      },
    });
    renderWithQuery(<AddressesView />);
    await userEvent.click(await screen.findByRole("button", { name: "Add an address" }));

    await userEvent.click(screen.getByRole("button", { name: "Save address" }));
    expect(await screen.findByText("Enter a name")).toBeInTheDocument();
    expect(api.count("POST /api/v1/addresses")).toBe(0);

    await userEvent.type(screen.getByLabelText("Full name"), "Ada at Work");
    await userEvent.type(screen.getByLabelText("Address", { selector: "input" }), "1 Engine Road");
    await userEvent.type(screen.getByLabelText("City"), "London");
    await userEvent.type(screen.getByLabelText("Postal code"), "N1 9GU");
    await userEvent.click(screen.getByRole("button", { name: "Save address" }));

    await waitFor(() => expect(api.count("POST /api/v1/addresses")).toBe(1));
    expect(api.calls.find((c) => c.method === "POST")?.body).toMatchObject({
      full_name: "Ada at Work",
      line2: null,
      region: null,
      phone: null,
      country: "US",
    });
    expect(await screen.findByText("1 Engine Road · London · N1 9GU, GB")).toBeInTheDocument();
  });

  it("shows the form straight away when nothing is saved", async () => {
    stubApi({ "GET /api/v1/addresses": { body: { items: [] } } });
    renderWithQuery(<AddressesView />);

    expect(await screen.findByText("No saved addresses")).toBeInTheDocument();
    expect(screen.getByRole("form", { name: "Address details" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Use as my default address")).not.toBeInTheDocument(); // the first one is the default
  });
});

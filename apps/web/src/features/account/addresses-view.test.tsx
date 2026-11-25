import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "@/features/auth/auth-store";
import { json, stubApi } from "@/test/api-mock";
import { makeAddress } from "@/test/fixtures";
import { renderWithQuery } from "@/test/render";
import { AddressesView } from "./addresses-view";

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));

const home = makeAddress({ id: 1, is_default: true });
const work = makeAddress({ id: 2, full_name: "Ada at Work", line1: "Бага тойруу 14", line2: null, is_default: false });

beforeEach(() =>
  useAuth.setState({ status: "signedIn", accessToken: "t", user: { id: 1, email: "a@b.co", full_name: "Ada", role: "customer" as const, avatar_url: null, has_password: true, phone: null, email_verified: false, phone_verified: false, providers: [] as string[] } }),
);
afterEach(() => vi.unstubAllGlobals());

describe("AddressesView", () => {
  it("lists addresses and marks the default one", async () => {
    stubApi({ "GET /api/v1/addresses": { body: { items: [home, work] } } });
    renderWithQuery(<AddressesView />);

    const list = await screen.findByRole("list", { name: "Saved addresses" });
    const [first, second] = within(list).getAllByRole("listitem");
    expect(first).toHaveTextContent("Default");
    expect(first).toHaveTextContent("Улаанбаатар, Баянгол, 3-р хороо · Энхтайваны өргөн чөлөө 12 · 45 тоот");
    expect(first).toHaveTextContent("+976 9911 2233");
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
      "PATCH /api/v1/addresses/1": { body: { ...home, city: "Хан-Уул" } },
    });
    renderWithQuery(<AddressesView />);

    await userEvent.click(await screen.findByRole("button", { name: /Edit address for Болд Батбаяр/ }));
    const district = screen.getByLabelText("District");
    expect(district).toHaveValue("Баянгол");
    expect(screen.getByLabelText("Phone number")).toHaveValue("9911 2233"); // +976 угтваргүй
    await userEvent.selectOptions(district, "Хан-Уул");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(api.count("PATCH /api/v1/addresses/1")).toBe(1));
    expect(api.calls.find((c) => c.method === "PATCH")?.body).toMatchObject({
      region: "Улаанбаатар",
      city: "Хан-Уул",
      phone: "+97699112233",
      country: "MN",
    });
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
    await userEvent.type(screen.getByLabelText("Phone number"), "8811-2233");
    await userEvent.selectOptions(screen.getByLabelText("District"), "Баянгол");
    await userEvent.type(screen.getByLabelText("Street, building, apartment"), "Бага тойруу 14");
    await userEvent.click(screen.getByRole("button", { name: "Save address" }));

    await waitFor(() => expect(api.count("POST /api/v1/addresses")).toBe(1));
    expect(api.calls.find((c) => c.method === "POST")?.body).toMatchObject({
      full_name: "Ada at Work",
      phone: "+97688112233",
      region: "Улаанбаатар",
      city: "Баянгол",
      line1: "Бага тойруу 14",
      line2: null,
      khoroo: null,
      postal_code: "",
      country: "MN",
    });
    expect(await screen.findByText("Улаанбаатар, Баянгол, 3-р хороо · Бага тойруу 14")).toBeInTheDocument();
  });

  it("shows the form straight away when nothing is saved", async () => {
    stubApi({ "GET /api/v1/addresses": { body: { items: [] } } });
    renderWithQuery(<AddressesView />);

    expect(await screen.findByText("No saved addresses")).toBeInTheDocument();
    expect(screen.getByRole("form", { name: "Delivery address" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Use as my default address")).not.toBeInTheDocument(); // анхных нь үндсэн хаяг
  });
});

describe("AddressForm for Mongolia", () => {
  const open = async () => {
    stubApi({ "GET /api/v1/addresses": { body: { items: [] } } });
    renderWithQuery(<AddressesView />);
    await screen.findByRole("form", { name: "Delivery address" });
  };

  it("starts in Ulaanbaatar with a district list, and offers no country choice", async () => {
    await open();

    expect(screen.getByLabelText("Province / city")).toHaveValue("Улаанбаатар");
    expect(within(screen.getByLabelText("District")).getAllByRole("option")).toHaveLength(10); // 9 дүүрэг + сонгох
    expect(screen.queryByLabelText("Country")).not.toBeInTheDocument();
    expect(screen.getByText("+976")).toBeInTheDocument();
  });

  it("switches to a free-text soum and bag for an aimag, and forgets the old district", async () => {
    await open();
    await userEvent.selectOptions(screen.getByLabelText("District"), "Баянгол");

    await userEvent.selectOptions(screen.getByLabelText("Province / city"), "Дархан-Уул");

    const soum = screen.getByLabelText("Soum");
    expect(soum.tagName).toBe("INPUT");
    expect(soum).toHaveValue("");
    expect(screen.getByLabelText("Bag")).toBeInTheDocument();
    expect(screen.queryByLabelText("Khoroo")).not.toBeInTheDocument();
  });

  it("rejects a phone that is not an 8-digit Mongolian number and a postal code that is not 5 digits", async () => {
    await open();
    await userEvent.type(screen.getByLabelText("Full name"), "Болд");
    await userEvent.type(screen.getByLabelText("Phone number"), "12345");
    await userEvent.selectOptions(screen.getByLabelText("District"), "Баянгол");
    await userEvent.type(screen.getByLabelText("Street, building, apartment"), "Бага тойруу 14");
    await userEvent.type(screen.getByLabelText("Postal code (optional)"), "12");
    await userEvent.click(screen.getByRole("button", { name: "Save address" }));

    expect(await screen.findByText("Enter an 8-digit Mongolian phone number")).toBeInTheDocument();
    expect(screen.getByText("Use a 5-digit postal code or leave it empty")).toBeInTheDocument();
  });

  it("requires a district for Ulaanbaatar", async () => {
    await open();
    await userEvent.type(screen.getByLabelText("Full name"), "Болд");
    await userEvent.type(screen.getByLabelText("Phone number"), "99112233");
    await userEvent.type(screen.getByLabelText("Street, building, apartment"), "Бага тойруу 14");
    await userEvent.click(screen.getByRole("button", { name: "Save address" }));

    expect(await screen.findByText("Choose a district")).toBeInTheDocument();
  });
});

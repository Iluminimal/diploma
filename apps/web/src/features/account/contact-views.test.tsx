import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth, type SessionUser } from "@/features/auth/auth-store";
import { json, problem, respond, stubApi } from "@/test/api-mock";
import { renderWithQuery } from "@/test/render";
import { ProfileView } from "./profile-view";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/account/profile" }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));

const emailAccount: SessionUser = {
  id: 1,
  email: "ada@example.com",
  phone: null,
  email_verified: false,
  phone_verified: false,
  full_name: "Ada Lovelace",
  role: "customer",
  avatar_url: null,
  has_password: true,
  providers: [],
};
const phoneAccount: SessionUser = { ...emailAccount, email: null, phone: "+14155552671", phone_verified: true, has_password: false };
const both: SessionUser = { ...emailAccount, phone: "+14155552671", phone_verified: true, email_verified: true };

const NO_DEVICES = { "GET /api/v1/auth/sessions": respond([]) };
const signIn = (user: SessionUser) => useAuth.setState({ status: "signedIn", accessToken: "t", user });

beforeEach(() => signIn(emailAccount));
afterEach(() => vi.unstubAllGlobals());

describe("phone number", () => {
  it("is added with the password, a code sent to the new number, and shows up verified", async () => {
    const api = stubApi({
      ...NO_DEVICES,
      "POST /api/v1/auth/phone/request": { status: 202 },
      "POST /api/v1/auth/phone/confirm": (call) =>
        json({ ...emailAccount, phone: (call.body as { phone: string }).phone, phone_verified: true }),
    });
    renderWithQuery(<ProfileView />);

    await userEvent.click(screen.getByRole("button", { name: /Add a phone/ }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText("Phone number"), "+1 415 555 2671");
    await userEvent.click(within(dialog).getByRole("button", { name: "Send code" }));
    expect(await within(dialog).findByText("Enter your password to continue.")).toBeInTheDocument();

    await userEvent.type(within(dialog).getByLabelText("Your password"), "correct horse battery");
    await userEvent.click(within(dialog).getByRole("button", { name: "Send code" }));
    await within(dialog).findByLabelText("Digit 1 of 6");
    await userEvent.keyboard("123456");

    await waitFor(() => expect(useAuth.getState().user?.phone).toBe("+14155552671"));
    const sent = api.calls.filter((c) => c.method === "POST");
    expect(sent[0]?.body).toEqual({ phone: "+14155552671", current_password: "correct horse battery" });
    expect(sent[1]?.body).toEqual({ phone: "+14155552671", code: "123456" });
    expect(await screen.findByText(/Change phone/)).toBeInTheDocument();
  });

  it("explains that the number belongs to another account", async () => {
    stubApi({
      ...NO_DEVICES,
      "POST /api/v1/auth/phone/request": problem(409, "Phone number already in use", { type: "urn:angel:problem:phone-taken" }),
    });
    renderWithQuery(<ProfileView />);

    await userEvent.click(screen.getByRole("button", { name: /Add a phone/ }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText("Phone number"), "+1 415 555 2671");
    await userEvent.type(within(dialog).getByLabelText("Your password"), "correct horse battery");
    await userEvent.click(within(dialog).getByRole("button", { name: "Send code" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Another account already uses this phone number.");
  });

  it("is removed when an email remains, but not offered when it is the only way in", async () => {
    signIn(both);
    stubApi({ ...NO_DEVICES, "DELETE /api/v1/auth/phone": (call) => json({ ...both, phone: null, phone_verified: false, _body: call.body }) });
    const { unmount } = renderWithQuery(<ProfileView />);

    await userEvent.click(screen.getByRole("button", { name: "Remove phone" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText("Your password"), "correct horse battery");
    await userEvent.click(within(dialog).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(useAuth.getState().user?.phone).toBeNull());
    unmount();

    signIn(phoneAccount);
    renderWithQuery(<ProfileView />);
    expect(screen.queryByRole("button", { name: "Remove phone" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Add an email/ })).toBeInTheDocument();
    expect(screen.queryByText("Password")).not.toBeInTheDocument();
  });
});

describe("email", () => {
  it("is confirmed with a code that is sent as the dialog opens", async () => {
    const api = stubApi({
      ...NO_DEVICES,
      "POST /api/v1/auth/email/verify/request": { status: 202 },
      "POST /api/v1/auth/email/verify/confirm": json({ ...emailAccount, email_verified: true }),
    });
    renderWithQuery(<ProfileView />);

    await userEvent.click(screen.getByRole("button", { name: "Verify email" }));
    await screen.findByLabelText("Digit 1 of 6");
    expect(api.count("POST /api/v1/auth/email/verify/request")).toBe(1);
    await userEvent.keyboard("123456");

    await waitFor(() => expect(useAuth.getState().user?.email_verified).toBe(true));
    expect(api.calls.find((c) => c.path.endsWith("/confirm"))?.body).toEqual({ code: "123456" });
    expect(screen.queryByRole("button", { name: "Verify email" })).not.toBeInTheDocument();
  });

  it("can be added by a phone account, with no password to prove", async () => {
    signIn(phoneAccount);
    const api = stubApi({
      ...NO_DEVICES,
      "POST /api/v1/auth/email/request": { status: 202 },
      "POST /api/v1/auth/email/confirm": json({ ...phoneAccount, email: "ada@example.com", email_verified: true }),
    });
    renderWithQuery(<ProfileView />);

    await userEvent.click(screen.getByRole("button", { name: /Add an email/ }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByLabelText("Your password")).not.toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText("Email"), "Ada@Example.com");
    await userEvent.click(within(dialog).getByRole("button", { name: "Send code" }));
    await within(dialog).findByLabelText("Digit 1 of 6");
    await userEvent.keyboard("654321");

    await waitFor(() => expect(useAuth.getState().user?.email).toBe("ada@example.com"));
    expect(api.calls.filter((c) => c.method === "POST")[0]?.body).toEqual({ email: "ada@example.com" });
  });
});

describe("devices", () => {
  const devices = [
    { id: "a", device: "Chrome on macOS", ip: "127.0.0.1", created_at: "2026-10-01T09:00:00Z", last_used_at: "2026-10-12T09:00:00Z", current: true },
    { id: "b", device: "Safari on iPhone", ip: null, created_at: "2026-10-02T09:00:00Z", last_used_at: "2026-10-10T09:00:00Z", current: false },
  ];

  it("lists them, marks this one and signs another out", async () => {
    let list = devices;
    const api = stubApi({
      "GET /api/v1/auth/sessions": () => json(list),
      "DELETE /api/v1/auth/sessions/b": () => {
        list = [devices[0]!];
        return new Response(null, { status: 204 });
      },
    });
    renderWithQuery(<ProfileView />);

    const deviceList = await screen.findByRole("list", { name: "Devices" });
    expect(within(deviceList).getByText("This device")).toBeInTheDocument();
    expect(within(deviceList).getAllByRole("button")).toHaveLength(1);

    await userEvent.click(within(deviceList).getByRole("button", { name: "Sign out Safari on iPhone" }));

    await waitFor(() => expect(within(screen.getByRole("list", { name: "Devices" })).queryByText("Safari on iPhone")).not.toBeInTheDocument());
    expect(api.count("DELETE /api/v1/auth/sessions/b")).toBe(1);
  });

  it("signs out everywhere else", async () => {
    const api = stubApi({
      "GET /api/v1/auth/sessions": respond(devices),
      "POST /api/v1/auth/sessions/revoke-others": { status: 204 },
    });
    renderWithQuery(<ProfileView />);

    await userEvent.click(await screen.findByRole("button", { name: "Sign out everywhere else" }));

    await waitFor(() => expect(api.count("POST /api/v1/auth/sessions/revoke-others")).toBe(1));
  });
});

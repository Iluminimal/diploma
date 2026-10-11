import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth, type SessionUser } from "@/features/auth/auth-store";
import { json, problem, stubApi } from "@/test/api-mock";
import { renderWithQuery } from "@/test/render";
import { ProfileView } from "./profile-view";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }), usePathname: () => "/account/profile" }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));

const withPassword: SessionUser = {
  id: 1,
  email: "ada@example.com",
  full_name: "Ada Lovelace",
  role: "customer",
  avatar_url: null,
  has_password: true,
  providers: [],
};
const googleOnly: SessionUser = { ...withPassword, has_password: false, providers: ["google"] };

function signIn(user: SessionUser) {
  useAuth.setState({ status: "signedIn", accessToken: "t", user });
}

beforeEach(() => push.mockReset());
afterEach(() => vi.unstubAllGlobals());

describe("ProfileView", () => {
  it("shows who you are and how you sign in", () => {
    signIn(googleOnly);
    renderWithQuery(<ProfileView />);

    expect(screen.getByDisplayValue("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText("Connected")).toBeInTheDocument();
    expect(screen.getByText(/Not set\. You sign in with Google/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Set a password/ })).toBeInTheDocument();
    expect(screen.getByText(/can't be changed here/)).toBeInTheDocument();
  });

  it("offers to change, not set, a password that exists", () => {
    signIn(withPassword);
    renderWithQuery(<ProfileView />);

    expect(screen.getByRole("button", { name: /Change password/ })).toBeInTheDocument();
    expect(screen.getByText(/Not connected/)).toBeInTheDocument();
  });

  it("saves a new name only once it has changed, and the header sees it", async () => {
    signIn(withPassword);
    const api = stubApi({
      "PATCH /api/v1/auth/me": (call) => json({ ...withPassword, ...(call.body as object) }),
    });
    renderWithQuery(<ProfileView />);
    const save = screen.getByRole("button", { name: "Save changes" });
    expect(save).toBeDisabled();

    const name = screen.getByLabelText("Full name");
    await userEvent.clear(name);
    await userEvent.type(name, "Ada King");
    await userEvent.click(save);

    await waitFor(() => expect(useAuth.getState().user?.full_name).toBe("Ada King"));
    expect(api.calls[0]?.body).toEqual({ full_name: "Ada King" });
    expect(save).toBeDisabled();
  });

  it("refuses an empty name without asking the API", async () => {
    signIn(withPassword);
    const api = stubApi({});
    renderWithQuery(<ProfileView />);

    await userEvent.clear(screen.getByLabelText("Full name"));
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByText("Enter your name")).toBeInTheDocument();
    expect(api.calls).toHaveLength(0);
  });

  describe("password", () => {
    const session = { access_token: "fresh", token_type: "bearer", expires_in: 900 };

    it("lets a Google-only account set one, without a current password", async () => {
      signIn(googleOnly);
      const api = stubApi({
        "PUT /api/v1/auth/password": { body: { ...session, user: { ...googleOnly, has_password: true } } },
      });
      renderWithQuery(<ProfileView />);

      await userEvent.click(screen.getByRole("button", { name: /Set a password/ }));
      const dialog = await screen.findByRole("dialog");
      expect(within(dialog).queryByLabelText("Current password")).not.toBeInTheDocument();
      await userEvent.type(within(dialog).getByLabelText("New password"), "a brand new passphrase");
      expect(within(dialog).getByText("Excellent")).toBeInTheDocument();
      await userEvent.type(within(dialog).getByLabelText("Confirm new password"), "a brand new passphrase");
      await userEvent.click(within(dialog).getByRole("button", { name: "Set password" }));

      await waitFor(() => expect(useAuth.getState().accessToken).toBe("fresh"));
      expect(api.calls[0]?.body).toEqual({ new_password: "a brand new passphrase" });
      expect(useAuth.getState().user?.has_password).toBe(true);
    });

    it("asks for the current password, and says so when it is wrong", async () => {
      signIn(withPassword);
      stubApi({ "PUT /api/v1/auth/password": problem(403, "Incorrect password", { type: "urn:lookalike:problem:invalid-credentials" }) });
      renderWithQuery(<ProfileView />);

      await userEvent.click(screen.getByRole("button", { name: /Change password/ }));
      const dialog = await screen.findByRole("dialog");
      await userEvent.type(within(dialog).getByLabelText("Current password"), "not it at all");
      await userEvent.type(within(dialog).getByLabelText("New password"), "a brand new passphrase");
      await userEvent.type(within(dialog).getByLabelText("Confirm new password"), "a brand new passphrase");
      await userEvent.click(within(dialog).getByRole("button", { name: "Change password" }));

      expect(await within(dialog).findByText("That isn't your current password")).toBeInTheDocument();
      expect(useAuth.getState().accessToken).toBe("t");
    });

    it("catches a short password and a mismatch before asking the API", async () => {
      signIn(googleOnly);
      const api = stubApi({});
      renderWithQuery(<ProfileView />);

      await userEvent.click(screen.getByRole("button", { name: /Set a password/ }));
      const dialog = await screen.findByRole("dialog");
      await userEvent.type(within(dialog).getByLabelText("New password"), "short");
      await userEvent.click(within(dialog).getByRole("button", { name: "Set password" }));
      expect(await within(dialog).findByText("Use at least 10 characters")).toBeInTheDocument();

      await userEvent.clear(within(dialog).getByLabelText("New password"));
      await userEvent.type(within(dialog).getByLabelText("New password"), "a brand new passphrase");
      await userEvent.type(within(dialog).getByLabelText("Confirm new password"), "something different");
      await userEvent.click(within(dialog).getByRole("button", { name: "Set password" }));
      expect(await within(dialog).findByText("The two passwords don't match")).toBeInTheDocument();
      expect(api.calls).toHaveLength(0);
    });
  });

  describe("deleting", () => {
    async function openDialog() {
      await userEvent.click(screen.getByRole("button", { name: /Delete my account/ }));
      return screen.findByRole("dialog");
    }

    it("stays disabled until the email is typed back (and the password given)", async () => {
      signIn(withPassword);
      renderWithQuery(<ProfileView />);
      const dialog = await openDialog();
      const confirm = within(dialog).getByRole("button", { name: "Delete account" });
      expect(confirm).toBeDisabled();

      await userEvent.type(within(dialog).getByLabelText("Your email"), "ADA@example.com");
      expect(confirm).toBeDisabled();
      await userEvent.type(within(dialog).getByLabelText("Your password"), "correct horse battery");

      expect(confirm).toBeEnabled();
    });

    it("deletes, signs out here and goes home", async () => {
      signIn(googleOnly);
      const api = stubApi({ "DELETE /api/v1/auth/me": { status: 204 }, "GET /api/v1/cart": { body: { lines: [] } } });
      renderWithQuery(<ProfileView />);
      const dialog = await openDialog();
      expect(within(dialog).queryByLabelText("Your password")).not.toBeInTheDocument();

      await userEvent.type(within(dialog).getByLabelText("Your email"), "ada@example.com");
      await userEvent.click(within(dialog).getByRole("button", { name: "Delete account" }));

      await waitFor(() => expect(push).toHaveBeenCalledWith("/"));
      expect(api.calls[0]?.body).toEqual({ confirm_email: "ada@example.com" });
      expect(useAuth.getState().status).toBe("signedOut");
    });

    it("says when the password is wrong and stays signed in", async () => {
      signIn(withPassword);
      stubApi({ "DELETE /api/v1/auth/me": problem(403, "Incorrect password", { type: "urn:lookalike:problem:invalid-credentials" }) });
      renderWithQuery(<ProfileView />);
      const dialog = await openDialog();

      await userEvent.type(within(dialog).getByLabelText("Your email"), "ada@example.com");
      await userEvent.type(within(dialog).getByLabelText("Your password"), "nope nope nope");
      await userEvent.click(within(dialog).getByRole("button", { name: "Delete account" }));

      expect(await within(dialog).findByRole("alert")).toHaveTextContent("That password isn't right.");
      expect(push).not.toHaveBeenCalled();
      expect(useAuth.getState().status).toBe("signedIn");
    });
  });
});

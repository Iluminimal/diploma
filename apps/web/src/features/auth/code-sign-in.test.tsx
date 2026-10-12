import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { json, problem, stubApi } from "@/test/api-mock";
import { renderWithQuery } from "@/test/render";
import { useAuth } from "./auth-store";
import { CodeSignIn } from "./code-sign-in";

const replace = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, refresh }) }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));

const user = {
  id: 1,
  email: null,
  phone: "+14155552671",
  email_verified: false,
  phone_verified: true,
  full_name: "New customer",
  role: "customer" as const,
  avatar_url: null,
  has_password: false,
  providers: [] as string[],
};
const session = (isNew: boolean) => ({
  access_token: "t1",
  token_type: "bearer",
  expires_in: 900,
  user,
  is_new_user: isNew,
});
const emptyCart = { lines: [], item_count: 0, subtotal_cents: 0, currency: "USD", has_issues: false };

beforeEach(() => {
  replace.mockReset();
  refresh.mockReset();
  useAuth.setState({ status: "signedOut", accessToken: null, user: null });
});
afterEach(() => vi.unstubAllGlobals());

async function askForCode(number = "415 555 2671") {
  await userEvent.type(await screen.findByLabelText("Phone number"), number);
  await userEvent.click(screen.getByRole("button", { name: "Send code" }));
}

describe("CodeSignIn with a phone number", () => {
  it("sends the code to the number in international format, then signs in with the six digits", async () => {
    const api = stubApi({
      "POST /api/v1/auth/otp/request": { status: 202 },
      "POST /api/v1/auth/otp/verify": json(session(false)),
      "GET /api/v1/cart": json(emptyCart),
    });
    renderWithQuery(<CodeSignIn kind="phone" next="/checkout" />);

    await askForCode();
    expect(await screen.findByText(/We sent a 6-digit code to/)).toHaveTextContent("+14155552671");
    await userEvent.keyboard("123456");

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/checkout"));
    expect(api.calls[0]?.body).toEqual({ destination: "+14155552671" });
    expect(api.calls[1]?.body).toEqual({ destination: "+14155552671", code: "123456" });
    expect(useAuth.getState()).toMatchObject({ status: "signedIn", accessToken: "t1" });
  });

  it("refuses a number that cannot be right without calling the API", async () => {
    const api = stubApi({});
    renderWithQuery(<CodeSignIn kind="phone" next="/" />);

    await askForCode("12");

    expect(await screen.findByText("Enter a valid phone number.")).toBeInTheDocument();
    expect(api.calls).toHaveLength(0);
  });

  it("says when the code is wrong, clears the boxes and lets the person try again", async () => {
    stubApi({
      "POST /api/v1/auth/otp/request": { status: 202 },
      "POST /api/v1/auth/otp/verify": problem(400, "That code is not right", {
        type: "urn:angel:problem:otp-invalid",
      }),
    });
    renderWithQuery(<CodeSignIn kind="phone" next="/" />);
    await askForCode();
    await screen.findByText(/We sent a 6-digit code/);

    await userEvent.keyboard("000000");

    expect(await screen.findByRole("alert")).toHaveTextContent("That code isn't right");
    expect((screen.getByLabelText("Digit 1 of 6") as HTMLInputElement).value).toBe("");
    expect(replace).not.toHaveBeenCalled();
    expect(useAuth.getState().status).toBe("signedOut");
  });

  it("waits before a code can be sent again", async () => {
    stubApi({ "POST /api/v1/auth/otp/request": { status: 202 } });
    renderWithQuery(<CodeSignIn kind="phone" next="/" />);

    await askForCode();

    expect(await screen.findByRole("button", { name: /Resend in \d+s/ })).toBeDisabled();
  });

  it("goes back to change the number", async () => {
    stubApi({ "POST /api/v1/auth/otp/request": { status: 202 } });
    renderWithQuery(<CodeSignIn kind="phone" next="/" />);
    await askForCode();

    await userEvent.click(await screen.findByRole("button", { name: "Use a different number" }));

    expect(screen.getByLabelText("Phone number")).toHaveValue("(415) 555-2671");
  });

  it("asks a brand-new customer for a name, stays on the page until it is saved, then leaves", async () => {
    const onNaming = vi.fn();
    const api = stubApi({
      "POST /api/v1/auth/otp/request": { status: 202 },
      "POST /api/v1/auth/otp/verify": json(session(true)),
      "GET /api/v1/cart": json(emptyCart),
      "PATCH /api/v1/auth/me": json({ ...user, full_name: "Ada Lovelace" }),
    });
    renderWithQuery(<CodeSignIn kind="phone" next="/" onNaming={onNaming} />);
    await askForCode();
    await screen.findByText(/We sent a 6-digit code/);

    await userEvent.keyboard("123456");
    await userEvent.type(await screen.findByLabelText("Full name"), "Ada Lovelace");
    expect(replace).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
    expect(onNaming).toHaveBeenCalledWith(true);
    expect(api.calls.find((c) => c.method === "PATCH")?.body).toEqual({ full_name: "Ada Lovelace" });
    expect(useAuth.getState().user?.full_name).toBe("Ada Lovelace");
  });

  it("lets a new customer skip the name", async () => {
    stubApi({
      "POST /api/v1/auth/otp/request": { status: 202 },
      "POST /api/v1/auth/otp/verify": json(session(true)),
      "GET /api/v1/cart": json(emptyCart),
    });
    renderWithQuery(<CodeSignIn kind="phone" next="/" />);
    await askForCode();
    await screen.findByText(/We sent a 6-digit code/);
    await userEvent.keyboard("123456");

    await userEvent.click(await screen.findByRole("button", { name: "Skip for now" }));

    expect(replace).toHaveBeenCalledWith("/");
  });
});

describe("CodeSignIn with an email", () => {
  it("sends the code to the lower-cased address", async () => {
    const api = stubApi({ "POST /api/v1/auth/otp/request": { status: 202 } });
    renderWithQuery(<CodeSignIn kind="email" next="/" />);

    await userEvent.type(screen.getByLabelText("Email"), " Ada@Example.com ");
    await userEvent.click(screen.getByRole("button", { name: "Send code" }));

    expect(await screen.findByText(/We sent a 6-digit code to/)).toHaveTextContent("Ada@Example.com");
    expect(api.calls[0]?.body).toEqual({ destination: "ada@example.com" });
  });

  it("checks the address before calling the API", async () => {
    const api = stubApi({});
    renderWithQuery(<CodeSignIn kind="email" next="/" />);

    await userEvent.type(screen.getByLabelText("Email"), "nope");
    await userEvent.click(screen.getByRole("button", { name: "Send code" }));

    expect(await screen.findByText("Enter a valid email address.")).toBeInTheDocument();
    expect(api.calls).toHaveLength(0);
  });
});

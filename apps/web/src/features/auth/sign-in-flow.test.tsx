import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { json, problem, stubApi } from "@/test/api-mock";
import { renderWithQuery } from "@/test/render";
import { useAuth } from "./auth-store";
import { SignInFlow } from "./sign-in-flow";

const replace = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, refresh }) }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));

const user = {
  id: 1,
  email: "ada@example.com",
  phone: "+14155552671",
  email_verified: false,
  phone_verified: true,
  full_name: "Ada",
  role: "customer" as const,
  avatar_url: null,
  has_password: true,
  providers: [] as string[],
};
const session = (extra: Record<string, unknown> = {}, role: "customer" | "admin" = "customer") => ({
  access_token: "t1",
  token_type: "bearer",
  expires_in: 900,
  user: { ...user, role },
  ...extra,
});
const emptyCart = { lines: [], item_count: 0, subtotal_cents: 0, currency: "USD", has_issues: false };
const wrongPassword = () =>
  problem(401, "Invalid email or password", { type: "urn:angel:problem:invalid-credentials" });

beforeEach(() => {
  replace.mockReset();
  refresh.mockReset();
  useAuth.setState({ status: "signedOut", accessToken: null, user: null });
});
afterEach(() => vi.unstubAllGlobals());

const field = () => screen.findByLabelText("Email or phone number");
async function enter(text: string) {
  await userEvent.type(await field(), text);
  await userEvent.click(screen.getByRole("button", { name: "Continue" }));
}

describe("SignInFlow: the first step", () => {
  it("is one field for an email or a phone number, and nothing else to choose", async () => {
    renderWithQuery(<SignInFlow next="/" social={<p>social slot</p>} />);

    expect(await field()).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Sign in or create account" })).toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Country" })).not.toBeInTheDocument();
    expect(screen.getByText("social slot")).toBeInTheDocument();
  });

  it("shows the country picker, on Mongolia, as soon as digits are typed", async () => {
    renderWithQuery(<SignInFlow next="/" />);

    await userEvent.type(await field(), "80172121");

    expect(screen.getByRole("combobox", { name: "Country" })).toHaveValue("MN");
  });

  it("sends a Mongolian number without a country code to +976", async () => {
    const api = stubApi({ "POST /api/v1/auth/otp/request": { status: 202 } });
    renderWithQuery(<SignInFlow next="/" />);

    await enter("8017 2121");

    await screen.findByText(/We sent a 6-digit code/);
    expect(api.calls[0]?.body).toEqual({ destination: "+97680172121" });
  });

  it("takes the picker away again for an email", async () => {
    renderWithQuery(<SignInFlow next="/" />);

    await userEvent.type(await field(), "4");
    expect(screen.getByRole("combobox", { name: "Country" })).toBeInTheDocument();
    await userEvent.type(await field(), "a");

    expect(screen.queryByRole("combobox", { name: "Country" })).not.toBeInTheDocument();
  });

  it.each([
    ["", "Enter your email or phone number."],
    ["12", "Enter a valid phone number."],
    ["not an email", "Enter a valid email address or phone number."],
  ])("refuses %j without calling the API", async (text, message) => {
    const api = stubApi({});
    renderWithQuery(<SignInFlow next="/" />);

    if (text) await userEvent.type(await field(), text);
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(api.calls).toHaveLength(0);
  });

  it("shows the problem Google sent the visitor back with", async () => {
    renderWithQuery(<SignInFlow next="/" notice="Google sign-in was cancelled." />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Google sign-in was cancelled.");
  });
});

describe("SignInFlow with a phone number", () => {
  it("texts a code to the number in international form, then signs in with the six digits", async () => {
    const api = stubApi({
      "POST /api/v1/auth/otp/request": { status: 202 },
      "POST /api/v1/auth/otp/verify": json(session({ is_new_user: false })),
      "GET /api/v1/cart": json(emptyCart),
    });
    renderWithQuery(<SignInFlow next="/checkout" />);

    await enter("+1 415 555 2671");
    expect(await screen.findByRole("heading", { name: "Enter the code" })).toBeInTheDocument();
    expect(screen.getByText(/We sent a 6-digit code to/)).toHaveTextContent("415");
    await userEvent.keyboard("123456");

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/checkout"));
    expect(api.calls[0]?.body).toEqual({ destination: "+14155552671" });
    expect(api.calls[1]?.body).toEqual({ destination: "+14155552671", code: "123456" });
    expect(useAuth.getState()).toMatchObject({ status: "signedIn", accessToken: "t1" });
  });

  it("says when the code is wrong, clears the boxes and lets the person try again", async () => {
    stubApi({
      "POST /api/v1/auth/otp/request": { status: 202 },
      "POST /api/v1/auth/otp/verify": problem(400, "That code is not right", { type: "urn:angel:problem:otp-invalid" }),
    });
    renderWithQuery(<SignInFlow next="/" />);
    await enter("+1 415 555 2671");
    await screen.findByText(/We sent a 6-digit code/);

    await userEvent.keyboard("000000");

    expect(await screen.findByRole("alert")).toHaveTextContent("That code isn't right");
    expect((screen.getByLabelText("Digit 1 of 6") as HTMLInputElement).value).toBe("");
    expect(replace).not.toHaveBeenCalled();
    expect(useAuth.getState().status).toBe("signedOut");
  });

  it("waits before a code can be sent again", async () => {
    stubApi({ "POST /api/v1/auth/otp/request": { status: 202 } });
    renderWithQuery(<SignInFlow next="/" />);

    await enter("+1 415 555 2671");

    expect(await screen.findByRole("button", { name: /Resend code in \d+s/ })).toBeDisabled();
  });

  it("goes back with the number kept when Edit is pressed", async () => {
    stubApi({ "POST /api/v1/auth/otp/request": { status: 202 } });
    renderWithQuery(<SignInFlow next="/" />);
    await enter("+1 415 555 2671");

    await userEvent.click(await screen.findByRole("button", { name: /^Change / }));

    expect(await field()).toHaveValue("+1 415 555 2671");
  });

  it("stays on the first step and says why when the code cannot be sent", async () => {
    stubApi({ "POST /api/v1/auth/otp/request": problem(429, "Too many requests", { type: "urn:angel:problem:rate-limited" }) });
    renderWithQuery(<SignInFlow next="/" />);

    await enter("+1 415 555 2671");

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Sign in or create account" })).toBeInTheDocument();
  });

  it("asks a brand-new customer for a name, stays on the page until it is saved, then leaves", async () => {
    const api = stubApi({
      "POST /api/v1/auth/otp/request": { status: 202 },
      "POST /api/v1/auth/otp/verify": json(session({ is_new_user: true })),
      "GET /api/v1/cart": json(emptyCart),
      "PATCH /api/v1/auth/me": json({ ...user, full_name: "Ada Lovelace" }),
    });
    renderWithQuery(<SignInFlow next="/" />);
    await enter("+1 415 555 2671");
    await screen.findByText(/We sent a 6-digit code/);

    await userEvent.keyboard("123456");
    expect(await screen.findByRole("heading", { name: "Welcome to Angel" })).toBeInTheDocument();
    await userEvent.type(await screen.findByLabelText("Full name"), "Ada Lovelace");
    expect(replace).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
    expect(api.calls.find((c) => c.method === "PATCH")?.body).toEqual({ full_name: "Ada Lovelace" });
  });

  it("lets a new customer skip the name", async () => {
    stubApi({
      "POST /api/v1/auth/otp/request": { status: 202 },
      "POST /api/v1/auth/otp/verify": json(session({ is_new_user: true })),
      "GET /api/v1/cart": json(emptyCart),
    });
    renderWithQuery(<SignInFlow next="/" />);
    await enter("+1 415 555 2671");
    await screen.findByText(/We sent a 6-digit code/);
    await userEvent.keyboard("123456");

    await userEvent.click(await screen.findByRole("button", { name: "Skip for now" }));

    expect(replace).toHaveBeenCalledWith("/");
  });
});

describe("SignInFlow with an email", () => {
  it("asks for the password without calling the API first (it never reveals who has an account)", async () => {
    const api = stubApi({});
    renderWithQuery(<SignInFlow next="/" />);

    await enter(" Ada@Example.com ");

    expect(await screen.findByRole("heading", { name: "Enter your password" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Change Ada@Example.com" })).toBeInTheDocument();
    expect(api.calls).toHaveLength(0);
  });

  it("signs in with the password, stores the session and goes to the requested page", async () => {
    const api = stubApi({
      "POST /api/v1/auth/login": json(session()),
      "GET /api/v1/cart": json(emptyCart),
    });
    renderWithQuery(<SignInFlow next="/checkout" />);
    await enter("Ada@Example.com");

    await userEvent.type(await screen.findByLabelText("Password"), "correct horse battery");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/checkout"));
    expect(api.calls[0]?.body).toEqual({ email: "ada@example.com", password: "correct horse battery" });
    expect(useAuth.getState()).toMatchObject({ status: "signedIn", accessToken: "t1" });
  });

  it("takes an administrator to the admin area unless they asked for another page", async () => {
    stubApi({ "POST /api/v1/auth/login": json(session({}, "admin")), "GET /api/v1/cart": json(emptyCart) });
    renderWithQuery(<SignInFlow next="/" />);
    await enter("ada@example.com");

    await userEvent.type(await screen.findByLabelText("Password"), "correct horse battery");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/admin"));
  });

  it("asks for a password before calling the API", async () => {
    const api = stubApi({});
    renderWithQuery(<SignInFlow next="/" />);
    await enter("ada@example.com");

    await userEvent.click(await screen.findByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Enter your password.")).toBeInTheDocument();
    expect(api.calls).toHaveLength(0);
  });

  it("says the same thing for wrong credentials whoever the email belongs to, and points to the other ways in", async () => {
    stubApi({ "POST /api/v1/auth/login": wrongPassword });
    renderWithQuery(<SignInFlow next="/" />);
    await enter("ada@example.com");

    await userEvent.type(await screen.findByLabelText("Password"), "wrong password");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("don't match");
    expect(alert).toHaveTextContent("Get a code by email instead");
    expect(alert).toHaveTextContent("Continue with Google");
    expect(replace).not.toHaveBeenCalled();
    expect(useAuth.getState().status).toBe("signedOut");
  });

  it("can email a code instead, which signs in or creates the account", async () => {
    const api = stubApi({
      "POST /api/v1/auth/otp/request": { status: 202 },
      "POST /api/v1/auth/otp/verify": json(session({ is_new_user: false })),
      "GET /api/v1/cart": json(emptyCart),
    });
    renderWithQuery(<SignInFlow next="/" />);
    await enter("Ada@Example.com");

    await userEvent.click(await screen.findByRole("button", { name: "Email me a code instead" }));
    expect(await screen.findByRole("heading", { name: "Enter the code" })).toBeInTheDocument();
    await userEvent.keyboard("123456");

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
    expect(api.calls[0]?.body).toEqual({ destination: "ada@example.com" });
    expect(api.calls[1]?.body).toEqual({ destination: "ada@example.com", code: "123456" });
  });

  it("links to the password reset", async () => {
    renderWithQuery(<SignInFlow next="/" />);
    await enter("ada@example.com");

    expect(await screen.findByRole("link", { name: "Forgot your password?" })).toHaveAttribute("href", "/forgot-password");
  });
});

describe("SignInFlow when already signed in", () => {
  it("leaves for the page that was asked for", () => {
    useAuth.setState({ status: "signedIn", accessToken: "t", user });
    renderWithQuery(<SignInFlow next="/account/orders" />);

    expect(replace).toHaveBeenCalledWith("/account/orders");
  });
});

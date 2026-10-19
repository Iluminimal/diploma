import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GoogleSignIn, googleStartHref } from "./google-sign-in";
import { oauthErrorMessage } from "./oauth-errors";
import { getAuthProviders } from "./providers";

vi.mock("./providers", () => ({ getAuthProviders: vi.fn() }));
const providers = vi.mocked(getAuthProviders);

beforeEach(() => providers.mockReset());

describe("googleStartHref", () => {
  it("goes straight to the API's start endpoint", () => {
    expect(googleStartHref("/")).toBe("/api/v1/auth/google/start");
  });

  it("carries the page to return to, encoded", () => {
    expect(googleStartHref("/products?q=red dress")).toBe(
      "/api/v1/auth/google/start?next=%2Fproducts%3Fq%3Dred%20dress",
    );
  });
});

describe("GoogleSignIn", () => {
  it("is a plain link to the API, under a divider", async () => {
    providers.mockResolvedValue({ google: true });

    render(await GoogleSignIn({ next: "/checkout" }));

    const link = screen.getByRole("link", { name: "Continue with Google" });
    expect(link).toHaveAttribute("href", "/api/v1/auth/google/start?next=%2Fcheckout");
    expect(screen.getByRole("separator")).toBeInTheDocument();
  });

  it("is not there when Google is not configured", async () => {
    providers.mockResolvedValue({ google: false });

    expect(await GoogleSignIn({ next: "/" })).toBeNull();
  });
});

describe("oauthErrorMessage", () => {
  it.each(["google_denied", "google_failed", "google_unverified", "account_disabled"])("explains %s", (code) => {
    expect(oauthErrorMessage(code)).toEqual(expect.any(String));
  });

  it("takes the first of repeated parameters", () => {
    expect(oauthErrorMessage(["google_denied", "x"])).toContain("cancelled");
  });

  it.each([undefined, "", "<script>", "constructor", "something_else"])("says nothing for %s", (code) => {
    expect(oauthErrorMessage(code)).toBeNull();
  });
});

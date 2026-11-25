import { screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { problem, respond, stubApi } from "@/test/api-mock";
import { renderWithQuery } from "@/test/render";
import { SecurityActivityCard } from "./security-activity";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/account/profile" }));

const EVENTS = "GET /api/v1/auth/security-events";
const event = (over: Record<string, unknown>) => ({
  id: 1,
  type: "login",
  method: "password",
  device: "Chrome on macOS",
  ip: "203.0.113.x",
  created_at: "2026-11-25T09:00:00Z",
  ...over,
});

afterEach(() => vi.unstubAllGlobals());

describe("SecurityActivityCard", () => {
  it("lists what happened, with the device, the way in and the hidden end of the address", async () => {
    stubApi({
      [EVENTS]: respond([
        event({ id: 3, type: "new_device", device: "Safari on iPhone", method: "otp" }),
        event({ id: 2, type: "password_changed", method: null, ip: null }),
        event({ id: 1, type: "login" }),
      ]),
    });
    renderWithQuery(<SecurityActivityCard />);

    const list = within(await screen.findByRole("list", { name: "Security activity" }));
    const items = list.getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent("Signed in from a new device");
    expect(items[0]).toHaveTextContent("Safari on iPhone");
    expect(items[1]).toHaveTextContent("Password changed");
    expect(items[1]).not.toHaveTextContent("203.0.113");
    expect(items[2]).toHaveTextContent("Signed in · password");
    expect(items[2]).toHaveTextContent("203.0.113.x");
  });

  it("names the failed attempts, which are what an owner most needs to notice", async () => {
    stubApi({ [EVENTS]: respond([event({ type: "login_failed" })]) });
    renderWithQuery(<SecurityActivityCard />);

    expect(await screen.findByText("Failed sign-in attempt")).toBeInTheDocument();
    expect(screen.queryByText(/· password/)).not.toBeInTheDocument(); // арга нь зөвхөн амжилттай нэвтрэлтэд
  });

  it("says when there is nothing yet", async () => {
    stubApi({ [EVENTS]: respond([]) });
    renderWithQuery(<SecurityActivityCard />);

    expect(await screen.findByText("Nothing to show yet.")).toBeInTheDocument();
  });

  it("reports a failure", async () => {
    stubApi({ [EVENTS]: problem(500, "Boom") });
    renderWithQuery(<SecurityActivityCard />);

    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });
});

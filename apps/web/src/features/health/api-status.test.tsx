import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiStatus } from "./api-status";

function renderStatus() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ApiStatus />
    </QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("ApiStatus", () => {
  it("shows ready when the API reports ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ checks: { database: "ok" } })),
    );
    renderStatus();
    expect(await screen.findByText("API ready")).toBeInTheDocument();
  });

  it("shows unreachable when the request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );
    renderStatus();
    expect(await screen.findByText("API unreachable")).toBeInTheDocument();
  });
});

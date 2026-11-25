import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { beforeAll, describe, expect, it } from "vitest";
import { ThemeToggle } from "./theme-toggle";

beforeAll(() => {
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    onchange: null,
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
});

describe("ThemeToggle", () => {
  it("starts light, and toggles the dark class on <html>", async () => {
    window.localStorage.clear();
    document.documentElement.classList.remove("dark");
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    );
    const button = await screen.findByRole("button", { name: /toggle dark mode/i });
    await userEvent.click(button);
    expect(document.documentElement).toHaveClass("dark");
    await userEvent.click(button);
    expect(document.documentElement).not.toHaveClass("dark");
  });
});

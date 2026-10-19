import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider, useTheme } from "./theme-provider";

let systemDark = false;
let notifySystem: (() => void) | null = null;

beforeEach(() => {
  systemDark = false;
  notifySystem = null;
  localStorage.clear();
  document.documentElement.className = "";
  vi.stubGlobal("matchMedia", (query: string) => ({
    get matches() {
      return systemDark;
    },
    media: query,
    addEventListener: (_: string, listener: () => void) => (notifySystem = listener),
    removeEventListener: () => (notifySystem = null),
  }));
});
afterEach(() => vi.unstubAllGlobals());

function Probe() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  return (
    <>
      <p data-testid="state">{`${theme}/${resolvedTheme}`}</p>
      <button onClick={() => setTheme("dark")}>dark</button>
      <button onClick={() => setTheme("system")}>system</button>
    </>
  );
}
const state = () => screen.getByTestId("state").textContent;

describe("ThemeProvider", () => {
  it("follows the system until a theme is picked", () => {
    systemDark = true;
    render(<ThemeProvider><Probe /></ThemeProvider>);

    expect(state()).toBe("system/dark");
  });

  it("picks up a saved theme", () => {
    localStorage.setItem("theme", "dark");
    render(<ThemeProvider><Probe /></ThemeProvider>);

    expect(state()).toBe("dark/dark");
  });

  it("saves a pick, sets the class and colour scheme on <html>, and can go back to the system", async () => {
    render(<ThemeProvider><Probe /></ThemeProvider>);

    await userEvent.click(screen.getByRole("button", { name: "dark" }));
    expect(state()).toBe("dark/dark");
    expect(localStorage.getItem("theme")).toBe("dark");
    expect(document.documentElement).toHaveClass("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");

    await userEvent.click(screen.getByRole("button", { name: "system" }));
    expect(state()).toBe("system/light");
    expect(document.documentElement).not.toHaveClass("dark");
  });

  it("changes along with the system while on system", () => {
    render(<ThemeProvider><Probe /></ThemeProvider>);
    expect(state()).toBe("system/light");

    systemDark = true;
    act(() => notifySystem?.());

    expect(state()).toBe("system/dark");
    expect(document.documentElement).toHaveClass("dark");
  });

  it("refuses to be used outside a provider", () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow(/ThemeProvider/);
    quiet.mockRestore();
  });
});

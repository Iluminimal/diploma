import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ThemeScript } from "./theme-script";

describe("ThemeScript", () => {
  it("is an inline script that sets the theme before paint", () => {
    const { container } = render(<ThemeScript />);

    const script = container.querySelector("script")!;
    expect(script.textContent).toContain('classList.toggle("dark"');
    expect(script.hasAttribute("nonce")).toBe(false);
  });

  it("is light unless dark was chosen, and only asks the system when system was chosen", () => {
    const run = (stored: string | null, systemDark: boolean) => {
      localStorage.clear();
      if (stored) localStorage.setItem("theme", stored);
      vi.stubGlobal("matchMedia", () => ({ matches: systemDark }));
      document.documentElement.className = "";
      const { container } = render(<ThemeScript />);
      new Function(container.querySelector("script")!.textContent!)();
      vi.unstubAllGlobals();
      return document.documentElement.classList.contains("dark");
    };

    expect(run(null, true)).toBe(false);
    expect(run("light", true)).toBe(false);
    expect(run("dark", false)).toBe(true);
    expect(run("system", false)).toBe(false);
    expect(run("system", true)).toBe(true);
  });

  it("carries the request's CSP nonce when it is given one", () => {
    const { container } = render(<ThemeScript nonce="n0nce" />);

    expect(container.querySelector("script")?.getAttribute("nonce")).toBe("n0nce");
  });
});

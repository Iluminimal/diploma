import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => cleanup());

// jsdom lacks a few browser APIs that Radix UI components rely on.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub;
class IntersectionObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
globalThis.IntersectionObserver ??= IntersectionObserverStub as unknown as typeof IntersectionObserver;
window.HTMLElement.prototype.scrollIntoView ??= () => {};
// Tests run with reduced motion on, so counted-up totals and the like show their final value at
// once; a test of the animation itself stubs `matchMedia` its own way (see animated-number.test).
window.matchMedia ??= ((query: string) => ({
  matches: query.includes("prefers-reduced-motion: reduce"),
  media: query,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
  onchange: null,
})) as unknown as typeof window.matchMedia;
window.HTMLElement.prototype.hasPointerCapture ??= () => false;
window.HTMLElement.prototype.releasePointerCapture ??= () => {};

// Components use the App Router hooks, which throw outside a mounted router. Tests that care
// about navigation replace this with their own `vi.mock("next/navigation", ...)`.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

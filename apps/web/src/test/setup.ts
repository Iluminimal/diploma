import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => cleanup());

// jsdom-д Radix UI component-уудын шаарддаг цөөн browser API дутуу.
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
// Тестүүд reduced motion-той ажиллана, ингэснээр тоолж гарсан нийлбэр зэрэг нь шууд эцсийн утгаа
// харуулна; animation-ы тест `matchMedia`-г өөрийнхөөрөө stub хийнэ (animated-number.test-ийг үз).
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

// Component-ууд App Router hook ашигладаг бөгөөд холбогдсон router-гүйгээр шиддэг. Навигацид
// анхаардаг тестүүд үүнийг өөрийн `vi.mock("next/navigation", ...)`-оор орлуулна.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

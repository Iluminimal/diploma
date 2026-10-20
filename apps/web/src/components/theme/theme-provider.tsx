"use client";

import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from "react";

export type Theme = "light" | "dark" | "system";

/**
 * next-themes-ийн ашигладаг түлхүүртэй ижил, ингэснээр хэрэглэгчийн өмнө сонгосон theme
 * хадгалагдана.
 */
export const THEME_STORAGE_KEY = "theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";

const listeners = new Set<() => void>();

function readStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    return "system";
  }
}

function systemPrefersDark() {
  return typeof matchMedia === "function" && matchMedia(DARK_QUERY).matches;
}

/** Хуудас зурагдсан <html> дээрх class: inline script үүнийг анхны paint-аас өмнө тавьдаг. */
function applyToDocument() {
  const dark = readStoredTheme() === "dark" || (readStoredTheme() === "system" && systemPrefersDark());
  const root = document.documentElement;
  root.classList.toggle("dark", dark);
  root.style.colorScheme = dark ? "dark" : "light";
}

function subscribe(onChange: () => void) {
  const changed = () => {
    applyToDocument();
    onChange();
  };
  listeners.add(onChange);
  window.addEventListener("storage", changed);
  const media = typeof matchMedia === "function" ? matchMedia(DARK_QUERY) : null;
  media?.addEventListener("change", changed);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", changed);
    media?.removeEventListener("change", changed);
  };
}

function setTheme(theme: Theme) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Private горим: сонголт хуудсыг хаах хүртэл үргэлжилнэ.
  }
  applyToDocument();
  listeners.forEach((listener) => listener());
}

type ThemeContext = {
  /** Сонгосон нь: light, dark эсвэл system. */
  theme: Theme;
  /** Харагдаж буй нь: light эсвэл dark. */
  resolvedTheme: "light" | "dark";
  setTheme: (theme: Theme) => void;
};

const Context = createContext<ThemeContext | null>(null);

/**
 * Light, dark эсвэл системийнх, localStorage-д хадгалагдаж <html> дээр `dark` class-аар харагдана.
 * Анхны paint-ыг `ThemeScript` зохицуулах бөгөөд server үүнийг <head>-д тавьдаг: client
 * component-ээс render хийсэн script хэзээ ч ажиллахгүй (React анхааруулдаг), тиймээс next-themes
 * ашигладаггүй.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useSyncExternalStore(subscribe, readStoredTheme, () => "system" as const);
  const systemDark = useSyncExternalStore(subscribe, systemPrefersDark, () => false);
  const value = useMemo<ThemeContext>(
    () => ({
      theme,
      resolvedTheme: theme === "dark" || (theme === "system" && systemDark) ? "dark" : "light",
      setTheme,
    }),
    [theme, systemDark],
  );
  return <Context value={value}>{children}</Context>;
}

export function useTheme(): ThemeContext {
  const value = useContext(Context);
  if (!value) throw new Error("useTheme must be used inside <ThemeProvider>");
  return value;
}

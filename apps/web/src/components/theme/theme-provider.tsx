"use client";

import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from "react";

export type Theme = "light" | "dark" | "system";

/** Same key next-themes used, so a theme somebody already picked is kept. */
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

/** The class on <html> the page was painted with: the inline script sets it before first paint. */
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
    // Private mode: the choice lasts until the page is closed.
  }
  applyToDocument();
  listeners.forEach((listener) => listener());
}

type ThemeContext = {
  /** What was picked: light, dark or system. */
  theme: Theme;
  /** What is shown: light or dark. */
  resolvedTheme: "light" | "dark";
  setTheme: (theme: Theme) => void;
};

const Context = createContext<ThemeContext | null>(null);

/**
 * Light, dark or the system's, kept in localStorage and shown as a `dark` class on <html>. The
 * first paint is handled by `ThemeScript`, which the server puts in <head>: a script rendered from
 * a client component would never run (React warns about it), which is why this is not next-themes.
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

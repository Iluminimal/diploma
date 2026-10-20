"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/theme/theme-provider";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const next = resolvedTheme === "dark" ? "light" : "dark";

  // Хоёр icon үргэлж render хийгдэж CSS-ээр (`dark:` variant) солигдоно, label нь тогтмол: server
  // зочны theme-ийг мэдэхгүй тул `resolvedTheme`-ээс гарсан зүйл server ба client markup-д ялгаатай
  // болно (hydration mismatch).
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Toggle dark mode"
      onClick={() => setTheme(next)}
    >
      <Sun className="dark:hidden" />
      <Moon className="hidden dark:block" />
    </Button>
  );
}

"use client";

import { Menu } from "lucide-react";
import dynamic from "next/dynamic";
import { useState } from "react";
import { Button } from "@/components/ui/button";

// The menu (and the dialog library behind it) is fetched the first time it is opened.
const MobileNavMenu = dynamic(() => import("./mobile-nav-menu").then((m) => m.MobileNavMenu), { ssr: false });

export function MobileNav() {
  const [requested, setRequested] = useState(false);
  if (requested) return <MobileNavMenu defaultOpen />;
  return (
    <Button
      variant="ghost"
      size="icon"
      className="md:hidden"
      aria-label="Open menu"
      aria-haspopup="dialog"
      onClick={() => setRequested(true)}
    >
      <Menu />
    </Button>
  );
}

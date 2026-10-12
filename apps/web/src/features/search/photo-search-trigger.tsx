"use client";

import { Camera } from "lucide-react";
import dynamic from "next/dynamic";
import { useState } from "react";
import { Button } from "@/components/ui/button";

// The picker (and the dialog library behind it) is fetched the first time someone asks for it.
const PhotoSearchDialog = dynamic(() => import("./photo-search-dialog").then((m) => m.PhotoSearchDialog), {
  ssr: false,
});

/** A button that opens the photo picker, wherever a page wants one (the home page's hero). */
export function PhotoSearchTrigger({ className, label = "Search with a photo" }: { className?: string; label?: string }) {
  const [requested, setRequested] = useState(false);
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        size="xl"
        aria-haspopup="dialog"
        className={className}
        onClick={() => {
          setRequested(true);
          setOpen(true);
        }}
      >
        <Camera aria-hidden /> {label}
      </Button>
      {requested && <PhotoSearchDialog open={open} onOpenChange={setOpen} />}
    </>
  );
}

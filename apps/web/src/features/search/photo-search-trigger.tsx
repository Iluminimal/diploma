"use client";

import { Camera } from "lucide-react";
import dynamic from "next/dynamic";
import { useState } from "react";
import { Button } from "@/components/ui/button";

// Сонгогч (мөн ард нь байх dialog library) хүн хүсэх анхны удаа татагдана.
const PhotoSearchDialog = dynamic(() => import("./photo-search-dialog").then((m) => m.PhotoSearchDialog), {
  ssr: false,
});

/** Зураг сонгогчийг нээдэг товч, хуудас хаана хүсэх тэнд (нүүр хуудасны hero). */
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

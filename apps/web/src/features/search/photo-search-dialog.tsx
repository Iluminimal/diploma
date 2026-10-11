"use client";

import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ImageDropzone } from "./image-dropzone";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * The picker behind the camera button in the search bar. It reuses the whole photo pipeline
 * (upload, drop, paste, camera, HEIC); on success the photo waits in the search store and
 * /search runs the query. Loaded on first click: it brings the dialog library with it.
 */
export function PhotoSearchDialog({ open, onOpenChange }: Props) {
  const router = useRouter();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Search by photo</DialogTitle>
          <DialogDescription>Show us something you like and we&apos;ll find similar pieces.</DialogDescription>
        </DialogHeader>
        <ImageDropzone
          size="compact"
          listenForPaste={open}
          onPicked={() => {
            onOpenChange(false);
            router.push("/search");
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

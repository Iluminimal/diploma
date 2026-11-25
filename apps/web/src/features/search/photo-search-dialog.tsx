"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ImageDropzone } from "./image-dropzone";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * Хайлтын мөрийн камерын товчны ард байх сонгогч. Зураг авах бүх урсгалыг (upload, drop, paste,
 * камер, HEIC) дахин ашиглана; амжилттай бол зураг search store-д хүлээж, /search хайлтыг
 * ажиллуулна. Эхний товшилтоор ачаална: dialog library-г дагуулна.
 */
export function PhotoSearchDialog({ open, onOpenChange }: Props) {
  const t = useTranslations("search.dialog");
  const router = useRouter();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
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

import { useEffect } from "react";

let open = 0;

/**
 * Цэс, хайлт, Bag хуудас нээлттэй гэдгийг `isOpen` үнэн байх хугацаанд <html> дээрх attribute-оор
 * (`data-bar-panel`) хуудсанд мэдэгднэ. apple.com-ийн утасны bar шиг CSS нь хаадаг товчноос бусад
 * бүх зүйлийг бүдгэрүүлнэ (globals.css дахь `.phone-bar-item`-ыг үз). Flag биш тоолуур: нэг хуудас
 * нээгдэж, нөгөө хаагдахад үүнийг арилгах ёсгүй.
 */
export function useBarPanel(isOpen: boolean) {
  useEffect(() => {
    if (!isOpen) return;
    open += 1;
    document.documentElement.dataset.barPanel = "";
    return () => {
      open -= 1;
      if (open === 0) delete document.documentElement.dataset.barPanel;
    };
  }, [isOpen]);
}

import { useEffect } from "react";

/** Md-ээс дээш bar-ын доор нээгддэг хуудсууд: ангиллын цэс, хайлт, Bag. */
export type Flyout = "menu" | "search" | "bag";

const EVENT = "bar-flyout";

/**
 * `flyout` дөнгөж нээгдсэнийг мэдэгднэ. Нээлттэй байгаа бусад нь хаагдана
 * (`useCloseOnOtherFlyout`-ыг үз).
 */
export function announceFlyout(flyout: Flyout | null) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(EVENT, { detail: flyout }));
}

/**
 * apple.com шиг нэг удаад нэг flyout: хайлт нээхэд Bag хаагдаж, department дээр hover хийхэд хайлт
 * солигдоно гэх мэт. Flyout бүр өөрийн state-тэй бөгөөд өөрийн нэрээр үүнийг дууддаг.
 */
export function useCloseOnOtherFlyout(self: Flyout, close: () => void) {
  useEffect(() => {
    function onOther(event: Event) {
      if ((event as CustomEvent<Flyout | null>).detail !== self) close();
    }
    window.addEventListener(EVENT, onOther);
    return () => window.removeEventListener(EVENT, onOther);
  }, [self, close]);
}

"use client";

import { announceFlyout } from "./bar-flyout";

/**
 * apple.com-ийн curtain: bar-ын доор flyout нээлттэй байхад (`<html>` дээр `data-bar-panel` байвал
 * CSS үүнийг харуулна) хуудасны үлдсэн хэсэг бүрхэгдэж бүдгэрэх бөгөөд дарахад flyout хаагдана.
 * Header дотор биш: түүний backdrop blur нь `fixed` бүх зүйлийн containing block болчихно.
 */
export function BarCurtain() {
  return <div aria-hidden className="bar-curtain" onClick={() => announceFlyout(null)} />;
}

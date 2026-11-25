"use client";

import { useEffect } from "react";

/** Хамгийн их хазайлт (градус) ба магнит товчийг татах хамгийн их зай (px). */
const MAX_TILT = 6;
const MAGNET_RADIUS = 96;
const MAGNET_MAX = 7;

/**
 * Нэг delegated listener-ээр бүх карт ба товчийг "амьдруулна": `[data-tilt]` элемент курсорын
 * дагуу хазайж гялтганана (CSS хувьсагч `--rx --ry --gx --gy` тавигдана, зургийг `effects.css`
 * зурна), `[data-magnetic]` товч курсор ойртоход бага зэрэг татагдана (`--mx --my`). Карт бүр
 * client component болохгүй: ганц `pointermove` (passive, нэг frame-д нэг удаа). Зөвхөн жинхэнэ
 * заагчтай (`hover: hover`, `pointer: fine`) ба хөдөлгөөн хорьсонгүй үед л listener нэмэгдэнэ.
 * Хуудсанд юу ч render хийхгүй.
 */
export function CardTilt() {
  useEffect(() => {
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!fine.matches || calm.matches) return;

    let scheduled = false;
    let frame = 0;
    let last: { x: number; y: number; target: EventTarget | null } | null = null;
    let tilted: HTMLElement | null = null;

    const release = (element: HTMLElement) => {
      element.removeAttribute("data-tilting");
      for (const name of ["--rx", "--ry", "--gx", "--gy"]) element.style.removeProperty(name);
    };

    const update = () => {
      scheduled = false;
      if (!last) return;
      const { x, y, target } = last;

      const card = target instanceof Element ? (target.closest("[data-tilt]") as HTMLElement | null) : null;
      if (tilted && tilted !== card) {
        release(tilted);
        tilted = null;
      }
      if (card) {
        const box = card.getBoundingClientRect();
        const px = (x - box.left) / box.width;
        const py = (y - box.top) / box.height;
        card.setAttribute("data-tilting", "");
        card.style.setProperty("--rx", `${((px - 0.5) * 2 * MAX_TILT).toFixed(2)}deg`);
        card.style.setProperty("--ry", `${(-(py - 0.5) * 2 * MAX_TILT).toFixed(2)}deg`);
        card.style.setProperty("--gx", `${(px * 100).toFixed(1)}%`);
        card.style.setProperty("--gy", `${(py * 100).toFixed(1)}%`);
        tilted = card;
      }

      for (const magnet of document.querySelectorAll<HTMLElement>("[data-magnetic]")) {
        const box = magnet.getBoundingClientRect();
        const dx = x - (box.left + box.width / 2);
        const dy = y - (box.top + box.height / 2);
        const near = Math.hypot(dx, dy) < MAGNET_RADIUS + Math.max(box.width, box.height) / 2;
        const pull = (d: number) => Math.max(-MAGNET_MAX, Math.min(MAGNET_MAX, d * 0.18));
        magnet.style.setProperty("--mx", near ? `${pull(dx).toFixed(1)}px` : "0px");
        magnet.style.setProperty("--my", near ? `${pull(dy).toFixed(1)}px` : "0px");
      }
    };

    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      last = { x: event.clientX, y: event.clientY, target: event.target };
      if (!scheduled) {
        scheduled = true;
        frame = requestAnimationFrame(update);
      }
    };
    // Товшихад карт хазайлтаа тавьж, дарагдах (scale) animation-д зам тавина.
    const onDown = () => {
      if (tilted) {
        release(tilted);
        tilted = null;
      }
    };
    const onLeave = () => {
      last = null;
      if (tilted) release(tilted);
      tilted = null;
      for (const magnet of document.querySelectorAll<HTMLElement>("[data-magnetic]")) {
        magnet.style.setProperty("--mx", "0px");
        magnet.style.setProperty("--my", "0px");
      }
    };

    document.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerdown", onDown, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerdown", onDown);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      if (scheduled) cancelAnimationFrame(frame);
      if (tilted) release(tilted);
    };
  }, []);

  return null;
}

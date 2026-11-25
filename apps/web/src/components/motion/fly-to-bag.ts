/**
 * Сагсанд нэмэх үед барааны зураг bag товч руу нисэж жижгэрнэ. Web Animations API (`transform`,
 * `opacity`: compositor), нэг түр `<img>` хуулбар, дуусмагц устна. Bag товч (`[data-cart-target]`),
 * эх зураг, animation байхгүй, эсвэл хөдөлгөөн хорьсон үед юу ч хийхгүй: үйлдэл өөрөө
 * (сагсанд нэмэгдэх) хэзээ ч үүнээс хамаарахгүй.
 */
export function flyToBag(source: Element | null | undefined): void {
  if (typeof window === "undefined" || !(source instanceof HTMLImageElement)) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const target = document.querySelector<HTMLElement>("[data-cart-target]");
  if (!target) return;

  const from = source.getBoundingClientRect();
  const to = target.getBoundingClientRect();
  if (from.width === 0 || from.height === 0 || to.width === 0) return;

  const ghost = document.createElement("img");
  ghost.src = source.currentSrc || source.src;
  ghost.alt = "";
  ghost.setAttribute("aria-hidden", "true");
  Object.assign(ghost.style, {
    position: "fixed",
    left: `${from.left}px`,
    top: `${from.top}px`,
    width: `${from.width}px`,
    height: `${from.height}px`,
    objectFit: "cover",
    borderRadius: "1rem",
    zIndex: "70",
    pointerEvents: "none",
    willChange: "transform, opacity",
    boxShadow: "0 16px 36px rgb(0 0 0 / 0.28)",
  });
  document.body.append(ghost);
  if (typeof ghost.animate !== "function") {
    ghost.remove();
    return;
  }

  const dx = to.left + to.width / 2 - (from.left + from.width / 2);
  const dy = to.top + to.height / 2 - (from.top + from.height / 2);
  const end = 28 / Math.max(from.width, from.height);
  const animation = ghost.animate(
    [
      { transform: "translate(0, 0) scale(1)", opacity: 1 },
      { transform: `translate(${dx * 0.55}px, ${dy * 0.3 - 36}px) scale(${(1 + end) / 2.4})`, opacity: 1, offset: 0.55 },
      { transform: `translate(${dx}px, ${dy}px) scale(${end})`, opacity: 0.15 },
    ],
    { duration: 650, easing: "cubic-bezier(0.45, 0, 0.2, 1)" },
  );
  const done = () => ghost.remove();
  animation.onfinish = done;
  animation.oncancel = done;
}

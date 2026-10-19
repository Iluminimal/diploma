const CART_BUTTON = "[data-cart-button]";

function reducedMotion() {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

const inView = (rect: DOMRect) =>
  rect.width > 0 && rect.bottom > 0 && rect.top < window.innerHeight && rect.right > 0 && rect.left < window.innerWidth;

/** The cart icon gives a short bounce when something lands in it. */
function bounce(target: Element) {
  target.animate([{ scale: 1 }, { scale: 1.28 }, { scale: 0.94 }, { scale: 1 }], {
    duration: 520,
    easing: "cubic-bezier(0.16, 1, 0.3, 1)",
  });
}

/**
 * "Add to cart" made visible: a copy of the product photo shrinks and flies from where the shopper
 * is looking to the cart icon in the header, which bounces as it lands. Resolves when it has
 * landed (the Bag opens then). With reduced motion, or when there is nowhere to fly from or to,
 * it resolves at once. Web Animations, no library: this ships with the page.
 *
 * `source` is the photo the shopper added from; `fallback` (the button they pressed) is used when
 * the photo has scrolled out of sight, as it has on a phone's sticky bar.
 */
export async function flyToCart(source: Element | null, fallback: Element | null, image?: string): Promise<void> {
  const target = document.querySelector(CART_BUTTON);
  if (!target) return;
  if (reducedMotion()) return;
  const from = [source, fallback]
    .map((element) => element?.getBoundingClientRect())
    .find((rect): rect is DOMRect => Boolean(rect && inView(rect)));
  const to = target.getBoundingClientRect();
  if (!from || !inView(to)) return;

  const size = Math.min(from.width, from.height, 150);
  const clone = document.createElement(image ? "img" : "div");
  if (clone instanceof HTMLImageElement && image) {
    clone.src = image;
    clone.alt = "";
  }
  Object.assign(clone.style, {
    position: "fixed",
    zIndex: "80",
    left: `${from.left + from.width / 2 - size / 2}px`,
    top: `${from.top + from.height / 2 - size / 2}px`,
    width: `${size}px`,
    height: `${size * (image ? 1.33 : 1)}px`,
    objectFit: "cover",
    borderRadius: "1.25rem",
    background: "var(--secondary)",
    boxShadow: "0 12px 32px rgb(0 0 0 / 0.25)",
    pointerEvents: "none",
  });
  clone.setAttribute("aria-hidden", "true");
  document.body.append(clone);

  const dx = to.left + to.width / 2 - (from.left + from.width / 2);
  const dy = to.top + to.height / 2 - (from.top + from.height / 2);
  const flight = clone.animate(
    [
      { transform: "translate(0, 0) scale(1)", opacity: 1 },
      { transform: `translate(${dx * 0.55}px, ${dy * 0.35 - 40}px) scale(0.55)`, opacity: 1, offset: 0.55 },
      { transform: `translate(${dx}px, ${dy}px) scale(0.12)`, opacity: 0.4 },
    ],
    { duration: 650, easing: "cubic-bezier(0.5, 0, 0.2, 1)", fill: "forwards" },
  );
  try {
    await flight.finished;
  } catch {
    // cancelled (the page changed under it): nothing to land
  } finally {
    clone.remove();
  }
  bounce(target);
}

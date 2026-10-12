import Image from "next/image";
import "./story.css";
import Link from "next/link";
import { getSimilarProducts } from "@/features/catalog/api";
import { formatPrice, productPath, type Product } from "@/features/catalog/product";
import { newest } from "./home-data";

const STEPS = [
  { title: "Snap or upload", text: "Take a photo, drop a screenshot or paste one. Anything you saw and liked." },
  { title: "We look", text: "Our model reads the garment, its cut and its colour, and ignores the background." },
  { title: "Find it", text: "You get the closest pieces in the shop, best match first, ready to add to your cart." },
] as const;

/** A real photo and its real nearest neighbours, so the demo is the product itself. */
async function demo(): Promise<{ photo: Product; matches: Product[] } | null> {
  try {
    const [photo] = await newest({ category: "apparel", department: "men" }, 1);
    if (!photo) return null;
    const { results } = await getSimilarProducts(photo.id, 4);
    const matches = results.map((hit) => hit.product).slice(0, 4);
    return matches.length > 0 ? { photo, matches } : null;
  } catch {
    return null;
  }
}

/**
 * The pinned story. On a wide screen the stage stays on screen while the scroll position plays
 * the three steps (all in CSS, see `.story-*` in globals.css); everywhere else it reads as three
 * captions above the finished result.
 */
export async function HowItWorks() {
  const data = await demo();
  if (!data) return null;
  const { photo, matches } = data;
  const chips = [photo.article_type, photo.base_colour, photo.gender].filter((c): c is string => Boolean(c) && c !== "NA");
  return (
    <section aria-labelledby="how-heading" className="bg-secondary">
      <div className="story-track">
        <div className="story-stage container-page py-16 md:py-0">
          <header className="mb-10 max-w-2xl md:mb-8">
            <p className="text-brand mb-2 text-sm font-medium">How it works</p>
            <h2 id="how-heading" className="text-4xl leading-[1.02] font-semibold tracking-tighter text-balance md:text-6xl">
              From a photo to your cart in seconds.
            </h2>
          </header>
          <div className="grid items-center gap-10 md:grid-cols-[minmax(0,20rem)_1fr] md:gap-16">
            <figure className="story-photo bg-background relative mx-auto aspect-3/4 w-full max-w-xs overflow-hidden rounded-3xl shadow-[0_40px_80px_-40px_oklch(0_0_0/0.4)]">
              <Image
                src={photo.image.thumb_800}
                alt={`A ${photo.name} photo, the example search`}
                width={800}
                height={1067}
                sizes="320px"
                className="size-full object-cover"
              />
              <span
                aria-hidden
                className="story-scan from-transparent via-brand/45 pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b to-transparent"
              />
              <ul aria-label="What we detected" className="story-chips absolute bottom-3 left-3 flex flex-wrap gap-1.5">
                {chips.map((chip) => (
                  <li key={chip} className="bg-background/90 rounded-full px-2.5 py-1 text-xs font-medium backdrop-blur">
                    {chip}
                  </li>
                ))}
              </ul>
            </figure>
            <div>
              <ol className="story-captions space-y-5 md:space-y-0">
                {STEPS.map((step, i) => (
                  <li key={step.title} data-step={i + 1} className="story-caption">
                    <p className="text-muted-foreground mb-1 text-sm font-medium tabular-nums">Step {i + 1}</p>
                    <h3 className="text-2xl font-semibold tracking-tight md:text-3xl">{step.title}</h3>
                    <p className="text-muted-foreground mt-2 max-w-md text-base md:text-lg">{step.text}</p>
                  </li>
                ))}
              </ol>
              <ul aria-label="Matching products" className="mt-8 grid grid-cols-4 gap-3 md:mt-6">
                {matches.map((match, i) => (
                  <li key={match.id} className="story-result" style={{ "--i": i } as React.CSSProperties}>
                    <Link href={productPath(match)} className="group focus-visible:ring-ring/60 block rounded-2xl outline-none focus-visible:ring-3">
                      <div className="bg-background aspect-3/4 overflow-hidden rounded-2xl">
                        <Image
                          src={match.image.thumb_400}
                          alt=""
                          width={400}
                          height={533}
                          sizes="(min-width: 768px) 12vw, 22vw"
                          className="size-full object-cover transition-transform duration-500 ease-[var(--ease-out-expo)] group-hover:scale-105"
                        />
                      </div>
                      <p className="mt-2 truncate text-xs font-medium">{match.name}</p>
                      <p className="text-muted-foreground text-xs tabular-nums">{formatPrice(match.price_cents, match.currency)}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

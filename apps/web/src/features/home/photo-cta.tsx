import { Reveal } from "@/components/motion/reveal";
import { HeroUpload } from "./hero-upload";

/** The big dark band near the bottom: the whole idea of the shop, with the drop zone right there. */
export function PhotoCta() {
  return (
    <section aria-labelledby="cta-heading" className="container-page defer-render pb-12 md:pb-16">
      <div className="relative overflow-hidden rounded-[var(--radius-tile)] bg-black px-5 py-14 text-center text-white sm:px-10 md:rounded-[1.75rem] md:py-20">
        <div className="relative mx-auto max-w-2xl">
          <Reveal>
            <h2 id="cta-heading" className="type-display text-balance">
              Try it with your own photo.
            </h2>
            <p className="type-intro mx-auto mt-3 max-w-md text-white/70">
              Drop a screenshot, a snapshot, anything. It never leaves the search.
            </p>
          </Reveal>
          <Reveal delay={0.1} y={26} className="bg-background text-foreground mt-10 rounded-3xl p-2 text-left md:mt-12">
            <HeroUpload />
          </Reveal>
        </div>
      </div>
    </section>
  );
}

import { Reveal } from "@/components/motion/reveal";
import { HeroUpload } from "./hero-upload";

/** The big dark band near the bottom: the whole idea of the shop, with the drop zone right there. */
export function PhotoCta() {
  return (
    <section aria-labelledby="cta-heading" className="container-page defer-render pb-16 md:pb-24">
      <div className="relative overflow-hidden rounded-[2rem] bg-neutral-950 px-5 py-14 text-center text-white sm:px-10 md:py-24">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(55%_60%_at_50%_0%,oklch(0.52_0.17_268/0.5),transparent)]" />
        <div className="relative mx-auto max-w-2xl">
          <Reveal>
            <h2 id="cta-heading" className="text-4xl leading-[1.02] font-semibold tracking-tighter text-balance md:text-6xl">
              Try it with your own photo.
            </h2>
            <p className="mx-auto mt-4 max-w-md text-base text-white/70 md:text-lg">
              Drop a screenshot, a snapshot, anything. It never leaves the search.
            </p>
          </Reveal>
          <Reveal delay={0.1} y={26} className="bg-background text-foreground mt-10 rounded-3xl p-2 text-left">
            <HeroUpload />
          </Reveal>
        </div>
      </div>
    </section>
  );
}

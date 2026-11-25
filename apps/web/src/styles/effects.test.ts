import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(__dirname, "effects.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/**
 * `@media (...no-preference...) { ... }` блокуудыг хасч үлдсэнийг буцаана. Бусад `@media` (жишээ нь
 * `min-width`) ба `@supports`-ийн дотор давхар орсон блокийг мөн хайна.
 */
function withoutMotionGuardedBlocks(source: string): string {
  let out = "";
  let i = 0;
  while (i < source.length) {
    const start = source.indexOf("@media", i);
    if (start === -1) return out + source.slice(i);
    const open = source.indexOf("{", start);
    const query = source.slice(start, open);
    let depth = 1;
    let end = open + 1;
    while (depth > 0 && end < source.length) {
      depth += source[end] === "{" ? 1 : source[end] === "}" ? -1 : 0;
      end++;
    }
    out += source.slice(i, start);
    if (!query.includes("prefers-reduced-motion: no-preference")) {
      // Өөр нөхцөл: дотор нь хамгаалагдсан блок байж болох тул дотрыг нь мөн цэвэрлэнэ.
      out += `${source.slice(start, open + 1)}${withoutMotionGuardedBlocks(source.slice(open + 1, end - 1))}}`;
    }
    i = end;
  }
  return out;
}

describe("effects.css", () => {
  const unguarded = withoutMotionGuardedBlocks(css);

  it("starts no animation or transition outside a `prefers-reduced-motion: no-preference` block", () => {
    // Declaration (мөрийн эхэнд): `@supports (animation-timeline: ...)` нөхцөл биш.
    expect(unguarded).not.toMatch(/^\s*animation(-timeline|-range)?\s*:/m);
    expect(unguarded).not.toMatch(/^\s*transition\s*:/m);
  });

  it("only moves compositor properties: no layout, filter or blur animation", () => {
    const frames = [...css.matchAll(/@keyframes[^{]+\{([\s\S]*?)\n\}/g)].map((match) => match[1]!).join("\n");
    expect(frames).not.toMatch(/\b(width|height|top|left|right|bottom|margin|padding|filter|blur)\b\s*:/);
  });

  it("scopes scroll-driven effects to browsers that support them", () => {
    expect(css).toMatch(/@supports \(animation-timeline: view\(\)\)/);
    for (const selector of [".story-step-1", ".step-on", ".draw-line"]) {
      const at = css.indexOf(selector);
      expect(at, selector).toBeGreaterThan(css.indexOf("@supports (animation-timeline: view())"));
    }
  });

  it("only reacts to hover where a real pointer exists", () => {
    expect(css).toMatch(/@media \(hover: hover\) and \(pointer: fine\)/);
    expect(unguarded).not.toMatch(/:hover/);
  });

  it("never blurs the background glow, which would be repainted every frame", () => {
    expect(css).not.toMatch(/filter\s*:\s*blur/);
  });
});

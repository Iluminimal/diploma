import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { JsonLdScripts } from "./json-ld-scripts";
import { siteJsonLd } from "./site-json-ld";

describe("JsonLdScripts", () => {
  it("emits one script per node, each a single object with a string @context", () => {
    const nodes = siteJsonLd();
    const { container } = render(<JsonLdScripts nodes={nodes} />);
    const scripts = container.querySelectorAll('script[type="application/ld+json"]');
    expect(scripts).toHaveLength(nodes.length);
    for (const script of scripts) {
      const parsed = JSON.parse(script.textContent ?? "");
      expect(Array.isArray(parsed)).toBe(false);
      expect(typeof parsed["@context"]).toBe("string");
    }
  });
});

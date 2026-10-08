import { describe, expect, it } from "vitest";
import { serializeJsonLd } from "@/features/catalog/json-ld";
import { siteJsonLd } from "./site-json-ld";

type Node = {
  "@type": string;
  "@id": string;
  url: string;
  logo?: string;
  publisher?: { "@id": string };
  potentialAction?: { target: { urlTemplate: string }; "query-input": string };
};

describe("siteJsonLd", () => {
  const [organization, website] = siteJsonLd() as unknown as [Node, Node];

  it("describes the shop and its search box", () => {
    expect(organization?.["@type"]).toBe("Organization");
    expect(website?.["@type"]).toBe("WebSite");
    expect(website?.potentialAction?.target.urlTemplate).toBe("http://localhost:3000/products?q={search_term_string}");
    expect(website?.potentialAction?.["query-input"]).toBe("required name=search_term_string");
    expect(website?.publisher?.["@id"]).toBe(organization?.["@id"]);
  });

  it("uses absolute URLs only", () => {
    expect(organization?.url).toMatch(/^https?:\/\//);
    expect(organization?.logo).toMatch(/^https?:\/\//);
    expect(website?.url).toMatch(/^https?:\/\//);
  });

  it("serializes safely for a script tag", () => {
    const text = serializeJsonLd(siteJsonLd());

    expect(text).not.toContain("</");
    expect(JSON.parse(text)).toHaveLength(2);
  });
});

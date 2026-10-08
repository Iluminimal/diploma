import { SITE_NAME, absoluteUrl } from "@/lib/site";

/** schema.org Organization and WebSite (with a search box) for the home page. */
export function siteJsonLd() {
  return [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      "@id": absoluteUrl("/#organization"),
      name: SITE_NAME,
      url: absoluteUrl("/"),
      logo: absoluteUrl("/icon"),
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "@id": absoluteUrl("/#website"),
      name: SITE_NAME,
      url: absoluteUrl("/"),
      publisher: { "@id": absoluteUrl("/#organization") },
      potentialAction: {
        "@type": "SearchAction",
        target: { "@type": "EntryPoint", urlTemplate: absoluteUrl("/products?q={search_term_string}") },
        "query-input": "required name=search_term_string",
      },
    },
  ];
}

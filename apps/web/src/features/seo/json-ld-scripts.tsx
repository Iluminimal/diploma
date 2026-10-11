import { serializeJsonLd } from "@/features/catalog/json-ld";

/**
 * One `<script type="application/ld+json">` per node. A top-level array is valid JSON-LD, but many
 * consumers (crawlers, browser extensions) read `["@context"]` straight off the parsed script and
 * throw on an array.
 */
export function JsonLdScripts({ nodes }: { nodes: readonly object[] }) {
  return nodes.map((node, i) => (
    <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(node) }} />
  ));
}

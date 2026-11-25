import { serializeJsonLd } from "@/features/catalog/json-ld";

/**
 * Node бүрд нэг `<script type="application/ld+json">`. Дээд түвшний массив нь хүчинтэй JSON-LD
 * боловч олон consumer (crawler, browser extension) parse хийсэн script-ээс `["@context"]`-ийг шууд
 * уншдаг тул массивт алдаа гаргана.
 *
 * Nonce тавихгүй: `application/ld+json` нь ажиллуулагддаггүй data block тул CSP хамаарахгүй, харин
 * nonce attribute-ыг browser нуудаг тул hydration-д "server, client таарахгүй" гэж гомдолложээ.
 */
export function JsonLdScripts({ nodes }: { nodes: readonly object[] }) {
  return nodes.map((node, i) => (
    <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(node) }} />
  ));
}

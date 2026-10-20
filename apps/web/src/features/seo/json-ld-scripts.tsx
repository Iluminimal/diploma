import { serializeJsonLd } from "@/features/catalog/json-ld";

/**
 * Node бүрд нэг `<script type="application/ld+json">`. Дээд түвшний массив нь хүчинтэй JSON-LD
 * боловч олон consumer (crawler, browser extension) parse хийсэн script-ээс `["@context"]`-ийг шууд
 * уншдаг тул массивт алдаа гаргана.
 */
export function JsonLdScripts({ nodes }: { nodes: readonly object[] }) {
  return nodes.map((node, i) => (
    <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(node) }} />
  ));
}

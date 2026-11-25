import { describe, expect, it } from "vitest";
import en from "../../messages/en";
import mn from "../../messages/mn";

type Tree = { [key: string]: string | Tree };

function leaves(tree: Tree, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") out.set(path, value);
    else for (const [p, v] of leaves(value, path)) out.set(p, v);
  }
  return out;
}

/** ICU-ийн `{name}` argument ба `<tag>` rich-text tag-ууд: орчуулга бүгдийг нь хадгалах ёстой. */
// Plural/select-ийн салбарын бие (`=0 {Bag}`, `other {# items}`) нь argument биш: тэдний `{`-г эхлээд арилгана.
const BRANCH = /(=\d+|\b(?:zero|one|two|few|many|other))\s*\{/g;
const placeholders = (message: string) =>
  [
    ...new Set(
      [...message.replace(BRANCH, "$1 (").matchAll(/\{(\w+)|<(\w+)>/g)].map((m) => m[1] ?? `<${m[2]}>`),
    ),
  ].sort();

const english = leaves(en as Tree);
const mongolian = leaves(mn as Tree);

describe("messages", () => {
  it("has the same keys in every language", () => {
    expect([...mongolian.keys()].sort()).toEqual([...english.keys()].sort());
  });

  it("has no empty translations", () => {
    for (const [key, value] of mongolian) expect(value.trim(), key).not.toBe("");
  });

  it("keeps ICU arguments and tags identical to English", () => {
    for (const [key, value] of english) {
      expect(placeholders(mongolian.get(key) ?? ""), key).toEqual(placeholders(value));
    }
  });
});

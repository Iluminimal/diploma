import { describe, expect, it } from "vitest";
import mn from "../../messages/mn";

type Tree = { [key: string]: string | Tree };

function leaves(tree: Tree, prefix = ""): [string, string][] {
  return Object.entries(tree).flatMap(([key, value]) =>
    typeof value === "string" ? [[`${prefix}${key}`, value] as [string, string]] : leaves(value, `${prefix}${key}.`),
  );
}

const ALL = leaves(mn as unknown as Tree);

/**
 * Нэр томьёоны толь (`docs/glossary-mn.md`): нэг ойлголтыг нэг үгээр. Хуучин, зөрсөн хэлбэрүүд
 * буцаж ирэхээс сэргийлнэ.
 */
const FORBIDDEN: [RegExp, string][] = [
  [/Хүслийн жагсаалт/, "wishlist = «Хадгалсан бараа»"],
  [/[Хх]арагдацаар/, "visual search = «Зургаар хайх»"],
  [/Мөнгө буцаасан|Мөнгийг автоматаар/, "refunded = «Буцаагдсан» / «Төлбөр буцаагдсан»"],
  [/Нөөц хүрэлцэхгүй/, "тоо хэмжээ = «үлдэгдэл»"],
  [/Хяналтын дугаар/, "tracking number = «Илгээмжийн дугаар»"],
  [/Хүргэх хаяг/, "delivery address = «Хүргэлтийн хаяг»"],
  [/Хэрэглээ/, "usage / occasion = «Зориулалт»"],
  [/Дараах/, "next page = «Дараагийн»"],
];

/** ICU аргумент (`{name}`, plural/select салбар) ба `<b>` tag-уудыг хасаад үлдэх латин үгс. */
function latinWords(message: string): string[] {
  let text = message.replace(/<\/?\w+>/g, " ");
  for (let i = 0; i < 6; i++) text = text.replace(/\{[^{}]*\}/g, " ");
  return text.match(/[A-Za-z]+(?:['’][A-Za-z]+)*/g) ?? [];
}

/** Монгол текстэд үлдэж болох латин үгс: брэнд, стандарт, нэгж. Бусад нь орчуулагдаагүй гэсэн үг. */
const LATIN_OK = new Set([
  "Angel", "Google", "QPay", "CVC", "JPEG", "PNG", "WebP", "HEIC", "iPhone", "USD", "MNT", "MB", "API",
  "Exchange", "Rate", "Ctrl", "SMS", "QR", "V", "s", "CSV",
]);

describe("Монгол орчуулгын нэр томьёо", () => {
  it.each(FORBIDDEN)("%s байхгүй", (pattern, why) => {
    const hits = ALL.filter(([, value]) => pattern.test(value)).map(([key]) => key);
    expect(hits, why).toEqual([]);
  });

  it("англи үг орчуулагдалгүй үлдээгүй (брэнд, стандартаас бусад)", () => {
    const stray = ALL.flatMap(([key, value]) =>
      latinWords(value).filter((word) => !LATIN_OK.has(word)).map((word) => `${key}: ${word}`),
    );
    expect(stray).toEqual([]);
  });
});

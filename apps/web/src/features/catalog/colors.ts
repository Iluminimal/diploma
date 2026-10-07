/** Swatch colours for the dataset's `base_colour` values. Unknown names fall back to a neutral grey. */
const SWATCHES: Record<string, string> = {
  Beige: "#e0cda9",
  Black: "#111111",
  Blue: "#2563eb",
  Bronze: "#a97142",
  Brown: "#7b4a2a",
  Burgundy: "#6d1a2c",
  Charcoal: "#36454f",
  "Coffee Brown": "#5c4033",
  Copper: "#b87333",
  Cream: "#f5ecd0",
  "Fluorescent Green": "#4dff4d",
  Gold: "#d4af37",
  Green: "#16a34a",
  Grey: "#9ca3af",
  "Grey Melange": "#b8bcc2",
  Khaki: "#b5a76a",
  Lavender: "#b9a7e0",
  "Lime Green": "#a3e635",
  Magenta: "#d6249f",
  Maroon: "#7a1f2b",
  Mauve: "#b08ba5",
  Metallic: "linear-gradient(135deg,#d9d9d9,#8c8c8c 50%,#e6e6e6)",
  Multi: "conic-gradient(#ef4444,#f59e0b,#22c55e,#3b82f6,#a855f7,#ef4444)",
  "Mushroom Brown": "#9a8478",
  Mustard: "#d4a017",
  "Navy Blue": "#1e2a5a",
  Nude: "#e3b9a0",
  "Off White": "#f4f1ea",
  Olive: "#708238",
  Orange: "#f97316",
  Peach: "#ffcba4",
  Pink: "#f472b6",
  Purple: "#7e22ce",
  Red: "#dc2626",
  Rose: "#e11d6a",
  Rust: "#b7410e",
  "Sea Green": "#2e8b57",
  Silver: "#c0c0c0",
  Skin: "#f1c9a5",
  Steel: "#71797e",
  Tan: "#c9a27a",
  Taupe: "#8b7d70",
  Teal: "#0d9488",
  "Turquoise Blue": "#40c4c8",
  White: "#ffffff",
  Yellow: "#facc15",
};

export function swatchFor(color: string): string {
  return SWATCHES[color] ?? "#cbd5e1";
}

/** True when a white check mark would be hard to see on this swatch (light solid colours). */
export function isLightSwatch(color: string): boolean {
  const value = swatchFor(color);
  const m = /^#([0-9a-f]{6})$/i.exec(value);
  if (!m) return false;
  const n = parseInt(m[1]!, 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  // Perceived brightness (ITU-R BT.601).
  return (r * 299 + g * 587 + b * 114) / 1000 > 160;
}

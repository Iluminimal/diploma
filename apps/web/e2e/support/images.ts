import { deflateSync } from "node:zlib";

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), body.length + 4);
  return out;
}

/** Өнгөт блокуудтай зөв PNG, `seed`-ээс хамаарна: өөр seed загварт өөр харагдана. */
export function makePng(seed: number, width = 240, height = 320): Buffer {
  // 32 битийн арифметик тасралтгүй: энгийн үржвэр double-ийн бүхэл тооны мужаас халж, зэргэлдээ
  // seed-ээс ижил зураг гаргана.
  let state = (Math.imul(seed + 1, 2654435761) + 1) >>> 0;
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state >>> 8; // энэ generator-ын доод битүүд хамгийн бага санамсаргүй
  };
  const block = 24;
  const cols = Math.ceil(width / block);
  const palette = Array.from({ length: cols * Math.ceil(height / block) }, () => [next() & 255, next() & 255, next() & 255]);
  const rows: Buffer[] = [];
  for (let y = 0; y < height; y += 1) {
    const row = Buffer.alloc(1 + width * 3); // filter byte 0 + RGB
    for (let x = 0; x < width; x += 1) {
      const colour = palette[Math.floor(y / block) * cols + Math.floor(x / block)]!;
      row[1 + x * 3] = colour[0]!;
      row[2 + x * 3] = colour[1]!;
      row[3 + x * 3] = colour[2]!;
    }
    rows.push(row);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.concat(rows))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

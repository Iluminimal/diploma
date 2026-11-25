export type Point = readonly [number, number];

/**
 * Цэгүүдийг дайрсан monotone (Fritsch-Carlson) муруй: энгийн spline шиг тэг өдрүүдийн хоорондох
 * хотгор "0"-ээс доош унаж хуурамч сөрөг орлого зурахгүй.
 */
export function monotonePath(points: readonly Point[]): string {
  const n = points.length;
  if (n === 0) return "";
  if (n === 1) return `M${points[0]![0]} ${points[0]![1]}`;
  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = points[i]!;
    const [x1, y1] = points[i + 1]!;
    dx.push(x1 - x0);
    slope.push((y1 - y0) / (x1 - x0 || 1));
  }
  const tangent: number[] = [slope[0]!];
  for (let i = 1; i < n - 1; i++) {
    const a = slope[i - 1]!;
    const b = slope[i]!;
    tangent.push(a * b <= 0 ? 0 : (a + b) / 2);
  }
  tangent.push(slope[n - 2]!);
  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) {
      tangent[i] = 0;
      tangent[i + 1] = 0;
      continue;
    }
    const a = tangent[i]! / slope[i]!;
    const b = tangent[i + 1]! / slope[i]!;
    const h = Math.hypot(a, b);
    if (h > 3) {
      tangent[i] = (3 * a * slope[i]!) / h;
      tangent[i + 1] = (3 * b * slope[i]!) / h;
    }
  }
  const round = (v: number) => Number(v.toFixed(2));
  let path = `M${points[0]![0]} ${points[0]![1]}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = points[i]!;
    const [x1, y1] = points[i + 1]!;
    const h = dx[i]! / 3;
    path += ` C${round(x0 + h)} ${round(y0 + tangent[i]! * h)}, ${round(x1 - h)} ${round(y1 - tangent[i + 1]! * h)}, ${x1} ${y1}`;
  }
  return path;
}

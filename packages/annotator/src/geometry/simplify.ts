type Sample = readonly number[];

/** Distance of `p` from the line through `a` and `b` (the segment's length when it is a point). */
function perpendicular(p: Sample, a: Sample, b: Sample): number {
  const ax = a[0] as number;
  const ay = a[1] as number;
  const dx = (b[0] as number) - ax;
  const dy = (b[1] as number) - ay;
  const len = Math.hypot(dx, dy);
  if (len === 0) return Math.hypot((p[0] as number) - ax, (p[1] as number) - ay);
  return Math.abs(dy * ((p[0] as number) - ax) - dx * ((p[1] as number) - ay)) / len;
}

/**
 * Ramer–Douglas–Peucker simplification. Works on `[x, y, …extra]` samples and keeps them whole,
 * so pressure survives. Iterative: a 20 000-point stroke must not overflow the call stack.
 */
export function simplify<T extends Sample>(points: readonly T[], epsilon: number): T[] {
  if (points.length <= 2) return [...points];
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [first, last] = stack.pop() as [number, number];
    let farthest = -1;
    let max = epsilon;
    const a = points[first] as T;
    const b = points[last] as T;
    for (let i = first + 1; i < last; i++) {
      const d = perpendicular(points[i] as T, a, b);
      if (d > max) {
        max = d;
        farthest = i;
      }
    }
    if (farthest !== -1) {
      keep[farthest] = 1;
      stack.push([first, farthest], [farthest, last]);
    }
  }
  return points.filter((_, i) => keep[i] === 1);
}

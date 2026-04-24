import type { RawImage, RGBA } from '../image';

/**
 * Iterative 4-connected flood fill. Matches the seed pixel's exact RGBA
 * tuple and recolors every reachable pixel with `color` blended at
 * `opacity`. A `Uint8Array` visited buffer keeps memory bounded and
 * avoids stack overflow on large canvases (recursive impl blows the
 * default JS call stack at ~10–20 KB).
 *
 * If the seed is out of bounds or the seed color already equals the
 * fill color (after opacity), the call is a no-op so the user never
 * pays for a redundant pass.
 */
export function floodFill(
  dst: RawImage,
  seedX: number,
  seedY: number,
  color: RGBA,
  opacity: number,
): void {
  const { width: w, height: h } = dst;
  if (seedX < 0 || seedY < 0 || seedX >= w || seedY >= h) return;

  const seedIdx = (seedY * w + seedX) * 4;
  const tr = dst.data[seedIdx]!;
  const tg = dst.data[seedIdx + 1]!;
  const tb = dst.data[seedIdx + 2]!;
  const ta = dst.data[seedIdx + 3]!;

  // Compute the actual pixel value the fill would write at the seed,
  // then early-out if equal — both for the trivial "filling with the same
  // color" case and to avoid an infinite no-op pass.
  const sa = Math.max(0, Math.min(255, Math.round(color.a * clamp01(opacity))));
  if (sa === 0) return;
  const writeSample = composite(tr, tg, tb, ta, color.r, color.g, color.b, sa);
  if (
    writeSample[0] === tr &&
    writeSample[1] === tg &&
    writeSample[2] === tb &&
    writeSample[3] === ta
  ) {
    return;
  }

  const visited = new Uint8Array(w * h);
  const queue: number[] = [seedY * w + seedX];
  visited[seedY * w + seedX] = 1;
  while (queue.length > 0) {
    const idx = queue.pop()!;
    const x = idx % w;
    const y = (idx - x) / w;
    const px = idx * 4;
    if (
      dst.data[px] !== tr ||
      dst.data[px + 1] !== tg ||
      dst.data[px + 2] !== tb ||
      dst.data[px + 3] !== ta
    ) {
      continue;
    }
    const out = composite(
      dst.data[px]!,
      dst.data[px + 1]!,
      dst.data[px + 2]!,
      dst.data[px + 3]!,
      color.r,
      color.g,
      color.b,
      sa,
    );
    dst.data[px] = out[0];
    dst.data[px + 1] = out[1];
    dst.data[px + 2] = out[2];
    dst.data[px + 3] = out[3];

    // 4-connected neighbors.
    if (x + 1 < w && !visited[idx + 1]) {
      visited[idx + 1] = 1;
      queue.push(idx + 1);
    }
    if (x - 1 >= 0 && !visited[idx - 1]) {
      visited[idx - 1] = 1;
      queue.push(idx - 1);
    }
    if (y + 1 < h && !visited[idx + w]) {
      visited[idx + w] = 1;
      queue.push(idx + w);
    }
    if (y - 1 >= 0 && !visited[idx - w]) {
      visited[idx - w] = 1;
      queue.push(idx - w);
    }
  }
}

function composite(
  dr: number,
  dg: number,
  db: number,
  da: number,
  sr: number,
  sg: number,
  sb: number,
  sa: number,
): [number, number, number, number] {
  const sA = sa / 255;
  const dA = da / 255;
  const outA = sA + dA * (1 - sA);
  if (outA <= 0) return [0, 0, 0, 0];
  const outR = (sr * sA + dr * dA * (1 - sA)) / outA;
  const outG = (sg * sA + dg * dA * (1 - sA)) / outA;
  const outB = (sb * sA + db * dA * (1 - sA)) / outA;
  return [
    clamp255(Math.round(outR)),
    clamp255(Math.round(outG)),
    clamp255(Math.round(outB)),
    clamp255(Math.round(outA * 255)),
  ];
}

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}
function clamp255(n: number): number {
  return n < 0 ? 0 : n > 255 ? 255 : n;
}

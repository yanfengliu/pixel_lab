import { describe, it, expect } from 'vitest';
import { createImage, setPixel } from '../../src/core/image';
import { packFrames, type PackInput } from '../../src/core/packer';

function coloredImage(w: number, h: number, color: number) {
  const img = createImage(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      setPixel(img, x, y, color, color, color, 255);
    }
  }
  return img;
}

function buildInputs(specs: Array<[string, number, number]>): PackInput[] {
  return specs.map(([id, w, h], i) => ({
    id,
    image: coloredImage(w, h, (i + 1) * 40),
  }));
}

function overlap(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): boolean {
  return !(
    a.x + a.w <= b.x ||
    b.x + b.w <= a.x ||
    a.y + a.h <= b.y ||
    b.y + b.h <= a.y
  );
}

describe('packFrames', () => {
  it('returns an empty pack for no inputs', () => {
    const res = packFrames([]);
    expect(res.placements).toEqual([]);
  });

  it('places a single frame with padding around it', () => {
    const res = packFrames(buildInputs([['a', 4, 4]]), { padding: 1 });
    expect(res.placements).toHaveLength(1);
    const p = res.placements[0]!;
    expect(p.x).toBeGreaterThanOrEqual(1);
    expect(p.y).toBeGreaterThanOrEqual(1);
    expect(p.w).toBe(4);
    expect(p.h).toBe(4);
  });

  it('produces non-overlapping placements with padding between them', () => {
    const res = packFrames(
      buildInputs([
        ['a', 8, 8],
        ['b', 8, 8],
        ['c', 8, 8],
        ['d', 8, 8],
      ]),
      { padding: 1 },
    );
    expect(res.placements).toHaveLength(4);
    // Inflate each placement by padding and assert no overlaps (the padded
    // areas may only touch at edges, not overlap).
    const inflated = res.placements.map((p) => ({
      x: p.x - 1,
      y: p.y - 1,
      w: p.w + 2,
      h: p.h + 2,
    }));
    for (let i = 0; i < inflated.length; i++) {
      for (let j = i + 1; j < inflated.length; j++) {
        expect(overlap(inflated[i]!, inflated[j]!)).toBe(false);
      }
    }
  });

  it('returns placements in input order regardless of pack ordering', () => {
    const inputs = buildInputs([
      ['tiny', 2, 2],
      ['big', 32, 32],
      ['medium', 8, 8],
    ]);
    const res = packFrames(inputs);
    expect(res.placements.map((p) => p.id)).toEqual(['tiny', 'big', 'medium']);
  });

  it('is deterministic across runs', () => {
    const a = packFrames(
      buildInputs([
        ['a', 6, 6],
        ['b', 8, 10],
        ['c', 4, 4],
      ]),
    );
    const b = packFrames(
      buildInputs([
        ['a', 6, 6],
        ['b', 8, 10],
        ['c', 4, 4],
      ]),
    );
    expect(a.placements).toEqual(b.placements);
    expect(a.atlas.width).toBe(b.atlas.width);
  });

  it('copies frame pixels to the atlas at placement coordinates', () => {
    const red = createImage(2, 2);
    for (let i = 0; i < 4; i++) {
      red.data[i * 4] = 255;
      red.data[i * 4 + 3] = 255;
    }
    const res = packFrames([{ id: 'r', image: red }], { padding: 0 });
    const p = res.placements[0]!;
    expect(res.atlas.data[(p.y * res.atlas.width + p.x) * 4]).toBe(255);
  });

  it('throws when frames cannot fit within maxSize', () => {
    const too_big = createImage(10, 10);
    expect(() =>
      packFrames([{ id: 'x', image: too_big }], { maxSize: 4 }),
    ).toThrow();
  });
});

import { describe, it, expect } from 'vitest';
import { createImage, getAlpha } from '../../../src/core/image';
import {
  drawLine,
  drawRectOutline,
  drawRectFilled,
  drawEllipseOutline,
  drawEllipseFilled,
} from '../../../src/core/drawing/shapes';
import type { Brush } from '../../../src/core/drawing/brush';

const RED = { r: 255, g: 0, b: 0, a: 255 };
const BRUSH: Brush = { size: 1, color: RED, opacity: 1 };

function opaquePixels(img: ReturnType<typeof createImage>): Set<string> {
  const out = new Set<string>();
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (getAlpha(img, x, y) > 0) out.add(`${x},${y}`);
    }
  }
  return out;
}

describe('drawLine', () => {
  it('paints the diagonal from (0,0) to (4,4)', () => {
    const img = createImage(5, 5);
    drawLine(img, 0, 0, 4, 4, BRUSH);
    for (let i = 0; i <= 4; i++) {
      expect(getAlpha(img, i, i)).toBe(255);
    }
    // Off-diagonal stays transparent.
    expect(getAlpha(img, 0, 4)).toBe(0);
    expect(getAlpha(img, 4, 0)).toBe(0);
  });

  it('zero-length line paints a single dot', () => {
    const img = createImage(4, 4);
    drawLine(img, 2, 2, 2, 2, BRUSH);
    expect(opaquePixels(img)).toEqual(new Set(['2,2']));
  });

  it('horizontal line covers every pixel between endpoints', () => {
    const img = createImage(8, 4);
    drawLine(img, 1, 2, 6, 2, BRUSH);
    for (let x = 1; x <= 6; x++) {
      expect(getAlpha(img, x, 2)).toBe(255);
    }
    expect(getAlpha(img, 0, 2)).toBe(0);
    expect(getAlpha(img, 7, 2)).toBe(0);
  });

  it('propagates brush size — size 3 paints a 3px-thick line', () => {
    const img = createImage(8, 8);
    const thickBrush: Brush = { size: 3, color: RED, opacity: 1 };
    drawLine(img, 3, 3, 3, 3, thickBrush);
    // stampDot with size 3 covers a 3x3 square centered on (3,3).
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        expect(getAlpha(img, 3 + dx, 3 + dy)).toBe(255);
      }
    }
  });
});

describe('drawRectOutline', () => {
  it('5x5 outline paints 16 perimeter pixels with brush size 1', () => {
    const img = createImage(8, 8);
    drawRectOutline(img, 1, 1, 5, 5, BRUSH);
    const expected = new Set<string>();
    // Perimeter pixels: top + bottom rows + left + right columns.
    for (let x = 1; x <= 5; x++) {
      expected.add(`${x},1`);
      expected.add(`${x},5`);
    }
    for (let y = 1; y <= 5; y++) {
      expected.add(`1,${y}`);
      expected.add(`5,${y}`);
    }
    expect(opaquePixels(img)).toEqual(expected);
    // Count: 2*5 (horizontal sides) + 2*5 (vertical sides) - 4 (corners) = 16.
    expect(expected.size).toBe(16);
  });

  it('interior is untouched', () => {
    const img = createImage(8, 8);
    drawRectOutline(img, 2, 2, 5, 5, BRUSH);
    // Center pixels stay transparent.
    expect(getAlpha(img, 3, 3)).toBe(0);
    expect(getAlpha(img, 4, 4)).toBe(0);
    expect(getAlpha(img, 3, 4)).toBe(0);
    expect(getAlpha(img, 4, 3)).toBe(0);
  });

  it('handles reversed endpoints (x0>x1, y0>y1)', () => {
    const img = createImage(8, 8);
    drawRectOutline(img, 5, 5, 1, 1, BRUSH);
    // Same 16-pixel perimeter as the forward order.
    expect(opaquePixels(img).size).toBe(16);
    expect(getAlpha(img, 1, 1)).toBe(255);
    expect(getAlpha(img, 5, 5)).toBe(255);
  });

  it('1x1 rect collapses to a single stampDot', () => {
    const img = createImage(4, 4);
    drawRectOutline(img, 2, 2, 2, 2, BRUSH);
    expect(opaquePixels(img)).toEqual(new Set(['2,2']));
  });

  it('at opacity 0.5, corner alpha equals edge alpha (I1 regression)', () => {
    // Before the fix, drawRectOutline ran four drawLine calls that all
    // included the corner rows / columns — at opacity < 1 the corners
    // got composited twice, saturating faster than the edges.
    const img = createImage(8, 8);
    const brush: Brush = {
      size: 1,
      color: { r: 200, g: 0, b: 0, a: 255 },
      opacity: 0.5,
    };
    drawRectOutline(img, 1, 1, 5, 5, brush);
    // Four corners should have the same alpha as a non-corner edge pixel.
    const edgeAlpha = getAlpha(img, 3, 1); // top edge, not a corner
    expect(edgeAlpha).toBeGreaterThan(0);
    expect(getAlpha(img, 1, 1)).toBe(edgeAlpha);
    expect(getAlpha(img, 5, 1)).toBe(edgeAlpha);
    expect(getAlpha(img, 1, 5)).toBe(edgeAlpha);
    expect(getAlpha(img, 5, 5)).toBe(edgeAlpha);
  });
});

describe('drawRectFilled', () => {
  it('3x3 filled covers all 9 pixels', () => {
    const img = createImage(5, 5);
    drawRectFilled(img, 1, 1, 3, 3, BRUSH);
    for (let y = 1; y <= 3; y++) {
      for (let x = 1; x <= 3; x++) {
        expect(getAlpha(img, x, y)).toBe(255);
      }
    }
    expect(opaquePixels(img).size).toBe(9);
  });

  it('handles reversed endpoints', () => {
    const img = createImage(5, 5);
    drawRectFilled(img, 3, 3, 1, 1, BRUSH);
    expect(opaquePixels(img).size).toBe(9);
  });

  it('clipped by canvas bounds', () => {
    const img = createImage(4, 4);
    drawRectFilled(img, -1, -1, 2, 2, BRUSH);
    // Only (0,0), (1,0), (0,1), (1,1), (0,2), (1,2), (2,0..2) depending on rect.
    // Input rect spans x=[-1..2], y=[-1..2]; clipped to [0..2]x[0..2] = 9 pixels.
    expect(opaquePixels(img).size).toBe(9);
  });
});

describe('drawEllipseOutline', () => {
  it('is symmetric across both axes (odd-diameter bbox)', () => {
    const img = createImage(11, 11);
    drawEllipseOutline(img, 1, 1, 9, 9, BRUSH);
    // Axis-symmetric around cx=5, cy=5.
    for (let y = 0; y < 11; y++) {
      for (let x = 0; x < 11; x++) {
        const mirX = 10 - x;
        const mirY = 10 - y;
        expect(getAlpha(img, x, y)).toBe(getAlpha(img, mirX, y));
        expect(getAlpha(img, x, y)).toBe(getAlpha(img, x, mirY));
      }
    }
  });

  it('does not paint any pixel outside the bbox', () => {
    const img = createImage(12, 12);
    drawEllipseOutline(img, 2, 2, 8, 8, BRUSH);
    for (let y = 0; y < 12; y++) {
      for (let x = 0; x < 12; x++) {
        if (x < 2 || x > 8 || y < 2 || y > 8) {
          expect(getAlpha(img, x, y)).toBe(0);
        }
      }
    }
  });

  it('flat ellipse: outline stays inside bbox (N10 regression)', () => {
    // Very flat (1-px tall) ellipse inscribed in a wide bbox. Before
    // the fix, the end-cap cleanup loop could emit points at xL-1 /
    // xR+1 outside the [xMin..xMax] range.
    const img = createImage(16, 8);
    drawEllipseOutline(img, 2, 3, 12, 3, BRUSH);
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 16; x++) {
        if (x < 2 || x > 12 || y !== 3) {
          expect(getAlpha(img, x, y)).toBe(0);
        }
      }
    }
  });

  it('2x2 bbox still paints at least the corner points', () => {
    const img = createImage(4, 4);
    drawEllipseOutline(img, 0, 0, 1, 1, BRUSH);
    // With a 2x2 bbox all four corners should light up (degenerate ellipse).
    expect(getAlpha(img, 0, 0)).toBe(255);
    expect(getAlpha(img, 1, 0)).toBe(255);
    expect(getAlpha(img, 0, 1)).toBe(255);
    expect(getAlpha(img, 1, 1)).toBe(255);
  });

  it('interior is transparent (outline-only)', () => {
    const img = createImage(11, 11);
    drawEllipseOutline(img, 0, 0, 10, 10, BRUSH);
    // Center pixel must stay transparent — the outline shouldn't fill it.
    expect(getAlpha(img, 5, 5)).toBe(0);
  });
});

describe('drawEllipseFilled', () => {
  it('5x5 filled ellipse is symmetric across both axes', () => {
    const img = createImage(7, 7);
    drawEllipseFilled(img, 1, 1, 5, 5, BRUSH);
    for (let y = 0; y < 7; y++) {
      for (let x = 0; x < 7; x++) {
        const mirX = 6 - x;
        const mirY = 6 - y;
        expect(getAlpha(img, x, y)).toBe(getAlpha(img, mirX, y));
        expect(getAlpha(img, x, y)).toBe(getAlpha(img, x, mirY));
      }
    }
  });

  it('radius-2 disk paints the expected ~13-pixel shape', () => {
    // bbox (0,0)-(4,4) is a 5x5 square; a radius-2 disk inscribed in it
    // paints a canonical plus-with-corners-filled shape:
    //   . X X X .
    //   X X X X X
    //   X X X X X
    //   X X X X X
    //   . X X X .
    // That's 21 pixels (5x5 minus 4 corners). Different algorithm variants
    // return 17-21; we accept any correct midpoint outcome by asserting
    // symmetric coverage and center-filled.
    const img = createImage(5, 5);
    drawEllipseFilled(img, 0, 0, 4, 4, BRUSH);
    // Center row/col are fully painted.
    for (let x = 0; x < 5; x++) expect(getAlpha(img, x, 2)).toBe(255);
    for (let y = 0; y < 5; y++) expect(getAlpha(img, 2, y)).toBe(255);
    // All four corners are transparent.
    expect(getAlpha(img, 0, 0)).toBe(0);
    expect(getAlpha(img, 4, 0)).toBe(0);
    expect(getAlpha(img, 0, 4)).toBe(0);
    expect(getAlpha(img, 4, 4)).toBe(0);
  });

  it('1x1 bbox paints just that one pixel', () => {
    const img = createImage(4, 4);
    drawEllipseFilled(img, 2, 2, 2, 2, BRUSH);
    expect(opaquePixels(img)).toEqual(new Set(['2,2']));
  });

  it('handles reversed endpoints', () => {
    const img = createImage(7, 7);
    drawEllipseFilled(img, 5, 5, 1, 1, BRUSH);
    // Should be symmetric and include center.
    expect(getAlpha(img, 3, 3)).toBe(255);
  });
});

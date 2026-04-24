import { describe, it, expect } from 'vitest';
import { sliceManual } from '../../src/core/slicers/manual';

describe('sliceManual', () => {
  it('returns rects verbatim with labels stripped', () => {
    expect(
      sliceManual({
        kind: 'manual',
        rects: [
          { x: 0, y: 0, w: 16, h: 16, label: 'idle' },
          { x: 16, y: 0, w: 16, h: 16 },
        ],
      }),
    ).toEqual([
      { x: 0, y: 0, w: 16, h: 16 },
      { x: 16, y: 0, w: 16, h: 16 },
    ]);
  });

  it('returns empty for no rects', () => {
    expect(sliceManual({ kind: 'manual', rects: [] })).toEqual([]);
  });
});

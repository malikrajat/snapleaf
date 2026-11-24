import { describe, expect, it } from 'vitest';
import { normalizeRect, intersectRects, fitRect, clamp } from './geometry';

describe('geometry', () => {
  it('normalises drag rectangles in every direction', () => {
    expect(normalizeRect({ x: 20, y: 30 }, { x: 5, y: 10 })).toEqual({ x: 5, y: 10, width: 15, height: 20 });
    expect(normalizeRect({ x: 5, y: 10 }, { x: 20, y: 30 })).toEqual({ x: 5, y: 10, width: 15, height: 20 });
  });

  it('intersects and fits rectangles', () => {
    expect(intersectRects({ x: 0, y: 0, width: 100, height: 100 }, { x: 50, y: 40, width: 100, height: 20 })).toEqual({
      x: 50,
      y: 40,
      width: 50,
      height: 20
    });
    expect(fitRect({ x: 0, y: 0, width: 1920, height: 1080 }, 960, 540)).toEqual({
      x: 0,
      y: 0,
      width: 960,
      height: 540
    });
  });

  it('clamps values', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(50, 0, 10)).toBe(10);
  });
});

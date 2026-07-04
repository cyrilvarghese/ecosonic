import { describe, it, expect } from 'vitest';
import { secToPx, pxToSec, clampRegion, clampOverlap } from '@/arrange/geometry';

describe('geometry', () => {
  it('round-trips sec↔px', () => {
    expect(secToPx(30, 4)).toBe(120);
    expect(pxToSec(120, 4)).toBe(30);
  });
  it('clamps a region into bounds keeping min width', () => {
    const r = { enterSec: -5, exitSec: 3, fadeInSec: 1, fadeOutSec: 1 };
    const c = clampRegion(r, { min: 0, max: 100 }, 2);
    expect(c.enterSec).toBe(0);
    expect(c.exitSec).toBeGreaterThanOrEqual(c.enterSec + 2);
  });
  it('keeps at least min width when exit is dragged below enter', () => {
    const r = { enterSec: 50, exitSec: 51, fadeInSec: 1, fadeOutSec: 1 };
    const c = clampRegion(r, { min: 0, max: 100 }, 5);
    expect(c.exitSec - c.enterSec).toBeGreaterThanOrEqual(5);
  });
  it('clamps overlap into [0, maxOverlap]', () => {
    expect(clampOverlap(-10, 120)).toBe(0);
    expect(clampOverlap(999, 120)).toBe(120);
    expect(clampOverlap(60, 120)).toBe(60);
  });
});

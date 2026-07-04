import { describe, it, expect } from 'vitest';
import { regionEnvAt } from '@/arrange/regionEnv';

const r = { enterSec: 10, exitSec: 30, fadeInSec: 4, fadeOutSec: 4 };

describe('regionEnvAt', () => {
  it('is 0 outside the region', () => {
    expect(regionEnvAt(r, 5)).toBe(0);
    expect(regionEnvAt(r, 35)).toBe(0);
  });
  it('holds at 1 in the sustain', () => {
    expect(regionEnvAt(r, 20)).toBeCloseTo(1, 6);
  });
  it('ramps smoothly 0→1 over fade-in and 1→0 over fade-out', () => {
    expect(regionEnvAt(r, 10)).toBeCloseTo(0, 6);      // entry
    expect(regionEnvAt(r, 12)).toBeCloseTo(0.5, 6);    // half fade-in
    expect(regionEnvAt(r, 30)).toBeCloseTo(0, 6);      // exit
    expect(regionEnvAt(r, 28)).toBeCloseTo(0.5, 6);    // half fade-out
  });
  it('never exceeds 1', () => {
    for (let s = 9; s <= 31; s += 0.5) expect(regionEnvAt(r, s)).toBeLessThanOrEqual(1);
  });
});

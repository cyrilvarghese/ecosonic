import { describe, it, expect } from 'vitest';
import type { TemplateRegion } from '@/arrange/types';
import { regionAt, regionEnvAt } from '@/arrange/regionEnv';

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

describe('regionAt', () => {
  const regions: TemplateRegion[] = [
    { trackId: 'MELODY', enterSec: 0, exitSec: 100, fadeInSec: 0, fadeOutSec: 0 },
    { trackId: 'MELODY', enterSec: 300, exitSec: 400, fadeInSec: 0, fadeOutSec: 0 },
    { trackId: 'PAD', enterSec: 50, exitSec: 150, fadeInSec: 0, fadeOutSec: 0 },
  ];

  it('finds a later phrase of the same track, not just the first', () => {
    expect(regionAt(regions, 'MELODY', 350)).toMatchObject({ enterSec: 300, exitSec: 400 });
  });

  it('returns undefined in the gap between two phrases', () => {
    expect(regionAt(regions, 'MELODY', 200)).toBeUndefined();
  });

  it('is inclusive of the entrance and exclusive of the exit', () => {
    expect(regionAt(regions, 'MELODY', 0)).toBeDefined();
    expect(regionAt(regions, 'MELODY', 100)).toBeUndefined();
  });

  it('does not cross tracks', () => {
    expect(regionAt(regions, 'PAD', 350)).toBeUndefined();
  });
});

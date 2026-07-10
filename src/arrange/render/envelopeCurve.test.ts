import { describe, it, expect } from 'vitest';
import { envelopeCurve } from '@/arrange/render/envelopeCurve';

const region = { enterSec: 100, exitSec: 220, fadeInSec: 60, fadeOutSec: 60 };

describe('envelopeCurve', () => {
  it('starts and ends at ~0 and holds the ceiling between fades', () => {
    const c = envelopeCurve(region, 0.5, 0.05);
    expect(c[0]).toBeCloseTo(0, 5);
    expect(c[c.length - 1]).toBeCloseTo(0, 2);
    const mid = c[Math.floor(c.length / 2)]; // s = 160: past fadeIn, before fadeOut → hold
    expect(mid).toBeCloseTo(0.5, 5);
  });
  it('hits half the ceiling at the cosine midpoint of the fade-in', () => {
    const c = envelopeCurve(region, 1, 0.05);
    const idxAt30s = Math.round(((130 - 100) / (220 - 100)) * (c.length - 1)); // s = 130 = half fade
    expect(c[idxAt30s]).toBeCloseTo(0.5, 1);
  });
  it('zero-fade regions jump to the ceiling by the second sample (hard entry stays hard)', () => {
    const c = envelopeCurve({ enterSec: 0, exitSec: 100, fadeInSec: 0, fadeOutSec: 0 }, 1, 0.05);
    expect(c[1]).toBeCloseTo(1, 5);
    expect(c[c.length - 2]).toBeCloseTo(1, 5);
  });
});

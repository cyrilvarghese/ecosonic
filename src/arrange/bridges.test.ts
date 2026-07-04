import { describe, it, expect } from 'vitest';
import { crossfade } from '@/arrange/bridges';

describe('crossfade', () => {
  it('is fully outgoing at the start of the bridge', () => {
    expect(crossfade(0, 120)).toEqual({ out: 1, in: 0 });
  });
  it('is balanced at the midpoint', () => {
    const { out, in: inc } = crossfade(60, 120);
    expect(out).toBeCloseTo(0.5, 6);
    expect(inc).toBeCloseTo(0.5, 6);
  });
  it('is fully incoming at the end', () => {
    const { out, in: inc } = crossfade(120, 120);
    expect(out).toBeCloseTo(0, 6);
    expect(inc).toBeCloseTo(1, 6);
  });
  it('out + in always equals 1 across the window', () => {
    for (let t = 0; t <= 120; t += 10) {
      const { out, in: inc } = crossfade(t, 120);
      expect(out + inc).toBeCloseTo(1, 6);
    }
  });
  it('degenerate overlap of 0 is a hard switch to incoming', () => {
    expect(crossfade(0, 0)).toEqual({ out: 0, in: 1 });
  });
});

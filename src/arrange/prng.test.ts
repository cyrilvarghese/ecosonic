import { describe, it, expect } from 'vitest';
import { makeRng } from '@/arrange/prng';

describe('makeRng', () => {
  it('is deterministic — same seed yields the same sequence', () => {
    const a = makeRng(42), b = makeRng(42);
    const seqA = [a.float(), a.float(), a.float()];
    const seqB = [b.float(), b.float(), b.float()];
    expect(seqA).toEqual(seqB);
  });
  it('different seeds diverge', () => {
    const a = makeRng(1), b = makeRng(2);
    expect(a.float()).not.toBe(b.float());
  });
  it('float() stays in [0,1)', () => {
    const r = makeRng(7);
    for (let i = 0; i < 1000; i++) {
      const x = r.float();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
  it('range(lo,hi) stays within bounds', () => {
    const r = makeRng(9);
    for (let i = 0; i < 1000; i++) {
      const x = r.range(10, 20);
      expect(x).toBeGreaterThanOrEqual(10);
      expect(x).toBeLessThanOrEqual(20);
    }
  });
  it('chance(0) is always false and chance(1) always true', () => {
    const r = makeRng(3);
    expect(r.chance(0)).toBe(false);
    expect(r.chance(1)).toBe(true);
  });
});

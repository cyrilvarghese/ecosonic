/** A small deterministic PRNG (mulberry32) + convenience helpers. Seeded so the generator is pure:
 *  same seed → same stream. Used instead of Math.random() (which is banned in generator code). */
export interface RNG {
  /** Next value in [0, 1). */
  float(): number;
  /** Uniform in [lo, hi]. */
  range(lo: number, hi: number): number;
  /** True with probability p (p ≤ 0 → never, p ≥ 1 → always). */
  chance(p: number): boolean;
}

export function makeRng(seed: number): RNG {
  let a = seed >>> 0;
  const float = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    float,
    range: (lo, hi) => lo + (hi - lo) * float(),
    chance: (p) => (p <= 0 ? false : p >= 1 ? true : float() < p),
  };
}

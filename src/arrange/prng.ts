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

/** A stable 32-bit seed derived from any parts, so one draw can own several INDEPENDENT streams
 *  instead of one shared one. A shared stream couples everything drawn from it: change how many
 *  values one part consumes and every later part shifts. Deriving a stream per part makes each
 *  choice a pure function of its own identity. FNV-1a — not cryptographic, just well mixed. */
export function seedFrom(...parts: (string | number)[]): number {
  let h = 0x811c9dc5;
  for (const part of parts) {
    const s = String(part);
    for (let i = 0; i < s.length; i++) {
      h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
    }
    // A separator, so ('a','bc') and ('ab','c') cannot collide.
    h = Math.imul(h ^ 0x2f, 0x01000193);
  }
  return h >>> 0;
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

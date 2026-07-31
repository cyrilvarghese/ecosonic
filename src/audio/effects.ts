import type { EcosonicConfig } from '@/config';

export type EffectsConfig = EcosonicConfig['audio']['effects'];

/** A track's aux send levels, 0..1 each. */
export interface TrackSends { reverb: number; delay: number }

export const DRY: TrackSends = { reverb: 0, delay: 0 };

const clamp01 = (v: number): number => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

/** mulberry32 — a small seeded PRNG. Same seed, same sequence, so the live context and the
 *  offline export context synthesize the identical room instead of two different ones. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One channel of a decaying-noise impulse response: white noise under a power envelope.
 *  Pure and AudioContext-free, so it unit-tests in jsdom where Web Audio does not exist. */
export function impulseChannel(length: number, decay: number, seed: number): Float32Array {
  const rand = mulberry32(seed);
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) out[i] = (rand() * 2 - 1) * Math.pow(1 - i / length, decay);
  return out;
}

/** How long the effects keep sounding after their last input, in seconds. Derived from config so
 *  it cannot drift out of sync with the effects it has to outlast. */
export function tailSecFor(cfg: EffectsConfig): number {
  const fb = Math.min(Math.max(cfg.delay.feedback, 0), 0.95); // >= 1 never decays
  // Repeats until -60dB (0.001). Zero feedback still yields the one audible repeat.
  const repeats = fb <= 0 ? 1 : Math.log(0.001) / Math.log(fb);
  return Math.max(cfg.reverb.seconds, cfg.delay.timeSec * Math.max(1, repeats));
}

/** Seed each track's sends from its category default. An unlisted category is fully dry. */
export function defaultSendsFor(
  tracks: ReadonlyArray<{ id: string; category: string }>,
  defaults: Record<string, TrackSends>,
): Record<string, TrackSends> {
  const out: Record<string, TrackSends> = {};
  for (const t of tracks) {
    const d = defaults[t.category];
    out[t.id] = { reverb: clamp01(d?.reverb ?? 0), delay: clamp01(d?.delay ?? 0) };
  }
  return out;
}

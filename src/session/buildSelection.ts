import type { ElementName, Manifest, SampleEntry, Track } from '@/types';
import type { EcosonicConfig } from '@/config';
import { SELECTION_ORDER, labelFor } from '@/session/selectionRules';

export type Rng = () => number; // returns [0, 1)

/** Choose how many to pick: a value in [min,max], clamped to what's available. */
export function pickCount(min: number, max: number, available: number, rng: Rng): number {
  const hi = Math.min(max, available);
  const lo = Math.min(min, hi);
  if (hi <= lo) return Math.max(0, hi);
  return lo + Math.floor(rng() * (hi - lo + 1));
}

/** Pick n distinct items via a partial Fisher–Yates shuffle. */
export function sampleN<T>(arr: T[], n: number, rng: Rng): T[] {
  const copy = [...arr];
  const take = Math.min(n, copy.length);
  for (let i = 0; i < take; i++) {
    const j = i + Math.floor(rng() * (copy.length - i));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, take);
}

/** Pick a replacement within a category, preferring one different from the current. */
export function pickReplacement(
  pool: SampleEntry[],
  currentPath: string,
  rng: Rng = Math.random,
): SampleEntry | null {
  if (pool.length === 0) return null;
  const others = pool.filter((s) => s.path !== currentPath);
  const from = others.length > 0 ? others : pool;
  return sampleN(from, 1, rng)[0];
}

/** Build the multitrack project for an element, per config selection rules. */
export function buildSelection(
  element: ElementName,
  manifest: Manifest,
  cfg: EcosonicConfig,
  rng: Rng = Math.random,
): Track[] {
  const el = manifest[element];
  const tracks: Track[] = [];

  for (const category of SELECTION_ORDER) {
    const pool = el[category]; // primary categories are SampleEntry[]
    const { min, max } = cfg.selection[category];
    const count = pickCount(min, max, pool.length, rng);
    const chosen = sampleN(pool, count, rng);
    chosen.forEach((sample, i) => {
      tracks.push({
        id: `${category}-${i}`,
        category,
        label: labelFor(category, i, count),
        sample: { name: sample.name, path: sample.path, bytes: sample.bytes },
        volumeDb: cfg.audio.volume.defaultTrackDb,
        muted: false,
        playing: true,
        locked: false,
      });
    });
  }

  return tracks;
}

import { describe, it, expect } from 'vitest';
import { ELEMENTS, type Category, type ElementManifest, type ElementName, type Manifest, type SampleEntry } from '@/types';
import { config } from '@/config';
import { generateRemix } from './generateRemix';
import type { AuthoredRule, Phrase } from './sessionRules';

const CATS: Category[] = [
  'ISO', 'PLANET', 'NOISE', 'ELEMENT', 'ELEMENT_SUB', 'BASS', 'PAD', 'DRONE', 'ARP', 'MELODY', 'FX',
];

const entry = (name: string): SampleEntry => ({ name, path: `${name}.wav`, bytes: 1, ext: '.wav' });

/** Every element×category holds one sample named `EL-CAT`, so a track's sample names its own origin.
 *  `empty` blanks specific element×category slots to exercise the missing-sample path. */
function fakeManifest(empty: Partial<Record<ElementName, Category[]>> = {}): Manifest {
  const out = {} as Manifest;
  for (const el of ELEMENTS) {
    const em = {} as ElementManifest;
    for (const c of CATS) em[c] = (empty[el] ?? []).includes(c) ? [] : [entry(`${el}-${c}`)];
    out[el] = em;
  }
  return out;
}

const ph = (enterSec: number, exitSec: number, fadeInSec = 0, fadeOutSec = 0): Phrase =>
  ({ enterSec, exitSec, fadeInSec, fadeOutSec });

const rule = (
  category: Category,
  element: ElementName,
  phrases: Phrase[] = [ph(0, 60)],
  variant?: string,
): AuthoredRule => ({
  category,
  variant,
  section: 'INTRODUCTION',
  phrases,
  source: { element, sessionId: `${element}-1`, track: category },
});

describe('generateRemix', () => {
  it("picks only the chosen element's rules in scoped mode", () => {
    const pool = [rule('MELODY', 'WATER'), rule('MELODY', 'FIRE'), rule('PAD', 'FIRE')];
    for (let seed = 1; seed <= 10; seed++) {
      const { picks } = generateRemix(pool, fakeManifest(), { seed, element: 'FIRE' });
      expect(picks).toHaveLength(2);
      expect(picks.every((p) => p.rule.source.element === 'FIRE')).toBe(true);
      expect(picks.every((p) => p.track.sample.name.startsWith('FIRE-'))).toBe(true);
    }
  });

  it('counts only the filtered candidates in poolSize', () => {
    const pool = [rule('MELODY', 'WATER'), rule('MELODY', 'FIRE')];
    const cross = generateRemix(pool, fakeManifest(), { seed: 1 });
    const scoped = generateRemix(pool, fakeManifest(), { seed: 1, element: 'FIRE' });
    expect(cross.picks[0].poolSize).toBe(2);
    expect(scoped.picks[0].poolSize).toBe(1);
  });

  it("takes each track's sample from the element of the rule it picked", () => {
    const pool = [rule('MELODY', 'WATER'), rule('PAD', 'FIRE')];
    const { picks } = generateRemix(pool, fakeManifest(), { seed: 1 });
    const byCategory = new Map(picks.map((p) => [p.track.category, p.track.sample.name]));
    expect(byCategory.get('MELODY')).toBe('WATER-MELODY');
    expect(byCategory.get('PAD')).toBe('FIRE-PAD');
  });

  it('derives one track per category, collapsing melody variants into its label', () => {
    const pool = [
      rule('MELODY', 'WATER', [ph(0, 60)], 'MELODY 2'),
      rule('MELODY', 'FIRE', [ph(0, 60)], 'SUB MELODY'),
    ];
    const { tracks, picks } = generateRemix(pool, fakeManifest(), { seed: 2 });
    expect(tracks).toHaveLength(1);
    expect(tracks[0].id).toBe('MELODY');
    expect(tracks[0].label).toBe(picks[0].rule.variant);
    expect(tracks[0].ceilingDb).toBe(config.audio.volume.defaultTrackDb);
  });

  it('skips a category no rule in the pool covers', () => {
    const { tracks } = generateRemix([rule('MELODY', 'WATER')], fakeManifest(), { seed: 1 });
    expect(tracks.map((t) => t.category)).toEqual(['MELODY']);
  });

  it('skips a picked rule whose element has no sample for the category, and warns', () => {
    const { tracks, regions, warnings } = generateRemix(
      [rule('MELODY', 'WATER')],
      fakeManifest({ WATER: ['MELODY'] }),
      { seed: 1 },
    );
    expect(tracks).toEqual([]);
    expect(regions).toEqual([]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('MELODY');
    expect(warnings[0]).toContain('WATER');
  });

  it('orders derived tracks by the vertical stack grammar', () => {
    const pool = [rule('MELODY', 'WATER'), rule('NOISE', 'WATER'), rule('PAD', 'WATER')];
    const { tracks } = generateRemix(pool, fakeManifest(), { seed: 1 });
    expect(tracks.map((t) => t.category)).toEqual(['NOISE', 'PAD', 'MELODY']);
  });

  it('emits one region per phrase, keyed to its track', () => {
    const pool = [rule('PAD', 'FIRE', [ph(0, 120, 0, 120), ph(540, 600, 60, 0)])];
    const { regions } = generateRemix(pool, fakeManifest(), { seed: 1 });
    expect(regions).toHaveLength(2);
    expect(regions.every((r) => r.trackId === 'PAD')).toBe(true);
    expect(regions[0]).toEqual({ trackId: 'PAD', enterSec: 0, exitSec: 120, fadeInSec: 0, fadeOutSec: 120 });
  });

  it('repeats its draw for a seed and redraws for a different one', () => {
    const pool = ELEMENTS.map((el) => rule('MELODY', el));
    const manifest = fakeManifest();
    expect(generateRemix(pool, manifest, { seed: 7 })).toEqual(generateRemix(pool, manifest, { seed: 7 }));

    const first = generateRemix(pool, manifest, { seed: 1 }).picks[0].rule;
    const redraws = Array.from({ length: 20 }, (_, i) => generateRemix(pool, manifest, { seed: i + 1 }).picks[0].rule);
    expect(redraws.some((r) => r !== first)).toBe(true);
  });
});

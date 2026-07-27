import { describe, it, expect } from 'vitest';
import { ELEMENTS, type Category, type ElementManifest, type ElementName, type Manifest, type SampleEntry } from '@/types';
import type { Mode } from '@/arrange/types';
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
  section: Mode = 'INTRODUCTION',
  sectionStartSec = 0,
): AuthoredRule => ({
  category,
  variant,
  section,
  sectionStartSec,
  phrases,
  source: { element, sessionId: `${element}-1`, track: category },
});

/** Every draw needs a session length; the section tests override it where it matters. */
const SESSION = { sessionSec: 1800 };

describe('generateRemix', () => {
  it("picks only the chosen element's rules in scoped mode", () => {
    const pool = [rule('MELODY', 'WATER'), rule('MELODY', 'FIRE'), rule('PAD', 'FIRE')];
    for (let seed = 1; seed <= 10; seed++) {
      const { picks } = generateRemix(pool, fakeManifest(), { ...SESSION, seed, element: 'FIRE' });
      expect(picks).toHaveLength(2);
      expect(picks.every((p) => p.rule.source.element === 'FIRE')).toBe(true);
      expect(picks.every((p) => p.track.sample.name.startsWith('FIRE-'))).toBe(true);
    }
  });

  it('counts the candidates a pick was actually drawn from', () => {
    // The draw is two-stage — an element for the track, then a rule per section within it — so
    // poolSize is that element+section pool, not the whole cross pool.
    const pool = [rule('MELODY', 'WATER'), rule('MELODY', 'WATER'), rule('MELODY', 'FIRE')];

    const cross = generateRemix(pool, fakeManifest(), { ...SESSION, seed: 1 });
    expect(cross.picks[0].poolSize).toBe(cross.picks[0].rule.source.element === 'WATER' ? 2 : 1);

    const scoped = generateRemix(pool, fakeManifest(), { ...SESSION, seed: 1, element: 'WATER' });
    expect(scoped.picks[0].poolSize).toBe(2);
  });

  it("takes each track's sample from the element of the rule it picked", () => {
    const pool = [rule('MELODY', 'WATER'), rule('PAD', 'FIRE')];
    const { picks } = generateRemix(pool, fakeManifest(), { ...SESSION, seed: 1 });
    const byCategory = new Map(picks.map((p) => [p.track.category, p.track.sample.name]));
    expect(byCategory.get('MELODY')).toBe('WATER-MELODY');
    expect(byCategory.get('PAD')).toBe('FIRE-PAD');
  });

  it('derives one track per category, collapsing melody variants into its label', () => {
    const pool = [
      rule('MELODY', 'WATER', [ph(0, 60)], 'MELODY 2'),
      rule('MELODY', 'FIRE', [ph(0, 60)], 'SUB MELODY'),
    ];
    const { tracks, picks } = generateRemix(pool, fakeManifest(), { ...SESSION, seed: 2 });
    expect(tracks).toHaveLength(1);
    expect(tracks[0].id).toBe('MELODY');
    expect(tracks[0].label).toBe(picks[0].rule.variant);
    expect(tracks[0].ceilingDb).toBe(config.audio.volume.defaultTrackDb);
  });

  it('skips a category no rule in the pool covers', () => {
    const { tracks } = generateRemix([rule('MELODY', 'WATER')], fakeManifest(), { ...SESSION, seed: 1 });
    expect(tracks.map((t) => t.category)).toEqual(['MELODY']);
  });

  it('skips a picked rule whose element has no sample for the category, and warns', () => {
    const { tracks, regions, warnings } = generateRemix(
      [rule('MELODY', 'WATER')],
      fakeManifest({ WATER: ['MELODY'] }),
      { ...SESSION, seed: 1 },
    );
    expect(tracks).toEqual([]);
    expect(regions).toEqual([]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('MELODY');
    expect(warnings[0]).toContain('WATER');
  });

  it('orders derived tracks by the vertical stack grammar', () => {
    const pool = [rule('MELODY', 'WATER'), rule('NOISE', 'WATER'), rule('PAD', 'WATER')];
    const { tracks } = generateRemix(pool, fakeManifest(), { ...SESSION, seed: 1 });
    expect(tracks.map((t) => t.category)).toEqual(['NOISE', 'PAD', 'MELODY']);
  });

  it('emits one region per phrase, keyed to its track', () => {
    const pool = [rule('PAD', 'FIRE', [ph(0, 120, 0, 120), ph(540, 600, 60, 0)])];
    const { regions } = generateRemix(pool, fakeManifest(), { ...SESSION, seed: 1 });
    expect(regions).toHaveLength(2);
    expect(regions.every((r) => r.trackId === 'PAD')).toBe(true);
    expect(regions[0]).toEqual({ trackId: 'PAD', enterSec: 0, exitSec: 120, fadeInSec: 0, fadeOutSec: 120 });
  });

  it('repeats its draw for a seed and redraws for a different one', () => {
    const pool = ELEMENTS.map((el) => rule('MELODY', el));
    const manifest = fakeManifest();
    expect(generateRemix(pool, manifest, { ...SESSION, seed: 7 }))
      .toEqual(generateRemix(pool, manifest, { ...SESSION, seed: 7 }));

    const first = generateRemix(pool, manifest, { ...SESSION, seed: 1 }).picks[0].rule;
    const redraws = Array.from({ length: 20 }, (_, i) =>
      generateRemix(pool, manifest, { ...SESSION, seed: i + 1 }).picks[0].rule);
    expect(redraws.some((r) => r !== first)).toBe(true);
  });
});

describe('generateRemix — a full session spans every section', () => {
  const BASE = { seed: 1, sessionSec: 1800 };

  // One element authoring a bed across all three sections — the shape a real session file has.
  const bedAcrossSession = [
    rule('NOISE', 'EARTH', [ph(0, 600)], undefined, 'INTRODUCTION', 0),
    rule('NOISE', 'EARTH', [ph(600, 1200)], undefined, 'DEEP_RELAXATION', 600),
    rule('NOISE', 'EARTH', [ph(1200, 1800)], undefined, 'RETURN', 1200),
  ];

  it('draws one rule per section so a bed sounds for the whole session', () => {
    const { picks, regions } = generateRemix(bedAcrossSession, fakeManifest(), BASE);
    expect(picks.map((p) => p.rule.section)).toEqual(['INTRODUCTION', 'DEEP_RELAXATION', 'RETURN']);
    expect(regions.map((r) => [r.enterSec, r.exitSec])).toEqual([[0, 600], [600, 1200], [1200, 1800]]);
  });

  it('still derives a single track carrying a single sample', () => {
    const { tracks, picks } = generateRemix(bedAcrossSession, fakeManifest(), BASE);
    expect(tracks).toHaveLength(1);
    expect(picks.every((p) => p.track === tracks[0])).toBe(true);
    expect(tracks[0].sample.name).toBe('EARTH-NOISE');
  });

  it('takes every rule of a track from one element, so its windows match its sample', () => {
    const pool = [
      ...bedAcrossSession,
      rule('NOISE', 'FIRE', [ph(0, 600)], undefined, 'INTRODUCTION', 0),
      rule('NOISE', 'FIRE', [ph(1200, 1800)], undefined, 'RETURN', 1200),
    ];
    for (let seed = 1; seed <= 10; seed++) {
      const { tracks, picks } = generateRemix(pool, fakeManifest(), { ...BASE, seed });
      const element = picks[0].rule.source.element;
      expect(picks.every((p) => p.rule.source.element === element)).toBe(true);
      expect(tracks[0].sample.name).toBe(`${element}-NOISE`);
    }
  });

  it('accepts absence — a section the element never authored is simply silent', () => {
    const pool = [
      rule('MELODY', 'EARTH', [ph(0, 300)], undefined, 'INTRODUCTION', 0),
      rule('MELODY', 'EARTH', [ph(1200, 1500)], undefined, 'RETURN', 1200),
    ];
    const { picks } = generateRemix(pool, fakeManifest(), BASE);
    expect(picks.map((p) => p.rule.section)).toEqual(['INTRODUCTION', 'RETURN']);
  });

  it('counts each pool size against the section it was drawn from', () => {
    const pool = [
      rule('NOISE', 'EARTH', [ph(0, 600)], undefined, 'INTRODUCTION', 0),
      rule('NOISE', 'EARTH', [ph(0, 300)], undefined, 'INTRODUCTION', 0),
      rule('NOISE', 'EARTH', [ph(1200, 1800)], undefined, 'RETURN', 1200),
    ];
    const { picks } = generateRemix(pool, fakeManifest(), BASE);
    expect(picks.map((p) => p.poolSize)).toEqual([2, 1]);
  });
});

describe('generateRemix — section axis', () => {
  const BASE = { seed: 1, sessionSec: 1800 };

  it('keeps absolute times and the session length when no section is chosen', () => {
    const pool = [rule('MELODY', 'EARTH', [ph(1320, 1590)], undefined, 'RETURN', 1200)];
    const { regions, totalSec } = generateRemix(pool, fakeManifest(), BASE);
    expect(totalSec).toBe(1800);
    expect(regions[0]).toMatchObject({ enterSec: 1320, exitSec: 1590 });
  });

  it('draws only rules of the chosen section', () => {
    const pool = [
      rule('MELODY', 'EARTH', [ph(0, 300)], undefined, 'INTRODUCTION', 0),
      rule('PAD', 'EARTH', [ph(1320, 1590)], undefined, 'RETURN', 1200),
    ];
    const { tracks } = generateRemix(pool, fakeManifest(), { ...BASE, section: 'RETURN' });
    expect(tracks.map((t) => t.category)).toEqual(['PAD']);
  });

  it('rebases each rule by its own section start, not a constant', () => {
    // AIR opens Deep Relaxation at 9:30 (570s); EARTH opens it at 10:00 (600s).
    const pool = [
      rule('MELODY', 'AIR', [ph(600, 900)], undefined, 'DEEP_RELAXATION', 570),
      rule('PAD', 'EARTH', [ph(660, 960)], undefined, 'DEEP_RELAXATION', 600),
    ];
    const { regions, totalSec } = generateRemix(pool, fakeManifest(), { ...BASE, section: 'DEEP_RELAXATION' });
    expect(totalSec).toBe(config.layerTwo.moduleSeconds);
    const byTrack = new Map(regions.map((r) => [r.trackId, r]));
    expect(byTrack.get('MELODY')).toMatchObject({ enterSec: 30, exitSec: 330 });
    expect(byTrack.get('PAD')).toMatchObject({ enterSec: 60, exitSec: 360 });
  });

  it('clips a phrase that overruns the module', () => {
    const pool = [rule('PAD', 'EARTH', [ph(0, 900)], undefined, 'INTRODUCTION', 0)];
    const { regions } = generateRemix(pool, fakeManifest(), { ...BASE, section: 'INTRODUCTION' });
    expect(regions[0].exitSec).toBe(config.layerTwo.moduleSeconds);
  });

  it('caps a fade at the width the clip has left after clipping', () => {
    const pool = [rule('PAD', 'EARTH', [ph(560, 900, 0, 120)], undefined, 'INTRODUCTION', 0)];
    const { regions } = generateRemix(pool, fakeManifest(), { ...BASE, section: 'INTRODUCTION' });
    expect(regions[0]).toMatchObject({ enterSec: 560, exitSec: 600, fadeOutSec: 40 });
  });

  it('skips a rule whose phrases all fall outside the module, and warns', () => {
    const pool = [rule('PAD', 'EARTH', [ph(1300, 1400)], undefined, 'INTRODUCTION', 0)];
    const { tracks, warnings } = generateRemix(pool, fakeManifest(), { ...BASE, section: 'INTRODUCTION' });
    expect(tracks).toEqual([]);
    expect(warnings.some((w) => w.includes('PAD'))).toBe(true);
  });

  it('combines the section filter with the element filter', () => {
    const pool = [
      rule('MELODY', 'AIR', [ph(600, 900)], undefined, 'DEEP_RELAXATION', 570),
      rule('MELODY', 'EARTH', [ph(660, 960)], undefined, 'DEEP_RELAXATION', 600),
      rule('MELODY', 'EARTH', [ph(0, 300)], undefined, 'INTRODUCTION', 0),
    ];
    const { picks } = generateRemix(pool, fakeManifest(), {
      ...BASE, section: 'DEEP_RELAXATION', element: 'EARTH',
    });
    expect(picks).toHaveLength(1);
    expect(picks[0].poolSize).toBe(1);
    expect(picks[0].rule.source.element).toBe('EARTH');
  });
});

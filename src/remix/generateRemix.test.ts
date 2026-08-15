import { describe, it, expect } from 'vitest';
import { ELEMENTS, type Category, type ElementManifest, type ElementName, type Manifest, type SampleEntry } from '@/types';
import type { Mode } from '@/arrange/types';
import { config } from '@/config';
import { generateRemix } from './generateRemix';
import { ruleKey, slotKey } from './pins';
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

  it('ids a lane by its category and the element it sounds', () => {
    const pool = [rule('MELODY', 'WATER'), rule('PAD', 'FIRE')];
    const { tracks } = generateRemix(pool, fakeManifest(), { ...SESSION, seed: 1 });
    expect(tracks.map((t) => t.id).sort()).toEqual(['MELODY·WATER', 'PAD·FIRE']);
  });

  it('ids a borrowed lane by the element it plays, not the rule it drew', () => {
    // Borrowed splits the two: the rule is WATER's, the audio is EARTH's. The id follows the audio,
    // because that is what mute, the engine and regionAt all address.
    const pool = [rule('MELODY', 'WATER')];
    const { tracks, regions } = generateRemix(pool, fakeManifest(), {
      ...SESSION, seed: 1, sampleElement: 'EARTH',
    });
    expect(tracks[0].id).toBe('MELODY·EARTH');
    expect(regions.every((r) => r.trackId === 'MELODY·EARTH')).toBe(true);
  });

  it('labels a lane with its variant and the element it sounds', () => {
    const pool = [rule('MELODY', 'FIRE', [ph(0, 60)], 'MELODY 2'), rule('PAD', 'EARTH')];
    const { tracks } = generateRemix(pool, fakeManifest(), { ...SESSION, seed: 1 });
    const byId = new Map(tracks.map((t) => [t.id, t.label]));
    expect(byId.get('MELODY·FIRE')).toBe('MELODY 2 · Fire');
    expect(byId.get('PAD·EARTH')).toBe('PAD · Earth');
  });

  it('derives one track per category, collapsing melody variants into its label', () => {
    const pool = [
      rule('MELODY', 'WATER', [ph(0, 60)], 'MELODY 2'),
      rule('MELODY', 'FIRE', [ph(0, 60)], 'SUB MELODY'),
    ];
    const { tracks, picks } = generateRemix(pool, fakeManifest(), { ...SESSION, seed: 2 });
    expect(tracks).toHaveLength(1);
    expect(tracks[0].id).toBe(`MELODY·${picks[0].rule.source.element}`);
    expect(tracks[0].label).toBe(`${picks[0].rule.variant} · ${picks[0].rule.source.element[0]}${picks[0].rule.source.element.slice(1).toLowerCase()}`);
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
    expect(regions.every((r) => r.trackId === 'PAD·FIRE')).toBe(true);
    expect(regions[0]).toEqual({ trackId: 'PAD·FIRE', enterSec: 0, exitSec: 120, fadeInSec: 0, fadeOutSec: 120 });
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
    expect(byTrack.get('MELODY·AIR')).toMatchObject({ enterSec: 30, exitSec: 330 });
    expect(byTrack.get('PAD·EARTH')).toMatchObject({ enterSec: 60, exitSec: 360 });
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

describe('generateRemix — borrowed timings', () => {
  const BASE = { seed: 1, sessionSec: 1800 };

  // One bed authored by three different elements across the three sections — the shape that lets a
  // borrowed draw visibly span elements within a single track.
  const bedFromManyElements = [
    rule('NOISE', 'EARTH', [ph(0, 600)], undefined, 'INTRODUCTION', 0),
    rule('NOISE', 'WATER', [ph(600, 1200)], undefined, 'DEEP_RELAXATION', 600),
    rule('NOISE', 'AIR', [ph(1200, 1800)], undefined, 'RETURN', 1200),
  ];

  it('takes every sample from the chosen element whatever rule won', () => {
    const pool = [...bedFromManyElements, rule('PAD', 'FIRE'), rule('MELODY', 'ETHER')];
    for (let seed = 1; seed <= 10; seed++) {
      const { tracks } = generateRemix(pool, fakeManifest(), {
        ...BASE, seed, sampleElement: 'EARTH',
      });
      expect(tracks.length).toBeGreaterThan(0);
      expect(tracks.every((t) => t.sample.name === `EARTH-${t.category}`)).toBe(true);
    }
  });

  it('draws one track’s rules from several elements at once', () => {
    const { picks } = generateRemix(bedFromManyElements, fakeManifest(), {
      ...BASE, sampleElement: 'EARTH',
    });
    expect(picks.map((p) => p.rule.source.element)).toEqual(['EARTH', 'WATER', 'AIR']);
    expect(new Set(picks.map((p) => p.track)).size).toBe(1);
  });

  it('rebases a borrowed rule by its own section start, not the sample element’s', () => {
    // AIR opens Deep Relaxation at 9:30 (570s). Borrowing it under EARTH audio must still shift by
    // 570 — the rule's own origin — or the window lands 30s late.
    const pool = [rule('MELODY', 'AIR', [ph(600, 900)], undefined, 'DEEP_RELAXATION', 570)];
    const { regions, tracks } = generateRemix(pool, fakeManifest(), {
      ...BASE, section: 'DEEP_RELAXATION', sampleElement: 'EARTH',
    });
    expect(regions[0]).toMatchObject({ trackId: 'MELODY·EARTH', enterSec: 30, exitSec: 330 });
    expect(tracks[0].sample.name).toBe('EARTH-MELODY');
  });

  it('makes a rule usable whose own element ships no sample for the category', () => {
    // WATER authors ELEMENT_SUB but ships no ELEMENT_SUB sample, so scoped/cross skip the track.
    const pool = [rule('ELEMENT_SUB', 'WATER')];
    const manifest = fakeManifest({ WATER: ['ELEMENT_SUB'] });

    const cross = generateRemix(pool, manifest, BASE);
    expect(cross.tracks).toEqual([]);

    const borrowed = generateRemix(pool, manifest, { ...BASE, sampleElement: 'EARTH' });
    expect(borrowed.tracks.map((t) => t.sample.name)).toEqual(['EARTH-ELEMENT_SUB']);
    expect(borrowed.warnings).toEqual([]);
  });

  it('warns with the sample element when that element lacks the sample', () => {
    const { tracks, warnings } = generateRemix([rule('DRONE', 'WATER')], fakeManifest({ EARTH: ['DRONE'] }), {
      ...BASE, sampleElement: 'EARTH',
    });
    expect(tracks).toEqual([]);
    expect(warnings[0]).toContain('EARTH');
    expect(warnings[0]).not.toContain('WATER');
  });

  it('repeats its draw for a seed', () => {
    const pool = [...bedFromManyElements, rule('MELODY', 'FIRE'), rule('MELODY', 'ETHER')];
    const manifest = fakeManifest();
    expect(generateRemix(pool, manifest, { ...BASE, seed: 7, sampleElement: 'EARTH' }))
      .toEqual(generateRemix(pool, manifest, { ...BASE, seed: 7, sampleElement: 'EARTH' }));
  });

  it('is exactly Scoped when the borrowed element is the element it is scoped to', () => {
    const pool = [...bedFromManyElements, rule('MELODY', 'EARTH'), rule('MELODY', 'WATER')];
    const manifest = fakeManifest();
    for (let seed = 1; seed <= 5; seed++) {
      expect(generateRemix(pool, manifest, { ...BASE, seed, element: 'EARTH', sampleElement: 'EARTH' }))
        .toEqual(generateRemix(pool, manifest, { ...BASE, seed, element: 'EARTH' }));
    }
  });
});

describe('generateRemix — lanes', () => {
  const BASE = { seed: 1, sessionSec: 1800 };

  // One category authored by three elements — the draw still takes exactly one of them.
  const melodyFromThree = [
    rule('MELODY', 'EARTH'),
    rule('MELODY', 'WATER'),
    rule('MELODY', 'FIRE'),
  ];

  /** Taking a category over is what gives it more than one lane — one per element you light. */
  const take = (category: Category, ...rs: AuthoredRule[]) => ({
    [category]: Object.fromEntries(rs.map((r) => [slotKey(r), ruleKey(r)])),
  });

  it('gives a generated category exactly one lane, however many elements authored it', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const { tracks } = generateRemix(melodyFromThree, fakeManifest(), { ...BASE, seed });
      expect(tracks).toHaveLength(1);
      // Its sample follows the element its lead landed on.
      expect(tracks[0].sample.name).toBe(`${tracks[0].id.split('·')[1]}-MELODY`);
    }
  });

  it('keeps every category independent of what the others drew', () => {
    // One shared stream would couple them: change what MELODY consumes and NOISE shifts too.
    const manifest = fakeManifest();
    const withBoth = generateRemix(
      [...melodyFromThree, rule('NOISE', 'EARTH'), rule('NOISE', 'WATER')], manifest, BASE,
    );
    const noiseOnly = generateRemix(
      [rule('NOISE', 'EARTH'), rule('NOISE', 'WATER')], manifest, BASE,
    );
    expect(withBoth.tracks.filter((t) => t.category === 'NOISE')).toEqual(noiseOnly.tracks);
  });

  it('keeps the vertical stack grammar across categories', () => {
    const pool = [
      rule('MELODY', 'EARTH'), rule('MELODY', 'WATER'),
      rule('NOISE', 'EARTH'), rule('NOISE', 'WATER'),
    ];
    const { tracks } = generateRemix(pool, fakeManifest(), BASE);
    expect(tracks.map((t) => t.category)).toEqual(['NOISE', 'MELODY']);
  });

  it('draws the lane element in proportion to its rule count (§3.7)', () => {
    // Three WATER melodies against one FIRE: WATER should win the category far more often.
    const pool = [
      rule('MELODY', 'WATER'), rule('MELODY', 'WATER'), rule('MELODY', 'WATER'),
      rule('MELODY', 'FIRE'),
    ];
    let water = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const { tracks } = generateRemix(pool, fakeManifest(), { ...BASE, seed });
      if (tracks[0].id === 'MELODY·WATER') water++;
    }
    expect(water).toBeGreaterThan(120); // ~150 expected at 3:1; well clear of 1:1's ~100
  });

  it('keeps every rule of a lane inside that lane’s element (§3.4, scoped to a lane)', () => {
    const earthI = rule('NOISE', 'EARTH', [ph(0, 600)], undefined, 'INTRODUCTION', 0);
    const earthRx = rule('NOISE', 'EARTH', [ph(600, 1200)], undefined, 'DEEP_RELAXATION', 600);
    const waterI = rule('NOISE', 'WATER', [ph(0, 600)], undefined, 'INTRODUCTION', 0);
    const waterRt = rule('NOISE', 'WATER', [ph(1200, 1800)], undefined, 'RETURN', 1200);

    const { tracks, picks } = generateRemix([earthI, earthRx, waterI, waterRt], fakeManifest(), {
      ...BASE, manual: take('NOISE', earthI, earthRx, waterI, waterRt),
    });

    expect(tracks).toHaveLength(2);
    for (const t of tracks) {
      const element = t.id.split('·')[1];
      const mine = picks.filter((p) => p.track.id === t.id);
      expect(mine.length).toBeGreaterThan(0);
      expect(mine.every((p) => p.rule.source.element === element)).toBe(true);
    }
  });

  it('layers overlapping timings instead of dropping one, because a lane is a voice', () => {
    // Both elements author the same window. On one track regionAt would resolve to the first and the
    // second would never sound; on two lanes both play.
    const earth = rule('PAD', 'EARTH', [ph(0, 600)]);
    const water = rule('PAD', 'WATER', [ph(0, 600)]);
    const { regions } = generateRemix([earth, water], fakeManifest(), {
      ...BASE, manual: take('PAD', earth, water),
    });
    expect(regions).toHaveLength(2);
    expect(new Set(regions.map((r) => r.trackId)).size).toBe(2);
    expect(regions.every((r) => r.enterSec === 0 && r.exitSec === 600)).toBe(true);
  });

  it('orders the lanes of one category by the element order', () => {
    const earth = rule('MELODY', 'EARTH');
    const water = rule('MELODY', 'WATER');
    const fire = rule('MELODY', 'FIRE');
    const { tracks } = generateRemix([earth, water, fire], fakeManifest(), {
      ...BASE, manual: take('MELODY', fire, earth, water), // lit in any order
    });
    // ELEMENTS is EARTH, WATER, AIR, FIRE, ETHER — so EARTH's lane sits above WATER's, above FIRE's.
    expect(tracks.map((t) => t.id)).toEqual(['MELODY·EARTH', 'MELODY·WATER', 'MELODY·FIRE']);
  });

  it('collapses missing samples into one warning naming every skipped element', () => {
    // WATER and ETHER author ELEMENT_SUB but ship no sample for it — the real §3.6 gap.
    const water = rule('ELEMENT_SUB', 'WATER');
    const ether = rule('ELEMENT_SUB', 'ETHER');
    const earth = rule('ELEMENT_SUB', 'EARTH');
    const { tracks, warnings } = generateRemix(
      [water, ether, earth],
      fakeManifest({ WATER: ['ELEMENT_SUB'], ETHER: ['ELEMENT_SUB'] }),
      { ...BASE, manual: take('ELEMENT_SUB', water, ether, earth) },
    );
    expect(tracks.map((t) => t.id)).toEqual(['ELEMENT_SUB·EARTH']); // EARTH's lane survived
    expect(warnings).toEqual(['ELEMENT_SUB: no WATER, ETHER sample — those lanes skipped']);
  });

  it('repeats a draw for a seed', () => {
    const manifest = fakeManifest();
    expect(generateRemix(melodyFromThree, manifest, { ...BASE, seed: 7 }))
      .toEqual(generateRemix(melodyFromThree, manifest, { ...BASE, seed: 7 }));
  });
});

describe('generateRemix — a locked category holds its draw', () => {
  const BASE = { sessionSec: 1800 };

  // Authored by three elements each, so an unlocked category has room to visibly reroll.
  const pool = [
    rule('MELODY', 'EARTH'), rule('MELODY', 'WATER'), rule('MELODY', 'FIRE'),
    rule('NOISE', 'EARTH'), rule('NOISE', 'WATER'), rule('NOISE', 'FIRE'),
  ];
  /** What a category was DRAWN as — the lock flag itself normalised away, so a locked draw can be
   *  compared against the unlocked draw it is supposed to be holding. The flag has its own test. */
  const of = (draw: ReturnType<typeof generateRemix>, category: Category) => ({
    tracks: draw.tracks.filter((t) => t.category === category).map((t) => ({ ...t, locked: false })),
    regions: draw.regions.filter((r) => r.trackId.startsWith(`${category}·`)),
  });

  it('draws a locked category at the seed it was locked on, whatever the seed becomes', () => {
    const manifest = fakeManifest();
    const locked = { NOISE: 1 };
    const first = generateRemix(pool, manifest, { ...BASE, seed: 1, locked });

    for (let seed = 2; seed <= 12; seed++) {
      const next = generateRemix(pool, manifest, { ...BASE, seed, locked });
      expect(of(next, 'NOISE')).toEqual(of(first, 'NOISE'));
    }
  });

  it('still rerolls everything else', () => {
    const manifest = fakeManifest();
    const locked = { NOISE: 1 };
    const first = generateRemix(pool, manifest, { ...BASE, seed: 1, locked });

    const melodies = Array.from({ length: 12 }, (_, i) =>
      generateRemix(pool, manifest, { ...BASE, seed: i + 1, locked }).tracks
        .find((t) => t.category === 'MELODY')!.id);
    expect(new Set(melodies).size).toBeGreaterThan(1);
    expect(of(first, 'MELODY').tracks[0].id).toBe(melodies[0]);
  });

  it('marks the locked track, so the timeline can show it without a second source', () => {
    const { tracks } = generateRemix(pool, fakeManifest(), { ...BASE, seed: 3, locked: { NOISE: 1 } });
    expect(tracks.find((t) => t.category === 'NOISE')!.locked).toBe(true);
    expect(tracks.find((t) => t.category === 'MELODY')!.locked).toBe(false);
  });

  it('is exactly today’s draw when nothing is locked', () => {
    const manifest = fakeManifest();
    for (let seed = 1; seed <= 10; seed++) {
      expect(generateRemix(pool, manifest, { ...BASE, seed, locked: {} }))
        .toEqual(generateRemix(pool, manifest, { ...BASE, seed }));
    }
  });

  it('locks at whatever seed it was given, not only the first', () => {
    const manifest = fakeManifest();
    // Locked on seed 5: the held draw is seed 5's, not seed 1's.
    const atFive = generateRemix(pool, manifest, { ...BASE, seed: 5 });
    const held = generateRemix(pool, manifest, { ...BASE, seed: 9, locked: { NOISE: 5 } });
    expect(of(held, 'NOISE')).toEqual(of(atFive, 'NOISE'));
  });
});

describe('generateRemix — a track starts at its category’s level', () => {
  const BASE = { seed: 1, sessionSec: 1800 };

  it('sits NOISE under the mix, where a bed belongs', () => {
    const { tracks } = generateRemix([rule('NOISE', 'EARTH')], fakeManifest(), BASE);
    expect(tracks[0].ceilingDb).toBe(config.audio.volume.categoryDb.NOISE);
    expect(tracks[0].ceilingDb).toBeLessThan(0);
  });

  it('starts every unlisted category at unity', () => {
    const pool = [rule('MELODY', 'EARTH'), rule('PAD', 'EARTH')];
    const { tracks } = generateRemix(pool, fakeManifest(), BASE);
    expect(tracks.map((t) => t.ceilingDb))
      .toEqual([config.audio.volume.defaultTrackDb, config.audio.volume.defaultTrackDb]);
  });

  it('keeps every starting level inside the slider’s range', () => {
    const { trackMinDb, trackMaxDb } = config.audio.volume;
    for (const db of Object.values(config.audio.volume.categoryDb)) {
      expect(db).toBeGreaterThanOrEqual(trackMinDb);
      expect(db).toBeLessThanOrEqual(trackMaxDb);
    }
  });
});

describe('generateRemix — PLANET sounds every sample its element ships', () => {
  const BASE = { seed: 1, sessionSec: 1800 };

  /** fakeManifest, but EARTH ships two PLANET samples — the shape the real library has, where every
   *  element carries two distinct bodies (EARTH: MERCURY + SUN). */
  const twoPlanets = (): Manifest => {
    const m = fakeManifest();
    m.EARTH.PLANET = [entry('MERCURY'), entry('SUN')];
    return m;
  };

  it('gives one lane per sample, rather than drawing one and dropping the other', () => {
    const { tracks } = generateRemix([rule('PLANET', 'EARTH')], twoPlanets(), BASE);
    expect(tracks.map((t) => t.sample.name)).toEqual(['MERCURY', 'SUN']);
  });

  it('ids and labels each lane by the body it plays', () => {
    const { tracks } = generateRemix([rule('PLANET', 'EARTH')], twoPlanets(), BASE);
    expect(tracks.map((t) => t.id)).toEqual(['PLANET·EARTH·MERCURY', 'PLANET·EARTH·SUN']);
    expect(tracks.map((t) => t.label)).toEqual(['PLANET · Earth · Mercury', 'PLANET · Earth · Sun']);
  });

  it('lays both lanes on identical timings', () => {
    const pool = [rule('PLANET', 'EARTH', [ph(0, 600), ph(900, 1200, 30, 30)])];
    const { regions } = generateRemix(pool, twoPlanets(), BASE);
    const times = (id: string) => regions.filter((r) => r.trackId === id)
      .map((r) => `${r.enterSec}-${r.exitSec}-${r.fadeInSec}-${r.fadeOutSec}`);
    expect(times('PLANET·EARTH·MERCURY')).toEqual(['0-600-0-0', '900-1200-30-30']);
    expect(times('PLANET·EARTH·SUN')).toEqual(times('PLANET·EARTH·MERCURY'));
  });

  it('gives both lanes the same rule, so one chip lights for the pair', () => {
    const r = rule('PLANET', 'EARTH');
    const { picks } = generateRemix([r], twoPlanets(), BASE);
    expect(picks).toHaveLength(2);
    expect(new Set(picks.map((p) => p.rule))).toEqual(new Set([r]));
  });

  it('keeps the id shape when an element ships only one, so a lane never renames itself', () => {
    // fakeManifest gives one PLANET sample. The id carries it anyway — an id whose shape depended on
    // the count would lose that lane's mute and level the day a second file was added.
    const { tracks } = generateRemix([rule('PLANET', 'EARTH')], fakeManifest(), BASE);
    expect(tracks.map((t) => t.id)).toEqual(['PLANET·EARTH·EARTH-PLANET']);
  });

  it('leaves every other multi-sample category on one drawn sample', () => {
    // ISO ships four per element; those are alternates to choose between, not bodies to stack.
    const m = fakeManifest();
    m.EARTH.ISO = [entry('ISO-A'), entry('ISO-B')];
    const { tracks } = generateRemix([rule('ISO', 'EARTH')], m, BASE);
    expect(tracks).toHaveLength(1);
    expect(tracks[0].id).toBe('ISO·EARTH');
    expect(['ISO-A', 'ISO-B']).toContain(tracks[0].sample.name);
  });

  it('fans out under Borrowed too, where the two files still differ', () => {
    // The §6.1 cap existed because extra lanes would be the SAME file staggered. Two planets are
    // two different files, so that argument does not reach them.
    const { tracks } = generateRemix([rule('PLANET', 'WATER')], twoPlanets(), {
      ...BASE, sampleElement: 'EARTH',
    });
    expect(tracks.map((t) => t.id)).toEqual(['PLANET·EARTH·MERCURY', 'PLANET·EARTH·SUN']);
  });

  it('takes two when an element ships more, so a lane stays a voice', () => {
    const m = fakeManifest();
    m.EARTH.PLANET = [entry('MERCURY'), entry('SUN'), entry('LUNA')];
    const { tracks } = generateRemix([rule('PLANET', 'EARTH')], m, BASE);
    expect(tracks).toHaveLength(2);
  });
});

describe('generateRemix — a track taken over by hand', () => {
  const BASE = { seed: 1, sessionSec: 1800 };

  const iEarth = rule('MELODY', 'EARTH', [ph(0, 100)], undefined, 'INTRODUCTION', 0);
  const iEarth2 = rule('MELODY', 'EARTH', [ph(0, 200)], undefined, 'INTRODUCTION', 0);
  const iWater = rule('MELODY', 'WATER', [ph(0, 300)], undefined, 'INTRODUCTION', 0);
  const rxAir = rule('MELODY', 'AIR', [ph(600, 900)], undefined, 'DEEP_RELAXATION', 600);
  const rtFire = rule('MELODY', 'FIRE', [ph(1200, 1500)], undefined, 'RETURN', 1200);
  iEarth.source = { element: 'EARTH', sessionId: 'e1', track: 'MELODY' };
  iEarth2.source = { element: 'EARTH', sessionId: 'e1', track: 'MELODY 2' };
  iWater.source = { element: 'WATER', sessionId: 'w1', track: 'MELODY' };
  rxAir.source = { element: 'AIR', sessionId: 'a1', track: 'MELODY' };
  rtFire.source = { element: 'FIRE', sessionId: 'f1', track: 'MELODY' };

  /** The manual state the UI would hold for one category. */
  const took = (...rs: AuthoredRule[]) => ({
    MELODY: Object.fromEntries(rs.map((r) => [slotKey(r), ruleKey(r)])),
  });

  it('plays exactly what was chosen, and nothing else', () => {
    const pool = [iEarth, iEarth2, iWater, rxAir, rtFire];
    for (let seed = 1; seed <= 10; seed++) {
      const { picks } = generateRemix(pool, fakeManifest(), { ...BASE, seed, manual: took(iEarth2) });
      expect(picks.map((p) => p.rule)).toEqual([iEarth2]);
    }
  });

  it('breaks one-lane-per-category, because rules govern the draw and not you', () => {
    // Cross-element draws one lane. Taken over, this category has three — one per element chosen,
    // because a lane is still one file, which is a fact about audio rather than a rule of grammar.
    const pool = [iEarth, iWater, rxAir, rtFire];
    const { tracks, regions } = generateRemix(pool, fakeManifest(), {
      ...BASE, manual: took(iEarth, rxAir, rtFire),
    });
    expect(tracks.map((t) => t.id)).toEqual(['MELODY·EARTH', 'MELODY·AIR', 'MELODY·FIRE']);
    expect(regions).toHaveLength(3);
  });

  it('leaves a section nobody chose silent', () => {
    const pool = [iEarth, rxAir, rtFire];
    const { picks } = generateRemix(pool, fakeManifest(), { ...BASE, manual: took(iEarth) });
    expect(picks.map((p) => p.rule.section)).toEqual(['INTRODUCTION']);
  });

  it('falls silent when every chip is turned off, rather than reverting to the draw', () => {
    // Wanting a category gone is a legitimate thing to want, and the row says `manual`, so silence
    // is honest. Handing it back to the generator is what reset is for.
    const pool = [iEarth, iWater];
    const { tracks } = generateRemix(pool, fakeManifest(), { ...BASE, manual: { MELODY: {} } });
    expect(tracks).toEqual([]);
  });

  it('ignores the seed — Regenerate must not touch a track you took over', () => {
    const pool = [iEarth, iEarth2, iWater, rxAir];
    const manual = took(iEarth2, rxAir);
    const first = generateRemix(pool, fakeManifest(), { ...BASE, seed: 1, manual });
    for (let seed = 2; seed <= 15; seed++) {
      const next = generateRemix(pool, fakeManifest(), { ...BASE, seed, manual });
      expect(next.picks.map((p) => p.rule)).toEqual(first.picks.map((p) => p.rule));
      expect(next.regions).toEqual(first.regions);
    }
  });

  it('leaves every OTHER category to the generator', () => {
    const pool = [
      iEarth, iWater, rxAir,
      rule('NOISE', 'WATER'), rule('NOISE', 'FIRE'),
      rule('PAD', 'EARTH'), rule('PAD', 'AIR'),
    ];
    const manifest = fakeManifest();
    const before = generateRemix(pool, manifest, { ...BASE });
    const after = generateRemix(pool, manifest, { ...BASE, manual: took(iWater) });
    const others = (d: typeof before) => d.tracks.filter((t) => t.category !== 'MELODY');
    expect(others(after)).toEqual(others(before));
    expect(after.regions.filter((r) => !r.trackId.startsWith('MELODY·')))
      .toEqual(before.regions.filter((r) => !r.trackId.startsWith('MELODY·')));
  });

  it('drops a choice whose rule is no longer in the pool', () => {
    const { picks, tracks } = generateRemix([iWater], fakeManifest(), {
      ...BASE, manual: took(iEarth, iWater), // iEarth is not in this pool
    });
    expect(tracks.map((t) => t.id)).toEqual(['MELODY·WATER']);
    expect(picks.map((p) => p.rule)).toEqual([iWater]);
  });

  it('ignores a choice the current scope filters out', () => {
    const { tracks } = generateRemix([iEarth, iWater], fakeManifest(), {
      ...BASE, element: 'WATER', manual: took(iEarth, iWater),
    });
    expect(tracks.map((t) => t.id)).toEqual(['MELODY·WATER']);
  });

  it('lets a Borrowed track take each section from a different element, on one file', () => {
    const pool = [iWater, rxAir, rtFire];
    const { tracks, picks } = generateRemix(pool, fakeManifest(), {
      ...BASE, sampleElement: 'ETHER', manual: took(iWater, rxAir, rtFire),
    });
    expect(tracks).toHaveLength(1);
    expect(tracks[0].sample.name).toBe('ETHER-MELODY');
    expect(picks.map((p) => p.rule.source.element)).toEqual(['WATER', 'AIR', 'FIRE']);
  });

  it('stays deterministic with the manual set as an input', () => {
    const pool = [iEarth, iWater, rxAir];
    const manual = took(iEarth, rxAir);
    const manifest = fakeManifest();
    expect(generateRemix(pool, manifest, { ...BASE, seed: 5, manual }))
      .toEqual(generateRemix(pool, manifest, { ...BASE, seed: 5, manual }));
  });
});

import { describe, it, expect } from 'vitest';
import { generateFreeMix } from './generateFreeMix';
import type { AuthoredRule } from './sessionRules';
import type { ArrTrack } from '@/arrange/types';

const track = (id: string, category: ArrTrack['category']): ArrTrack => ({
  id, category, label: id, sample: { name: id, path: `${id}.wav`, bytes: 1 }, ceilingDb: 0, locked: false,
});
const rule = (category: AuthoredRule['category'], phrases: AuthoredRule['phrases']): AuthoredRule => ({
  category, section: 'INTRODUCTION', phrases, source: { element: 'WATER', sessionId: 'w', track: category },
});

describe('generateFreeMix', () => {
  const melA = rule('MELODY', [{ enterSec: 100, exitSec: 200, fadeInSec: 0, fadeOutSec: 0 }]);
  const melB = rule('MELODY', [{ enterSec: 300, exitSec: 400, fadeInSec: 0, fadeOutSec: 0 }]);
  const pool = (c: string) => (c === 'MELODY' ? [melA, melB] : []);

  it('is deterministic for a seed and skips absent tracks', () => {
    const tracks = [track('m', 'MELODY'), track('b', 'BASS')]; // BASS pool empty → skipped
    const a = generateFreeMix(tracks, pool as never, 7);
    const b = generateFreeMix(tracks, pool as never, 7);
    expect(a.regions).toEqual(b.regions);
    expect(a.picks.map((p) => p.trackId)).toEqual(['m']); // BASS absent
  });

  it('forces a single-rule pool and emits one region per phrase', () => {
    const two = rule('PAD', [
      { enterSec: 0, exitSec: 120, fadeInSec: 0, fadeOutSec: 120 },
      { enterSec: 540, exitSec: 600, fadeInSec: 60, fadeOutSec: 0 },
    ]);
    const p = (c: string) => (c === 'PAD' ? [two] : []);
    const { regions } = generateFreeMix([track('p', 'PAD')], p as never, 1);
    expect(regions).toHaveLength(2);
    expect(regions.every((r) => r.trackId === 'p')).toBe(true);
    expect(regions[0]).toMatchObject({ enterSec: 0, exitSec: 120, fadeOutSec: 120 });
  });
});

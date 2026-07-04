import { describe, it, expect } from 'vitest';
import { trackScalarAt } from '@/arrange/trackScalar';
import { buildComposition } from '@/arrange/buildComposition';
import type { ArrTrack } from '@/arrange/types';
import { config } from '@/config';

const t = (id: string, category: ArrTrack['category']): ArrTrack => ({
  id, category, label: id, sample: { name: id, path: id, bytes: 1 }, ceilingDb: 0, locked: false,
});
const tracks = [t('n', 'NOISE'), t('pad', 'PAD')];
const comp = buildComposition({ tracks, tuningHz: 440, masterDb: 0 }, 30 * 60);
const { moduleSeconds: M, bridgeSeconds: B } = config.layerTwo;

describe('trackScalarAt', () => {
  it('is 0 before the session and after it ends', () => {
    expect(trackScalarAt(comp, tracks[0], -5)).toBe(0);
    expect(trackScalarAt(comp, tracks[0], comp.totalSec + 5)).toBe(0);
  });
  it('holds a bed track near 1 through a module', () => {
    expect(trackScalarAt(comp, tracks[0], M / 2)).toBeCloseTo(1, 3);
  });
  it('keeps a bed track present through a bridge overlap (carry-through)', () => {
    const midBridge = M - B / 2; // inside the mod-0/mod-1 overlap
    expect(trackScalarAt(comp, tracks[0], midBridge)).toBeGreaterThan(0.8);
  });
  it('is 0 for a track absent in the covering module (PAD in IMMERSION)', () => {
    const midImmersion = (M - B) + M / 2; // deep inside mod-1 (IMMERSION)
    expect(trackScalarAt(comp, tracks[1], midImmersion)).toBe(0);
  });
  it('never exceeds 1 anywhere in the session', () => {
    for (let s = 0; s <= comp.totalSec; s += M / 20) {
      for (const tr of tracks) expect(trackScalarAt(comp, tr, s)).toBeLessThanOrEqual(1);
    }
  });
});

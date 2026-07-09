import { describe, it, expect } from 'vitest';
import { generateComposition } from '@/arrange/generate/generateComposition';
import { trackScalarAt } from '@/arrange/trackScalar';
import type { ArrTrack } from '@/arrange/types';
import { config } from '@/config';

const t = (id: string, category: ArrTrack['category']): ArrTrack => ({
  id, category, label: id, sample: { name: id, path: id, bytes: 1 }, ceilingDb: 0, locked: false,
});
const input = {
  tracks: [t('n', 'NOISE'), t('e', 'ELEMENT'), t('iso', 'ISO'), t('pad', 'PAD')],
  tuningHz: 440,
  masterDb: 0,
};

describe('generateComposition', () => {
  it('builds a composition with a template per mode and a sequence', () => {
    const comp = generateComposition(input, 30 * 60, 'MODERATE', 1);
    for (const mode of config.layerTwo.modes) expect(comp.templates[mode].regions.length).toBeGreaterThan(0);
    expect(comp.sequence.length).toBe(3); // 30 min / 10-min modules
    expect(comp.tuningHz).toBe(440);
  });
  it('is deterministic for a given seed', () => {
    expect(generateComposition(input, 1800, 'MODERATE', 7))
      .toEqual(generateComposition(input, 1800, 'MODERATE', 7));
  });
  it('renders the ~1-min NOISE fade-in as a rising volume envelope', () => {
    const comp = generateComposition(input, 1800, 'MODERATE', 1);
    // Introduction instance covers [0,600]; NOISE fades in over 60s (canon 60, half 0).
    // At t=30 (halfway up the cosine ramp) the scalar is ~0.5, and clearly between 0 and 1.
    const noise = input.tracks[0];
    const mid = trackScalarAt(comp, noise, 30);
    expect(mid).toBeGreaterThan(0.3);
    expect(mid).toBeLessThan(0.7);
    // Fully in by t=120 (past the fade).
    expect(trackScalarAt(comp, noise, 120)).toBeGreaterThan(0.95);
  });
});

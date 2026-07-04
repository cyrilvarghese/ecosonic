import { describe, it, expect } from 'vitest';
import { buildComposition } from '@/arrange/buildComposition';
import type { ArrTrack } from '@/arrange/types';

const t = (id: string, category: ArrTrack['category']): ArrTrack => ({
  id, category, label: id, sample: { name: id, path: id, bytes: 1 }, ceilingDb: 0, locked: false,
});
const input = {
  tracks: [t('n', 'NOISE'), t('pad', 'PAD')],
  tuningHz: 440,
  masterDb: 0,
};

describe('buildComposition', () => {
  it('builds a template for every mode', () => {
    const c = buildComposition(input, 30 * 60);
    expect(Object.keys(c.templates).sort()).toEqual(['DEEP_RELAXATION', 'INTRODUCTION', 'RETURN']);
  });
  it('carries the selection and passthrough values', () => {
    const c = buildComposition(input, 30 * 60);
    expect(c.tracks).toHaveLength(2);
    expect(c.tuningHz).toBe(440);
    expect(c.masterDb).toBe(0);
  });
  it('has a sequence, bridges, and a positive totalSec', () => {
    const c = buildComposition(input, 30 * 60);
    expect(c.sequence.length).toBeGreaterThan(0);
    expect(c.bridges.length).toBe(c.sequence.length - 1);
    expect(c.totalSec).toBeGreaterThan(0);
  });
});

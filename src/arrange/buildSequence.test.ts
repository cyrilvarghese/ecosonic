import { describe, it, expect } from 'vitest';
import { buildSequence } from '@/arrange/buildSequence';
import { config } from '@/config';

const { moduleSeconds: M, bridgeSeconds: B } = config.layerTwo;

describe('buildSequence', () => {
  it('rounds duration to a module count (30 min → 3)', () => {
    const { sequence } = buildSequence(30 * 60);
    expect(sequence).toHaveLength(3);
  });
  it('always has at least one module', () => {
    expect(buildSequence(1).sequence).toHaveLength(1);
  });
  it('cycles the mode palette', () => {
    const { sequence } = buildSequence(40 * 60); // 4 modules
    expect(sequence.map((m) => m.mode)).toEqual(['RELAXATION', 'IMMERSION', 'RETURN', 'RELAXATION']);
  });
  it('overlaps consecutive modules by bridgeSeconds and reports totalSec', () => {
    const { sequence, bridges, totalSec } = buildSequence(30 * 60);
    expect(sequence[1].startSec).toBeCloseTo(M - B, 6);
    expect(bridges).toHaveLength(2);
    expect(bridges[0].overlapSec).toBe(B);
    expect(totalSec).toBeCloseTo(3 * M - 2 * B, 6);
  });
});

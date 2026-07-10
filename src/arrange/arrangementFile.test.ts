import { describe, it, expect } from 'vitest';
import { serializeArrangement, parseArrangement } from '@/arrange/arrangementFile';
import type { ArrTrack, TemplateRegion } from '@/arrange/types';

const tracks: ArrTrack[] = [
  { id: 'n', category: 'NOISE', label: 'n', sample: { name: 'noise.wav', path: 'w/noise.wav', bytes: 1 }, ceilingDb: 0, locked: false },
];
const regions: TemplateRegion[] = [{ trackId: 'n', enterSec: 0, exitSec: 600, fadeInSec: 60, fadeOutSec: 0 }];

describe('arrangement file', () => {
  it('round-trips through serialize → parse', () => {
    const text = serializeArrangement({ mode: 'INTRODUCTION', drift: 'MODERATE', regions, tracks });
    const file = parseArrangement(text);
    expect(file.version).toBe(1);
    expect(file.mode).toBe('INTRODUCTION');
    expect(file.drift).toBe('MODERATE');
    expect(file.regions).toEqual(regions);
    expect(file.tracks[0]).toEqual({ id: 'n', category: 'NOISE', sampleName: 'noise.wav', samplePath: 'w/noise.wav' });
  });
  it('rejects non-arrangement JSON and bad shapes', () => {
    expect(() => parseArrangement('{"hello":1}')).toThrow();
    expect(() => parseArrangement('not json at all')).toThrow();
    const wrongKind = JSON.stringify({ version: 1, kind: 'other', mode: 'INTRODUCTION', drift: 'MODERATE', regions: [], tracks: [] });
    expect(() => parseArrangement(wrongKind)).toThrow();
  });
});

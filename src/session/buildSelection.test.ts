import { describe, it, expect } from 'vitest';
import { buildManifest } from '@/session/manifestBuild';
import { buildSelection, pickCount, pickReplacement, sampleN } from '@/session/buildSelection';
import { config } from '@/config';
import type { Manifest } from '@/types';

// Deterministic PRNG for tests.
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function waterManifest(): Manifest {
  return buildManifest([
    { path: 'WATER/ISO/5hz.wav', bytes: 1 }, { path: 'WATER/ISO/6hz.wav', bytes: 1 },
    { path: 'WATER/ISO/7hz.wav', bytes: 1 }, { path: 'WATER/ISO/8hz.wav', bytes: 1 },
    { path: 'WATER/PLANET/EARTH.wav', bytes: 1 }, { path: 'WATER/PLANET/VENUS.wav', bytes: 1 },
    { path: 'WATER/NOISE/NOISE WATER.wav', bytes: 1 },
    { path: 'WATER/ELEMENT/OCEAN.wav', bytes: 1 }, { path: 'WATER/ELEMENT/RAIN.wav', bytes: 1 },
    { path: 'WATER/ELEMENT/WATER.wav', bytes: 1 }, { path: 'WATER/ELEMENT/XYLO.wav', bytes: 1 },
    { path: 'WATER/ELEMENT/SUB/WHALES.wav', bytes: 1 }, // excluded
    { path: 'WATER/SOUND/ARP/ARP.wav', bytes: 1 },      // excluded
    { path: 'WATER/SOUND/BASS/BASS.wav', bytes: 1 },
    { path: 'WATER/SOUND/PAD/PAD.wav', bytes: 1 },
    { path: 'WATER/SOUND/MELODY/MELODY.wav', bytes: 1 },
    { path: 'WATER/SOUND/FX/FX.wav', bytes: 1 }, { path: 'WATER/SOUND/FX/FX2.wav', bytes: 1 },
  ]);
}

describe('pickCount', () => {
  it('stays within [min,max] clamped to available', () => {
    const rng = mulberry32(1);
    for (let i = 0; i < 50; i++) {
      const n = pickCount(2, 3, 4, rng);
      expect(n).toBeGreaterThanOrEqual(2);
      expect(n).toBeLessThanOrEqual(3);
    }
  });
  it('clamps to availability', () => {
    expect(pickCount(2, 3, 1, mulberry32(1))).toBe(1);
    expect(pickCount(1, 2, 0, mulberry32(1))).toBe(0);
  });
});

describe('sampleN', () => {
  it('returns n distinct items', () => {
    const out = sampleN([1, 2, 3, 4], 2, mulberry32(7));
    expect(out).toHaveLength(2);
    expect(new Set(out).size).toBe(2);
  });
});

describe('buildSelection', () => {
  const tracks = buildSelection('WATER', waterManifest(), config, mulberry32(42));
  const byCat = (c: string) => tracks.filter((t) => t.category === c);

  it('honors fixed counts and ranges from config', () => {
    expect(byCat('ISO')).toHaveLength(1);
    expect(byCat('PLANET')).toHaveLength(2);
    expect(byCat('NOISE')).toHaveLength(1);
    expect(byCat('BASS')).toHaveLength(1);
    expect(byCat('PAD')).toHaveLength(1);
    expect(byCat('MELODY')).toHaveLength(1);
    expect(byCat('ELEMENT').length).toBeGreaterThanOrEqual(2);
    expect(byCat('ELEMENT').length).toBeLessThanOrEqual(3);
    expect(byCat('FX').length).toBeGreaterThanOrEqual(1);
    expect(byCat('FX').length).toBeLessThanOrEqual(2);
  });

  it('labels multi-sample categories A/B and single ones plainly', () => {
    expect(byCat('PLANET').map((t) => t.label)).toEqual(['PLANETS A', 'PLANETS B']);
    expect(byCat('ISO')[0].label).toBe('ISO');
  });

  it('selects ARP and ELEMENT/SUB samples', () => {
    expect(byCat('ARP')).toHaveLength(1);
    expect(byCat('ELEMENT_SUB').length).toBeGreaterThanOrEqual(1);
    expect(tracks.some((t) => t.sample.path.includes('/ARP/'))).toBe(true);
    expect(tracks.some((t) => t.sample.path.includes('/SUB/'))).toBe(true);
  });

  it('applies default volume and unique ids', () => {
    expect(tracks.every((t) => t.volumeDb === config.audio.volume.defaultTrackDb)).toBe(true);
    expect(new Set(tracks.map((t) => t.id)).size).toBe(tracks.length);
  });
});

describe('pickReplacement', () => {
  it('returns a different sample when the pool has alternatives', () => {
    const pool = waterManifest().WATER.ISO;
    const next = pickReplacement(pool, 'WATER/ISO/5hz.wav', mulberry32(3));
    expect(next).not.toBeNull();
    expect(next!.path).not.toBe('WATER/ISO/5hz.wav');
  });
  it('returns the only sample if that is all there is', () => {
    const pool = waterManifest().WATER.NOISE;
    const next = pickReplacement(pool, pool[0].path, mulberry32(3));
    expect(next!.path).toBe(pool[0].path);
  });
  it('returns null for an empty pool', () => {
    expect(pickReplacement([], 'x', mulberry32(3))).toBeNull();
  });
});

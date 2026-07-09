import { describe, it, expect } from 'vitest';
import { generateModeTemplate } from '@/arrange/generate/generateModeTemplate';
import type { ArrTrack } from '@/arrange/types';
import { config } from '@/config';

const D = config.layerTwo.moduleSeconds;
const t = (id: string, category: ArrTrack['category']): ArrTrack => ({
  id, category, label: id, sample: { name: id, path: id, bytes: 1 }, ceilingDb: 0, locked: false,
});
const introTracks: ArrTrack[] = [
  t('n', 'NOISE'), t('e', 'ELEMENT'), t('iso', 'ISO'), t('pl', 'PLANET'),
  t('pad', 'PAD'), t('bass', 'BASS'), t('arp', 'ARP'), t('mel', 'MELODY'),
];
const byTrack = (tpl: ReturnType<typeof generateModeTemplate>, id: string) =>
  tpl.regions.find((r) => r.trackId === id);

describe('generateModeTemplate', () => {
  it('is deterministic for a given (mode, drift, seed)', () => {
    const a = generateModeTemplate(introTracks, 'INTRODUCTION', 'MODERATE', 123);
    const b = generateModeTemplate(introTracks, 'INTRODUCTION', 'MODERATE', 123);
    expect(a).toEqual(b);
  });
  it('varies with the seed', () => {
    const a = generateModeTemplate(introTracks, 'INTRODUCTION', 'MODERATE', 1);
    const b = generateModeTemplate(introTracks, 'INTRODUCTION', 'MODERATE', 2);
    expect(a).not.toEqual(b);
  });
  it('keeps bottom-up entrance order across 50 seeds (ISO ≤ PLANET ≤ PAD ≤ BASS ≤ MELODY)', () => {
    for (let s = 0; s < 50; s++) {
      const tpl = generateModeTemplate(introTracks, 'INTRODUCTION', 'MODERATE', s);
      const e = (id: string) => byTrack(tpl, id)?.enterSec ?? Infinity;
      expect(e('iso')).toBeLessThanOrEqual(e('pl'));
      expect(e('pl')).toBeLessThanOrEqual(e('pad'));
      expect(e('pad')).toBeLessThanOrEqual(e('bass'));
      if (byTrack(tpl, 'mel')) expect(e('bass')).toBeLessThanOrEqual(e('mel'));
    }
  });
  it('STRICT hugs the canonical value (ISO enter near 60)', () => {
    for (let s = 0; s < 20; s++) {
      const iso = byTrack(generateModeTemplate(introTracks, 'INTRODUCTION', 'STRICT', s), 'iso')!;
      expect(Math.abs(iso.enterSec - 60)).toBeLessThanOrEqual(20 * 0.15 + 0.001);
    }
  });
  it('forces all layers present under STRICT (MELODY always appears)', () => {
    for (let s = 0; s < 20; s++) {
      expect(byTrack(generateModeTemplate(introTracks, 'INTRODUCTION', 'STRICT', s), 'mel')).toBeDefined();
    }
  });
  it('NOISE spans the module with no fade-out in INTRODUCTION', () => {
    const noise = byTrack(generateModeTemplate(introTracks, 'INTRODUCTION', 'EXPLORATORY', 5), 'n')!;
    expect(noise.enterSec).toBe(0);
    expect(noise.exitSec).toBe(D);
    expect(noise.fadeOutSec).toBe(0);
  });
  it('BASS enters with no fade-in (R4 exception)', () => {
    const bass = byTrack(generateModeTemplate(introTracks, 'INTRODUCTION', 'MODERATE', 8), 'bass')!;
    expect(bass.fadeInSec).toBe(0);
  });
  it('DEEP_RELAXATION drops all drivers', () => {
    const deep = generateModeTemplate(introTracks, 'DEEP_RELAXATION', 'MODERATE', 4);
    for (const id of ['pad', 'bass', 'arp', 'mel']) expect(byTrack(deep, id)).toBeUndefined();
    expect(byTrack(deep, 'n')).toBeDefined();
    expect(byTrack(deep, 'iso')).toBeDefined();
  });
  it('staggers a 2nd Element past secondElementEnterSec', () => {
    const tpl = generateModeTemplate([t('e0', 'ELEMENT'), t('e1', 'ELEMENT')], 'INTRODUCTION', 'MODERATE', 2);
    expect(byTrack(tpl, 'e0')!.enterSec).toBe(0);
    expect(byTrack(tpl, 'e1')!.enterSec).toBeGreaterThanOrEqual(config.layerTwo.secondElementEnterSec);
  });
  it('caps each fade to half the clip width', () => {
    const tpl = generateModeTemplate(introTracks, 'INTRODUCTION', 'EXPLORATORY', 11);
    for (const r of tpl.regions) {
      const half = (r.exitSec - r.enterSec) / 2;
      expect(r.fadeInSec).toBeLessThanOrEqual(half + 1e-9);
      expect(r.fadeOutSec).toBeLessThanOrEqual(half + 1e-9);
    }
  });
});

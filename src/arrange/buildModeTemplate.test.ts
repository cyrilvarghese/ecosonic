import { describe, it, expect } from 'vitest';
import { buildModeTemplate } from '@/arrange/buildModeTemplate';
import type { ArrTrack } from '@/arrange/types';
import { config } from '@/config';

const D = config.layerTwo.moduleSeconds;
const t = (id: string, category: ArrTrack['category']): ArrTrack => ({
  id, category, label: id, sample: { name: id, path: id, bytes: 1 }, ceilingDb: 0, locked: false,
});
const tracks: ArrTrack[] = [
  t('n', 'NOISE'), t('i', 'ISO'), t('pad', 'PAD'), t('bass', 'BASS'), t('fx', 'FX'),
];
const byTrack = (tpl: ReturnType<typeof buildModeTemplate>, id: string) =>
  tpl.regions.find((r) => r.trackId === id);

describe('buildModeTemplate', () => {
  it('NOISE (bed) spans the module in INTRODUCTION', () => {
    const tpl = buildModeTemplate(tracks, 'INTRODUCTION');
    const noise = byTrack(tpl, 'n')!;
    expect(noise.enterSec).toBe(0);
    expect(noise.exitSec).toBe(D);
  });
  it('staggers entries per the timing table (ISO before PAD before BASS)', () => {
    const tpl = buildModeTemplate(tracks, 'INTRODUCTION');
    const iso = byTrack(tpl, 'i')!, pad = byTrack(tpl, 'pad')!, bass = byTrack(tpl, 'bass')!;
    expect(iso.enterSec).toBeLessThan(pad.enterSec);
    expect(pad.enterSec).toBeLessThan(bass.enterSec);
  });
  it('drops absent categories in DEEP_RELAXATION (no musical layers)', () => {
    const tpl = buildModeTemplate(tracks, 'DEEP_RELAXATION');
    expect(byTrack(tpl, 'pad')).toBeUndefined();
    expect(byTrack(tpl, 'bass')).toBeUndefined();
    expect(byTrack(tpl, 'fx')).toBeUndefined();
    expect(byTrack(tpl, 'n')).toBeDefined();
    expect(byTrack(tpl, 'i')).toBeDefined();
  });
  it('density (overlapping regions) peaks near the module midpoint in INTRODUCTION', () => {
    const tpl = buildModeTemplate(tracks, 'INTRODUCTION');
    const count = (s: number) => tpl.regions.filter((r) => s > r.enterSec && s < r.exitSec).length;
    expect(count(D / 2)).toBeGreaterThan(count(D * 0.05));
    expect(count(D / 2)).toBeGreaterThan(count(D * 0.95));
  });
  it('caps a clip fade to half its width', () => {
    const tpl = buildModeTemplate(tracks, 'INTRODUCTION');
    for (const r of tpl.regions) {
      const half = (r.exitSec - r.enterSec) / 2;
      expect(r.fadeInSec).toBeLessThanOrEqual(half);
      expect(r.fadeOutSec).toBeLessThanOrEqual(half);
    }
  });
  it('places ARP in Introduction and Sub-Elements only in Deep Relaxation', () => {
    const pair: ArrTrack[] = [t('arp', 'ARP'), t('sub', 'ELEMENT_SUB')];
    const intro = buildModeTemplate(pair, 'INTRODUCTION');
    expect(byTrack(intro, 'arp')).toBeDefined();
    expect(byTrack(intro, 'sub')).toBeUndefined();
    const deep = buildModeTemplate(pair, 'DEEP_RELAXATION');
    expect(byTrack(deep, 'arp')).toBeUndefined();
    expect(byTrack(deep, 'sub')).toBeDefined();
  });
  it('places DRONE near PAD in INTRODUCTION and omits it in DEEP_RELAXATION', () => {
    const withDrone: ArrTrack[] = [t('n', 'NOISE'), t('drone', 'DRONE'), t('pad', 'PAD')];
    const intro = buildModeTemplate(withDrone, 'INTRODUCTION');
    const drone = byTrack(intro, 'drone')!, pad = byTrack(intro, 'pad')!;
    expect(drone).toBeDefined();
    expect(drone.enterSec).toBeGreaterThan(0);            // a mid-module swell, not a bed
    expect(drone.enterSec).toBeLessThanOrEqual(pad.enterSec); // sits at/just under PAD
    expect(byTrack(buildModeTemplate(withDrone, 'DEEP_RELAXATION'), 'drone')).toBeUndefined();
  });

  it('staggers a 2nd Element later than the 1st', () => {
    const tpl = buildModeTemplate([t('e0', 'ELEMENT'), t('e1', 'ELEMENT')], 'INTRODUCTION');
    const e0 = byTrack(tpl, 'e0')!, e1 = byTrack(tpl, 'e1')!;
    expect(e0.enterSec).toBe(0);
    expect(e1.enterSec).toBeGreaterThan(e0.enterSec);
  });
});

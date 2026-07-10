import { describe, it, expect, beforeEach } from 'vitest';
import { createArrangementStore } from '@/arrange/arrangementStore';
import type { ArrTrack } from '@/arrange/types';
import { config } from '@/config';

const t = (id: string, category: ArrTrack['category']): ArrTrack => ({
  id, category, label: id, sample: { name: id, path: id, bytes: 1 }, ceilingDb: 0, locked: false,
});
const sel = { element: 'WATER' as const, tracks: [t('n', 'NOISE'), t('pad', 'PAD')], tuningHz: 440, masterDb: 0 };
const selLive = { element: 'WATER' as const, tracks: [t('n', 'NOISE'), t('pad', 'PAD'), t('mel', 'MELODY')], tuningHz: 440, masterDb: 0 };
const D = config.layerTwo.moduleSeconds;

describe('arrangementStore', () => {
  let store: ReturnType<typeof createArrangementStore>;
  beforeEach(() => { store = createArrangementStore(); });

  it('starts empty and not playing', () => {
    const s = store.getState();
    expect(s.moduleRegions).toHaveLength(0);
    expect(s.playing).toBe(false);
    expect(s.positionSec).toBe(0);
  });
  it('initFrom seeds the module from the mode table (bed spans it, drivers stagger)', () => {
    store.getState().initFrom(sel, 30);
    const regions = store.getState().moduleRegions;
    expect(regions).toHaveLength(2);
    const noise = regions.find((r) => r.trackId === 'n')!; // continuity bed
    const pad = regions.find((r) => r.trackId === 'pad')!; // driver
    expect(noise.enterSec).toBe(0);
    expect(noise.exitSec).toBe(D);
    expect(pad.exitSec - pad.enterSec).toBeLessThan(D); // staggered, not full-length
    expect(store.getState().element).toBe('WATER');
  });
  it('updateModuleRegion drags a clip and keeps fades within the width', () => {
    store.getState().initFrom(sel, 30);
    store.getState().updateModuleRegion('pad', { enterSec: 100, exitSec: 108 });
    const r = store.getState().moduleRegions.find((x) => x.trackId === 'pad')!;
    expect(r.enterSec).toBe(100);
    expect(r.exitSec).toBe(108);
    expect(r.fadeInSec).toBeLessThanOrEqual((108 - 100) / 2);
  });
  it('play/pause and clamp position to the module length', () => {
    store.getState().initFrom(sel, 30);
    store.getState().play();
    expect(store.getState().playing).toBe(true);
    store.getState().seek(999999);
    expect(store.getState().positionSec).toBe(D);
    store.getState().seek(-10);
    expect(store.getState().positionSec).toBe(0);
    store.getState().pause();
    expect(store.getState().playing).toBe(false);
  });
  it('generateModule reseeds the module for the active mode and defaults drift to MODERATE', () => {
    store.getState().initFrom(sel, 30);
    expect(store.getState().drift).toBe('MODERATE');
    store.getState().generateModule();
    const regions = store.getState().moduleRegions;
    expect(regions.length).toBeGreaterThan(0);
    const noise = regions.find((r) => r.trackId === 'n')!;
    expect(noise.enterSec).toBe(0); // NOISE still spans as the continuity bed
    expect(noise.exitSec).toBe(D);
  });
  it('setDrift changes the drift used by generateModule', () => {
    store.getState().initFrom(sel, 30);
    store.getState().setDrift('STRICT');
    expect(store.getState().drift).toBe('STRICT');
    store.getState().generateModule();
    expect(store.getState().moduleRegions.length).toBeGreaterThan(0);
  });

  it('live defaults to false and toggles', () => {
    expect(store.getState().live).toBe(false);
    store.getState().setLive(true);
    expect(store.getState().live).toBe(true);
  });
  it('steer redraws only the future and leaves position/playing untouched', () => {
    store.getState().initFrom(selLive, 30);
    store.getState().play();
    store.getState().seek(300);
    const before = store.getState().moduleRegions;
    const noiseBefore = before.find((r) => r.trackId === 'n')!;
    store.getState().steer();
    const after = store.getState().moduleRegions;
    expect(store.getState().positionSec).toBe(300);
    expect(store.getState().playing).toBe(true);
    const noiseAfter = after.find((r) => r.trackId === 'n')!;
    expect(noiseAfter.enterSec).toBe(noiseBefore.enterSec); // active bed keeps its entrance
    const mel = after.find((r) => r.trackId === 'mel');
    if (mel) expect(mel.enterSec).toBeGreaterThan(300); // pending layer redrew into the future
  });
  it('setDrift while live+playing steers; while not live it only sets drift', () => {
    store.getState().initFrom(selLive, 30);
    store.getState().seek(120);
    const frozen = store.getState().moduleRegions;
    store.getState().setDrift('EXPLORATORY'); // not live, not playing → regions untouched
    expect(store.getState().moduleRegions).toBe(frozen);
    store.getState().play();
    store.getState().setLive(true);
    store.getState().setDrift('STRICT'); // live steer
    expect(store.getState().drift).toBe('STRICT');
    expect(store.getState().moduleRegions).not.toBe(frozen);
  });
  it('steer accepts an IN_NEXT nudge', () => {
    store.getState().initFrom(selLive, 30);
    store.getState().play();
    store.getState().seek(60);
    store.getState().steer({ kind: 'IN_NEXT', trackId: 'mel' });
    const mel = store.getState().moduleRegions.find((r) => r.trackId === 'mel')!;
    expect(mel.enterSec).toBeCloseTo(61, 5); // t + IN_NEXT_DELAY_SEC
  });
  it('importArrangement applies mode, drift and known-track regions, resetting position', () => {
    store.getState().initFrom(sel, 30);
    store.getState().seek(200);
    store.getState().importArrangement({
      version: 1, kind: 'ecosonic-arrangement', mode: 'RETURN', drift: 'STRICT',
      regions: [
        { trackId: 'n', enterSec: 0, exitSec: 600, fadeInSec: 60, fadeOutSec: 60 },
        { trackId: 'ghost', enterSec: 10, exitSec: 20, fadeInSec: 0, fadeOutSec: 0 }, // unknown track: dropped
      ],
      tracks: [],
    });
    const s = store.getState();
    expect(s.activeMode).toBe('RETURN');
    expect(s.drift).toBe('STRICT');
    expect(s.positionSec).toBe(0);
    expect(s.moduleRegions.map((r) => r.trackId)).toEqual(['n']);
  });
});

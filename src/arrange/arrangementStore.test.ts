import { describe, it, expect, beforeEach } from 'vitest';
import { createArrangementStore } from '@/arrange/arrangementStore';
import type { ArrTrack } from '@/arrange/types';
import { config } from '@/config';

const t = (id: string, category: ArrTrack['category']): ArrTrack => ({
  id, category, label: id, sample: { name: id, path: id, bytes: 1 }, ceilingDb: 0, locked: false,
});
const sel = { tracks: [t('n', 'NOISE'), t('pad', 'PAD')], tuningHz: 440, masterDb: 0 };
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
  it('initFrom seeds every track full-length (present the whole module)', () => {
    store.getState().initFrom(sel, 30);
    const regions = store.getState().moduleRegions;
    expect(regions).toHaveLength(2);
    expect(regions[0].enterSec).toBe(0);
    expect(regions[0].exitSec).toBe(D);
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
});

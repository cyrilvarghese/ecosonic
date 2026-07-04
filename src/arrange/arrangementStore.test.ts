import { describe, it, expect, beforeEach } from 'vitest';
import { createArrangementStore } from '@/arrange/arrangementStore';
import type { ArrTrack } from '@/arrange/types';

const t = (id: string, category: ArrTrack['category']): ArrTrack => ({
  id, category, label: id, sample: { name: id, path: id, bytes: 1 }, ceilingDb: 0, locked: false,
});
const sel = { tracks: [t('n', 'NOISE'), t('pad', 'PAD')], tuningHz: 440, masterDb: 0 };

describe('arrangementStore', () => {
  let store: ReturnType<typeof createArrangementStore>;
  beforeEach(() => { store = createArrangementStore(); });

  it('starts empty and not playing', () => {
    const s = store.getState();
    expect(s.composition).toBeNull();
    expect(s.playing).toBe(false);
    expect(s.positionSec).toBe(0);
  });
  it('initFrom builds a composition for the duration', () => {
    store.getState().initFrom(sel, 30);
    const c = store.getState().composition!;
    expect(c.sequence).toHaveLength(3);
    expect(store.getState().durationMin).toBe(30);
  });
  it('setDurationMin rebuilds the sequence', () => {
    store.getState().initFrom(sel, 30);
    store.getState().setDurationMin(40);
    expect(store.getState().composition!.sequence).toHaveLength(4);
  });
  it('play/pause/seek update playback state and clamp position', () => {
    store.getState().initFrom(sel, 30);
    const total = store.getState().composition!.totalSec;
    store.getState().play();
    expect(store.getState().playing).toBe(true);
    store.getState().seek(999999);
    expect(store.getState().positionSec).toBe(total);
    store.getState().seek(-10);
    expect(store.getState().positionSec).toBe(0);
    store.getState().pause();
    expect(store.getState().playing).toBe(false);
  });
});

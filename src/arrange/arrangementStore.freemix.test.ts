import { describe, it, expect } from 'vitest';
import { createArrangementStore } from './arrangementStore';

describe('playFreeMix', () => {
  it('loads regions, sets duration, starts single-module playback', () => {
    const store = createArrangementStore();
    const regions = [{ trackId: 't', enterSec: 0, exitSec: 100, fadeInSec: 0, fadeOutSec: 0 }];
    store.getState().playFreeMix(regions, 1800);
    const s = store.getState();
    expect(s.moduleRegions).toEqual(regions);
    expect(s.durationSec).toBe(1800);
    expect(s.session).toBeNull();
    expect(s.playing).toBe(true);
  });

  it('clamps setPosition to the free-mix duration, not the module length', () => {
    const store = createArrangementStore();
    store.getState().playFreeMix([], 1800);
    store.getState().setPosition(1500);
    expect(store.getState().positionSec).toBe(1500); // would clamp to 600 under the old module clamp
  });
});

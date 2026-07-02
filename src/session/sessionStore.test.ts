import { describe, it, expect, beforeEach } from 'vitest';
import { buildManifest } from '@/session/manifestBuild';
import { createSessionStore } from '@/session/sessionStore';
import { config } from '@/config';
import type { Manifest } from '@/types';

function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function manifest(): Manifest {
  return buildManifest([
    { path: 'WATER/ISO/5hz.wav', bytes: 1 }, { path: 'WATER/ISO/6hz.wav', bytes: 1 },
    { path: 'WATER/ISO/7hz.wav', bytes: 1 }, { path: 'WATER/ISO/8hz.wav', bytes: 1 },
    { path: 'WATER/PLANET/EARTH.wav', bytes: 1 }, { path: 'WATER/PLANET/VENUS.wav', bytes: 1 },
    { path: 'WATER/NOISE/NOISE WATER.wav', bytes: 1 },
    { path: 'WATER/ELEMENT/OCEAN.wav', bytes: 1 }, { path: 'WATER/ELEMENT/RAIN.wav', bytes: 1 },
    { path: 'WATER/ELEMENT/WATER.wav', bytes: 1 },
    { path: 'WATER/SOUND/BASS/BASS.wav', bytes: 1 }, { path: 'WATER/SOUND/PAD/PAD.wav', bytes: 1 },
    { path: 'WATER/SOUND/MELODY/MELODY.wav', bytes: 1 }, { path: 'WATER/SOUND/FX/FX.wav', bytes: 1 },
  ]);
}

function makeStore() {
  return createSessionStore({ manifest: manifest(), cfg: config, rng: mulberry32(42) });
}

describe('sessionStore', () => {
  let store: ReturnType<typeof makeStore>;
  beforeEach(() => { store = makeStore(); });

  it('starts empty with config defaults', () => {
    const s = store.getState();
    expect(s.project.element).toBeNull();
    expect(s.project.tracks).toHaveLength(0);
    expect(s.project.masterVolumeDb).toBe(config.audio.volume.defaultMasterDb);
    expect(s.globalPlaying).toBe(false);
  });

  it('selectElement builds tracks', () => {
    store.getState().selectElement('WATER');
    const s = store.getState();
    expect(s.project.element).toBe('WATER');
    expect(s.project.tracks.length).toBeGreaterThan(0);
  });

  it('clamps track volume to the track range and master to the master range', () => {
    store.getState().selectElement('WATER');
    const id = store.getState().project.tracks[0].id;
    // Track slider is a centered boost/cut span (trackMinDb..trackMaxDb).
    store.getState().setTrackVolumeDb(id, 999);
    expect(store.getState().project.tracks[0].volumeDb).toBe(config.audio.volume.trackMaxDb);
    store.getState().setTrackVolumeDb(id, -999);
    expect(store.getState().project.tracks[0].volumeDb).toBe(config.audio.volume.trackMinDb);
    // Master keeps its own attenuation-only range (minDb..maxDb).
    store.getState().setMasterVolumeDb(99);
    expect(store.getState().project.masterVolumeDb).toBe(config.audio.volume.maxDb);
    store.getState().setMasterVolumeDb(-999);
    expect(store.getState().project.masterVolumeDb).toBe(config.audio.volume.minDb);
  });

  it('toggles mute, lock, and per-track play', () => {
    store.getState().selectElement('WATER');
    const id = store.getState().project.tracks[0].id;
    store.getState().toggleMute(id);
    expect(store.getState().project.tracks[0].muted).toBe(true);
    store.getState().toggleTrackPlaying(id);
    expect(store.getState().project.tracks[0].playing).toBe(false);
    store.getState().toggleLock(id);
    expect(store.getState().project.tracks[0].locked).toBe(true);
  });

  it('changeTrack swaps an unlocked sample but not a locked one', () => {
    store.getState().selectElement('WATER');
    const iso = store.getState().project.tracks.find((t) => t.category === 'ISO')!;
    const before = iso.sample.path;
    store.getState().changeTrack(iso.id);
    const after = store.getState().project.tracks.find((t) => t.id === iso.id)!.sample.path;
    expect(after).not.toBe(before); // ISO pool has 4 samples

    store.getState().toggleLock(iso.id);
    const locked = store.getState().project.tracks.find((t) => t.id === iso.id)!.sample.path;
    store.getState().changeTrack(iso.id);
    expect(store.getState().project.tracks.find((t) => t.id === iso.id)!.sample.path).toBe(locked);
  });

  it('regenerate re-rolls unlocked tracks only', () => {
    store.getState().selectElement('WATER');
    const iso = store.getState().project.tracks.find((t) => t.category === 'ISO')!;
    store.getState().toggleLock(iso.id);
    const lockedPath = store.getState().project.tracks.find((t) => t.id === iso.id)!.sample.path;
    store.getState().regenerate();
    expect(store.getState().project.tracks.find((t) => t.id === iso.id)!.sample.path).toBe(lockedPath);
  });

  it('toggleGlobalPlaying and backToChooser', () => {
    store.getState().selectElement('WATER');
    store.getState().toggleGlobalPlaying();
    expect(store.getState().globalPlaying).toBe(true);
    store.getState().backToChooser();
    expect(store.getState().project.element).toBeNull();
    expect(store.getState().globalPlaying).toBe(false);
  });
});

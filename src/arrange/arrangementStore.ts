'use client';
import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';
import type { ElementName } from '@/types';
import type { ArrTrack, Composition, Drift, Mode, TemplateRegion } from '@/arrange/types';
import { buildComposition } from '@/arrange/buildComposition';
import { buildModeTemplate } from '@/arrange/buildModeTemplate';
import { generateModeTemplate } from '@/arrange/generate/generateModeTemplate';
import { steerModule, type SteerNudge } from '@/arrange/generate/steerModule';
import { config } from '@/config';

type Selection = { element: ElementName | null; tracks: ArrTrack[]; tuningHz: number; masterDb: number };

export interface ArrangementState {
  // Phase 1 — a single module being designed: the handed-off tracks as clips on a timeline.
  element: ElementName | null;
  tracks: ArrTrack[];
  moduleRegions: TemplateRegion[];
  trackDurations: Record<string, number>; // real sample length (sec), filled once loaded
  playing: boolean;
  positionSec: number;
  scrubbing: boolean; // true while dragging the position slider — holds the clock
  masterDb: number;
  // Phase 2 machinery (built + tested, not yet surfaced in the UI).
  composition: Composition | null;
  durationMin: number;
  activeMode: Mode;
  drift: Drift;
  live: boolean;

  initFrom: (sel: Selection, durationMin: number) => void;
  setDurationMin: (min: number) => void;
  play: () => void;
  pause: () => void;
  seek: (sec: number) => void;
  setPosition: (sec: number) => void;
  setScrubbing: (b: boolean) => void;
  setActiveMode: (mode: Mode) => void;
  /** Pick a mode: reseed the module's clips from that mode's density table. */
  loadMode: (mode: Mode) => void;
  setDrift: (d: Drift) => void;
  /** Reseed the module's clips from the generative grammar for the active mode. */
  generateModule: () => void;
  setLive: (b: boolean) => void;
  /** Live steering: redraw the un-played future (optionally with a nudge), spliced at the playhead. */
  steer: (nudge?: SteerNudge) => void;
  /** Drag a track's clip: set when it enters/exits the module. */
  updateModuleRegion: (trackId: string, next: { enterSec: number; exitSec: number }) => void;
  setTrackDuration: (trackId: string, sec: number) => void;
  /** Set a track's volume ceiling (dB) — the max level its clip reaches. Inherited from Layer One. */
  setTrackCeilingDb: (trackId: string, db: number) => void;
}

const clampModule = (sec: number) => Math.max(0, Math.min(config.layerTwo.moduleSeconds, sec));

/** Seed the module from a mode's density table (continuity bed spans the module; active/sparse
 *  drivers stagger toward the peak). */
function seedModuleFromTable(tracks: ArrTrack[], mode: Mode): TemplateRegion[] {
  return buildModeTemplate(tracks, mode, config).regions;
}

export function createArrangementStore() {
  return createStore<ArrangementState>((set, get) => {
    let selection: Selection | null = null;
    let genSeed = 1;
    let steerSeed = 1;
    return {
      element: null,
      tracks: [],
      moduleRegions: [],
      trackDurations: {},
      playing: false,
      positionSec: 0,
      scrubbing: false,
      masterDb: 0,
      composition: null,
      durationMin: 30,
      activeMode: 'INTRODUCTION',
      drift: 'MODERATE',
      live: false,

      initFrom: (sel, durationMin) => {
        selection = sel;
        set({
          element: sel.element,
          tracks: sel.tracks,
          activeMode: config.layerTwo.modes[0],
          moduleRegions: seedModuleFromTable(sel.tracks, config.layerTwo.modes[0]),
          trackDurations: {},
          masterDb: sel.masterDb,
          playing: false,
          positionSec: 0,
          composition: buildComposition(sel, durationMin * 60),
          durationMin,
        });
      },
      setDurationMin: (min) => {
        if (!selection) { set({ durationMin: min }); return; }
        set({ composition: buildComposition(selection, min * 60), durationMin: min });
      },
      play: () => set({ playing: true }),
      pause: () => set({ playing: false }),
      seek: (sec) => set({ positionSec: clampModule(sec) }),
      setPosition: (sec) => set({ positionSec: clampModule(sec) }),
      setScrubbing: (b) => set({ scrubbing: b }),
      setActiveMode: (mode) => set({ activeMode: mode }),
      loadMode: (mode) =>
        set({ activeMode: mode, moduleRegions: seedModuleFromTable(get().tracks, mode), positionSec: 0 }),
      setDrift: (d) => {
        set({ drift: d });
        const s = get();
        if (s.live && s.playing) s.steer(); // a live drift change is itself a steer (spec §3)
      },
      generateModule: () =>
        set((s) => ({
          moduleRegions: generateModeTemplate(s.tracks, s.activeMode, s.drift, genSeed++, config).regions,
          positionSec: 0,
        })),
      setLive: (b) => set({ live: b }),
      steer: (nudge) =>
        set((s) => ({
          moduleRegions: steerModule(s.moduleRegions, s.positionSec, s.tracks, s.activeMode, s.drift, steerSeed++, nudge),
        })),
      setTrackDuration: (trackId, sec) =>
        set((s) => (s.trackDurations[trackId] === sec ? {} : { trackDurations: { ...s.trackDurations, [trackId]: sec } })),
      setTrackCeilingDb: (trackId, db) =>
        set((s) => ({ tracks: s.tracks.map((t) => (t.id === trackId ? { ...t, ceilingDb: db } : t)) })),
      updateModuleRegion: (trackId, next) =>
        set((s) => {
          const width = Math.max(0.001, next.exitSec - next.enterSec);
          return {
            moduleRegions: s.moduleRegions.map((r) =>
              r.trackId === trackId
                ? {
                    ...r,
                    enterSec: next.enterSec,
                    exitSec: next.exitSec,
                    fadeInSec: Math.min(r.fadeInSec, width / 2),
                    fadeOutSec: Math.min(r.fadeOutSec, width / 2),
                  }
                : r,
            ),
          };
        }),
    };
  });
}

export const arrangementStore = createArrangementStore();
export function useArrangement<T>(selector: (s: ArrangementState) => T): T {
  return useStore(arrangementStore, selector);
}

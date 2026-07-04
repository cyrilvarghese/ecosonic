'use client';
import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';
import type { ArrTrack, Composition, Mode, TemplateRegion } from '@/arrange/types';
import { buildComposition } from '@/arrange/buildComposition';
import { config } from '@/config';

type Selection = { tracks: ArrTrack[]; tuningHz: number; masterDb: number };

export interface ArrangementState {
  // Phase 1 — a single module being designed: the handed-off tracks as clips on a timeline.
  tracks: ArrTrack[];
  moduleRegions: TemplateRegion[];
  trackDurations: Record<string, number>; // real sample length (sec), filled once loaded
  playing: boolean;
  positionSec: number;
  masterDb: number;
  // Phase 2 machinery (built + tested, not yet surfaced in the UI).
  composition: Composition | null;
  durationMin: number;
  activeMode: Mode;

  initFrom: (sel: Selection, durationMin: number) => void;
  setDurationMin: (min: number) => void;
  play: () => void;
  pause: () => void;
  seek: (sec: number) => void;
  setPosition: (sec: number) => void;
  setActiveMode: (mode: Mode) => void;
  /** Drag a track's clip: set when it enters/exits the module. */
  updateModuleRegion: (trackId: string, next: { enterSec: number; exitSec: number }) => void;
  setTrackDuration: (trackId: string, sec: number) => void;
}

const clampModule = (sec: number) => Math.max(0, Math.min(config.layerTwo.moduleSeconds, sec));

/** Seed: every handed-off track present for the whole module (like Layer One), draggable from there. */
function seedFlatModule(tracks: ArrTrack[]): TemplateRegion[] {
  const D = config.layerTwo.moduleSeconds;
  const fade = Math.min(config.layerTwo.regionFadeSeconds, D / 2);
  return tracks.map((t) => ({ trackId: t.id, enterSec: 0, exitSec: D, fadeInSec: fade, fadeOutSec: fade }));
}

export function createArrangementStore() {
  return createStore<ArrangementState>((set) => {
    let selection: Selection | null = null;
    return {
      tracks: [],
      moduleRegions: [],
      trackDurations: {},
      playing: false,
      positionSec: 0,
      masterDb: 0,
      composition: null,
      durationMin: 30,
      activeMode: 'RELAXATION',

      initFrom: (sel, durationMin) => {
        selection = sel;
        set({
          tracks: sel.tracks,
          moduleRegions: seedFlatModule(sel.tracks),
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
      setActiveMode: (mode) => set({ activeMode: mode }),
      setTrackDuration: (trackId, sec) =>
        set((s) => (s.trackDurations[trackId] === sec ? {} : { trackDurations: { ...s.trackDurations, [trackId]: sec } })),
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

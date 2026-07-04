'use client';
import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';
import type { ArrTrack, Composition, Mode } from '@/arrange/types';
import { buildComposition } from '@/arrange/buildComposition';

type Selection = { tracks: ArrTrack[]; tuningHz: number; masterDb: number };

export interface ArrangementState {
  composition: Composition | null;
  durationMin: number;
  playing: boolean;
  positionSec: number;
  activeMode: Mode;
  initFrom: (sel: Selection, durationMin: number) => void;
  setDurationMin: (min: number) => void;
  play: () => void;
  pause: () => void;
  seek: (sec: number) => void;
  setPosition: (sec: number) => void;
  setActiveMode: (mode: Mode) => void;
}

const clampPos = (sec: number, total: number) => Math.min(total, Math.max(0, sec));

export function createArrangementStore() {
  return createStore<ArrangementState>((set) => {
    let selection: Selection | null = null;
    return {
      composition: null,
      durationMin: 30,
      playing: false,
      positionSec: 0,
      activeMode: 'RELAXATION',

      initFrom: (sel, durationMin) => {
        selection = sel;
        set({
          composition: buildComposition(sel, durationMin * 60),
          durationMin,
          playing: false,
          positionSec: 0,
        });
      },
      setDurationMin: (min) => {
        if (!selection) { set({ durationMin: min }); return; }
        set({ composition: buildComposition(selection, min * 60), durationMin: min, positionSec: 0 });
      },
      play: () => set({ playing: true }),
      pause: () => set({ playing: false }),
      seek: (sec) => set((s) => ({ positionSec: clampPos(sec, s.composition?.totalSec ?? 0) })),
      setPosition: (sec) => set((s) => ({ positionSec: clampPos(sec, s.composition?.totalSec ?? 0) })),
      setActiveMode: (mode) => set({ activeMode: mode }),
    };
  });
}

export const arrangementStore = createArrangementStore();
export function useArrangement<T>(selector: (s: ArrangementState) => T): T {
  return useStore(arrangementStore, selector);
}

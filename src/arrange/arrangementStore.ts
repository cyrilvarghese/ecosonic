'use client';
import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';
import type { ElementName } from '@/types';
import type { ArrTrack, Composition, Drift, Mode, TemplateRegion } from '@/arrange/types';
import { buildComposition } from '@/arrange/buildComposition';
import { buildModeTemplate } from '@/arrange/buildModeTemplate';
import { generateModeTemplate } from '@/arrange/generate/generateModeTemplate';
import { steerModule, type SteerNudge } from '@/arrange/generate/steerModule';
import { buildSessionModules, type SessionModules } from '@/arrange/session';
import type { ArrangementFile } from '@/arrange/arrangementFile';
import { config } from '@/config';
import { defaultSendsFor, DRY, type TrackSends } from '@/audio/effects';

type Selection = { element: ElementName | null; tracks: ArrTrack[]; tuningHz: number; masterDb: number };

export interface ArrangementState {
  // Phase 1 — a single module being designed: the handed-off tracks as clips on a timeline.
  element: ElementName | null;
  tracks: ArrTrack[];
  moduleRegions: TemplateRegion[];
  trackDurations: Record<string, number>; // real sample length (sec), filled once loaded
  /** trackId → why its sample never loaded. A lane in here will never get a duration, so the UI
   *  must stop waiting on it and say what happened instead. */
  sampleErrors: Record<string, string>;
  /** Per-track aux send levels, keyed by track id. Runtime mix state, like trackDurations —
   *  deliberately not on ArrTrack, which describes what a track IS. */
  trackSends: Record<string, TrackSends>;
  playing: boolean;
  positionSec: number;
  scrubbing: boolean; // true while dragging the position slider — holds the clock
  masterDb: number;
  durationSec: number; // length the scheduler loops over — moduleSeconds, or totalSec for a free-mix
  // Phase 2 machinery (built + tested, not yet surfaced in the UI).
  composition: Composition | null;
  durationMin: number;
  activeMode: Mode;
  drift: Drift;
  live: boolean;
  session: (SessionModules & { index: number }) | null;

  initFrom: (sel: Selection, durationMin: number) => void;
  setDurationMin: (min: number) => void;
  play: () => void;
  /** Play a free-mix arrangement: a flat absolute region set over one module of `totalSec`.
   *  `startSec` resumes mid-mix — always go through here rather than just setting `playing`, or the
   *  scheduler runs whatever regions the store happens to hold (initFrom seeds a Layer Two
   *  template that stops at `moduleSeconds`). */
  playFreeMix: (regions: TemplateRegion[], totalSec: number, startSec?: number) => void;
  /** Swap the regions the scheduler is playing, leaving the transport alone. `playFreeMix` installs
   *  the mix once, at the moment Play is pressed; anything that reshapes it AFTER that — adjusting
   *  intervals to whole loops, a redraw — has to come back through here. The scheduler reads
   *  `moduleRegions` every frame while the view draws its own copy, so a reshape that skips this
   *  leaves the timeline showing one thing and the audio playing another. */
  setMixRegions: (regions: TemplateRegion[]) => void;
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
  /** Play the full session: all three modes back-to-back, then stop. */
  playSession: () => void;
  /** Advance to the next module in the session, or end it after the last. */
  advanceSession: () => void;
  /** End the session and stop playback. */
  endSession: () => void;
  /** Live steering: redraw the un-played future (optionally with a nudge), spliced at the playhead. */
  steer: (nudge?: SteerNudge) => void;
  /** Load a previously exported arrangement (regions filtered to the current tracks). */
  importArrangement: (file: ArrangementFile) => void;
  /** Drag a track's clip: set when it enters/exits the module. */
  updateModuleRegion: (trackId: string, next: { enterSec: number; exitSec: number }) => void;
  setTrackDuration: (trackId: string, sec: number) => void;
  setSampleError: (trackId: string, reason: string) => void;
  /** Set a track's volume ceiling (dB) — the max level its clip reaches. Inherited from Layer One. */
  setTrackCeilingDb: (trackId: string, db: number) => void;
  setTrackSend: (trackId: string, kind: 'reverb' | 'delay', value: number) => void;
}

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
      sampleErrors: {},
      trackSends: {},
      playing: false,
      positionSec: 0,
      scrubbing: false,
      masterDb: 0,
      durationSec: config.layerTwo.moduleSeconds,
      composition: null,
      durationMin: 30,
      activeMode: 'INTRODUCTION',
      drift: 'MODERATE',
      live: false,
      session: null,

      initFrom: (sel, durationMin) => {
        selection = sel;
        set({
          element: sel.element,
          tracks: sel.tracks,
          activeMode: config.layerTwo.modes[0],
          moduleRegions: seedModuleFromTable(sel.tracks, config.layerTwo.modes[0]),
          trackDurations: {},
          sampleErrors: {},
          trackSends: defaultSendsFor(sel.tracks, config.audio.effects.defaultSends),
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
      play: () => set({ playing: true, session: null, durationSec: config.layerTwo.moduleSeconds }),
      playFreeMix: (regions, totalSec, startSec = 0) =>
        set({ moduleRegions: regions, durationSec: totalSec, session: null, activeMode: 'INTRODUCTION', positionSec: startSec, playing: true }),
      setMixRegions: (regions) => set({ moduleRegions: regions }),
      pause: () => set({ playing: false }),
      seek: (sec) => set((s) => ({ positionSec: Math.max(0, Math.min(s.durationSec, sec)) })),
      setPosition: (sec) => set((s) => ({ positionSec: Math.max(0, Math.min(s.durationSec, sec)) })),
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
      playSession: () =>
        set((s) => {
          const built = buildSessionModules(s.tracks, s.activeMode, s.moduleRegions, config);
          const first = built.order[0];
          return {
            session: { ...built, index: 0 },
            durationSec: config.layerTwo.moduleSeconds,
            activeMode: first,
            moduleRegions: built.regionsByMode[first],
            positionSec: 0,
            playing: true,
          };
        }),
      advanceSession: () =>
        set((s) => {
          if (!s.session) return {};
          const next = s.session.index + 1;
          if (next >= s.session.order.length) {
            return { session: null, playing: false, positionSec: 0 };
          }
          const mode = s.session.order[next];
          return {
            session: { ...s.session, index: next },
            activeMode: mode,
            moduleRegions: s.session.regionsByMode[mode],
            positionSec: 0,
          };
        }),
      endSession: () => set({ session: null, playing: false, positionSec: 0 }),
      steer: (nudge) =>
        set((s) => ({
          moduleRegions: steerModule(s.moduleRegions, s.positionSec, s.tracks, s.activeMode, s.drift, steerSeed++, nudge),
        })),
      importArrangement: (file) =>
        set((s) => {
          const known = new Set(s.tracks.map((tr) => tr.id));
          return {
            activeMode: file.mode,
            drift: file.drift,
            moduleRegions: file.regions.filter((r) => known.has(r.trackId)),
            positionSec: 0,
          };
        }),
      setTrackDuration: (trackId, sec) =>
        set((s) => (s.trackDurations[trackId] === sec ? {} : { trackDurations: { ...s.trackDurations, [trackId]: sec } })),
      setSampleError: (trackId, reason) =>
        set((s) => (s.sampleErrors[trackId] === reason
          ? {}
          : { sampleErrors: { ...s.sampleErrors, [trackId]: reason } })),
      setTrackCeilingDb: (trackId, db) =>
        set((s) => ({ tracks: s.tracks.map((t) => (t.id === trackId ? { ...t, ceilingDb: db } : t)) })),
      setTrackSend: (trackId, kind, value) =>
        set((s) => {
          const cur = s.trackSends[trackId] ?? DRY;
          const v = Math.min(1, Math.max(0, value));
          if (cur[kind] === v) return {};
          return { trackSends: { ...s.trackSends, [trackId]: { ...cur, [kind]: v } } };
        }),
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

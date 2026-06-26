import { createStore } from 'zustand/vanilla';
import type { ElementName, Manifest, Project, Track } from '@/types';
import type { EcosonicConfig } from '@/config';
import { buildSelection, pickReplacement, type Rng } from '@/session/buildSelection';
import { clampDb } from '@/audio/dsp';

export interface SessionState {
  project: Project;
  globalPlaying: boolean;
  selectElement: (el: ElementName) => void;
  backToChooser: () => void;
  setMasterVolumeDb: (db: number) => void;
  toggleGlobalPlaying: () => void;
  setTrackVolumeDb: (id: string, db: number) => void;
  toggleMute: (id: string) => void;
  toggleLock: (id: string) => void;
  toggleTrackPlaying: (id: string) => void;
  changeTrack: (id: string) => void;
  regenerate: () => void;
}

export interface SessionDeps {
  manifest: Manifest;
  cfg: EcosonicConfig;
  rng?: Rng;
}

export function createSessionStore({ manifest, cfg, rng = Math.random }: SessionDeps) {
  const { minDb, maxDb, defaultMasterDb } = cfg.audio.volume;

  const initialProject = (): Project => ({
    element: null,
    tracks: [],
    masterVolumeDb: defaultMasterDb,
    tuningHz: cfg.audio.tuning.defaultHz,
  });

  return createStore<SessionState>((set, get) => {
    const mapTrack = (id: string, fn: (t: Track) => Track) =>
      set((s) => ({
        project: { ...s.project, tracks: s.project.tracks.map((t) => (t.id === id ? fn(t) : t)) },
      }));

    return {
      project: initialProject(),
      globalPlaying: false,

      selectElement: (el) =>
        set((s) => ({
          project: { ...s.project, element: el, tracks: buildSelection(el, manifest, cfg, rng) },
          globalPlaying: false,
        })),

      backToChooser: () => set({ project: initialProject(), globalPlaying: false }),

      setMasterVolumeDb: (db) =>
        set((s) => ({ project: { ...s.project, masterVolumeDb: clampDb(db, minDb, maxDb) } })),

      toggleGlobalPlaying: () => set((s) => ({ globalPlaying: !s.globalPlaying })),

      setTrackVolumeDb: (id, db) => mapTrack(id, (t) => ({ ...t, volumeDb: clampDb(db, minDb, maxDb) })),
      toggleMute: (id) => mapTrack(id, (t) => ({ ...t, muted: !t.muted })),
      toggleLock: (id) => mapTrack(id, (t) => ({ ...t, locked: !t.locked })),
      toggleTrackPlaying: (id) => mapTrack(id, (t) => ({ ...t, playing: !t.playing })),

      changeTrack: (id) => {
        const s = get();
        const el = s.project.element;
        if (!el) return;
        const track = s.project.tracks.find((t) => t.id === id);
        if (!track || track.locked) return;
        const next = pickReplacement(manifest[el][track.category], track.sample.path, rng);
        if (!next) return;
        mapTrack(id, (t) => ({ ...t, sample: { name: next.name, path: next.path, bytes: next.bytes } }));
      },

      regenerate: () => {
        const s = get();
        const el = s.project.element;
        if (!el) return;
        set({
          project: {
            ...s.project,
            tracks: s.project.tracks.map((t) => {
              if (t.locked) return t;
              const next = pickReplacement(manifest[el][t.category], t.sample.path, rng);
              return next ? { ...t, sample: { name: next.name, path: next.path, bytes: next.bytes } } : t;
            }),
          },
        });
      },
    };
  });
}

# ECOSONIC Layer One — Part 2: Selection & State — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn a chosen element into a structured multitrack project in state — the auto-builder (selection rules) and the Zustand store that holds the project and all its actions.

**Architecture:** Pure, seedable selection functions (`buildSelection`, `pickReplacement`, label/count helpers) produce `Track[]` from a `Manifest` + `config`. A framework-agnostic Zustand *vanilla* store (`createSessionStore`) holds the `Project` and exposes actions (select element, volume, mute, lock, per-track play, change, regenerate, master volume, global play). A thin client wrapper (`appStore`) wires the real manifest/config and a React hook.

**Tech Stack:** TypeScript, Zustand 5 (`zustand/vanilla` + `useStore`), Vitest.

**Part:** 2 of 5. Depends on Part 1 (`@/types`, `@/config`, `@/audio/dsp`, `@/session/manifestBuild`). Next: Part 3 (Audio Engine).

## Global Constraints

- All Part 1 constraints apply (config-driven constants; PDF-strict categories; `ARP`/`ELEMENT_SUB` never selected).
- **Selection is seedable:** every random function takes an injectable `rng: () => number` (default `Math.random`) so tests are deterministic. Never call `Math.random` inline.
- **Counts come from `config.selection`** (per-category `min`/`max`), clamped to available samples. Never hardcode counts.
- **Default track volume** = `config.audio.volume.defaultTrackDb`; **default master** = `config.audio.volume.defaultMasterDb`; **default tuning** = `config.audio.tuning.defaultHz`.
- **Volume clamping** uses `clampDb` from `@/audio/dsp` with `config.audio.volume.minDb`/`maxDb`.
- **Lock semantics:** `changeTrack` and `regenerate` must skip locked tracks.
- The store in `sessionStore.ts` must **not** import `manifest.json` (keeps tests independent of the generated file); only `appStore.ts` imports it.

---

### Task 6: Selection rules + auto-builder

**Files:**
- Create: `src/session/selectionRules.ts`
- Create: `src/session/buildSelection.ts`
- Test: `src/session/buildSelection.test.ts`

**Interfaces:**
- Consumes: `@/types` (`Category`, `ElementName`, `Manifest`, `SampleEntry`, `Track`); `@/config` (`EcosonicConfig`).
- Produces:
  - `const SELECTION_ORDER: Category[]`
  - `function labelFor(category: Category, index: number, count: number): string`
  - `type Rng = () => number`
  - `function pickCount(min: number, max: number, available: number, rng: Rng): number`
  - `function sampleN<T>(arr: T[], n: number, rng: Rng): T[]`
  - `function pickReplacement(pool: SampleEntry[], currentPath: string, rng?: Rng): SampleEntry | null`
  - `function buildSelection(element: ElementName, manifest: Manifest, cfg: EcosonicConfig, rng?: Rng): Track[]`

- [ ] **Step 1: Create `src/session/selectionRules.ts`**

```ts
import type { Category } from '@/types';

// The order tracks appear in, top to bottom.
export const SELECTION_ORDER: Category[] = [
  'ISO', 'PLANET', 'NOISE', 'ELEMENT', 'BASS', 'PAD', 'MELODY', 'FX',
];

const BASE_LABEL: Record<Category, string> = {
  ISO: 'ISO', PLANET: 'PLANETS', NOISE: 'NOISE', ELEMENT: 'ELEMENTS',
  BASS: 'BASS', PAD: 'PAD', MELODY: 'MELODY', FX: 'FX',
};

/** "ISO" for a single track; "PLANETS A"/"PLANETS B" when a category has several. */
export function labelFor(category: Category, index: number, count: number): string {
  const base = BASE_LABEL[category];
  if (count <= 1) return base;
  return `${base} ${String.fromCharCode(65 + index)}`; // A, B, C, ...
}
```

- [ ] **Step 2: Write the failing test** — `src/session/buildSelection.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildManifest } from '@/session/manifestBuild';
import { buildSelection, pickCount, pickReplacement, sampleN } from '@/session/buildSelection';
import { config } from '@/config';
import type { Manifest } from '@/types';

// Deterministic PRNG for tests.
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function waterManifest(): Manifest {
  return buildManifest([
    { path: 'WATER/ISO/5hz.wav', bytes: 1 }, { path: 'WATER/ISO/6hz.wav', bytes: 1 },
    { path: 'WATER/ISO/7hz.wav', bytes: 1 }, { path: 'WATER/ISO/8hz.wav', bytes: 1 },
    { path: 'WATER/PLANET/EARTH.wav', bytes: 1 }, { path: 'WATER/PLANET/VENUS.wav', bytes: 1 },
    { path: 'WATER/NOISE/NOISE WATER.wav', bytes: 1 },
    { path: 'WATER/ELEMENT/OCEAN.wav', bytes: 1 }, { path: 'WATER/ELEMENT/RAIN.wav', bytes: 1 },
    { path: 'WATER/ELEMENT/WATER.wav', bytes: 1 }, { path: 'WATER/ELEMENT/XYLO.wav', bytes: 1 },
    { path: 'WATER/ELEMENT/SUB/WHALES.wav', bytes: 1 }, // excluded
    { path: 'WATER/SOUND/ARP/ARP.wav', bytes: 1 },      // excluded
    { path: 'WATER/SOUND/BASS/BASS.wav', bytes: 1 },
    { path: 'WATER/SOUND/PAD/PAD.wav', bytes: 1 },
    { path: 'WATER/SOUND/MELODY/MELODY.wav', bytes: 1 },
    { path: 'WATER/SOUND/FX/FX.wav', bytes: 1 }, { path: 'WATER/SOUND/FX/FX2.wav', bytes: 1 },
  ]);
}

describe('pickCount', () => {
  it('stays within [min,max] clamped to available', () => {
    const rng = mulberry32(1);
    for (let i = 0; i < 50; i++) {
      const n = pickCount(2, 3, 4, rng);
      expect(n).toBeGreaterThanOrEqual(2);
      expect(n).toBeLessThanOrEqual(3);
    }
  });
  it('clamps to availability', () => {
    expect(pickCount(2, 3, 1, mulberry32(1))).toBe(1);
    expect(pickCount(1, 2, 0, mulberry32(1))).toBe(0);
  });
});

describe('sampleN', () => {
  it('returns n distinct items', () => {
    const out = sampleN([1, 2, 3, 4], 2, mulberry32(7));
    expect(out).toHaveLength(2);
    expect(new Set(out).size).toBe(2);
  });
});

describe('buildSelection', () => {
  const tracks = buildSelection('WATER', waterManifest(), config, mulberry32(42));
  const byCat = (c: string) => tracks.filter((t) => t.category === c);

  it('honors fixed counts and ranges from config', () => {
    expect(byCat('ISO')).toHaveLength(1);
    expect(byCat('PLANET')).toHaveLength(2);
    expect(byCat('NOISE')).toHaveLength(1);
    expect(byCat('BASS')).toHaveLength(1);
    expect(byCat('PAD')).toHaveLength(1);
    expect(byCat('MELODY')).toHaveLength(1);
    expect(byCat('ELEMENT').length).toBeGreaterThanOrEqual(2);
    expect(byCat('ELEMENT').length).toBeLessThanOrEqual(3);
    expect(byCat('FX').length).toBeGreaterThanOrEqual(1);
    expect(byCat('FX').length).toBeLessThanOrEqual(2);
  });

  it('labels multi-sample categories A/B and single ones plainly', () => {
    expect(byCat('PLANET').map((t) => t.label)).toEqual(['PLANETS A', 'PLANETS B']);
    expect(byCat('ISO')[0].label).toBe('ISO');
  });

  it('never selects ARP or ELEMENT/SUB samples', () => {
    expect(tracks.some((t) => t.sample.path.includes('/ARP/'))).toBe(false);
    expect(tracks.some((t) => t.sample.path.includes('/SUB/'))).toBe(false);
  });

  it('applies default volume and unique ids', () => {
    expect(tracks.every((t) => t.volumeDb === config.audio.volume.defaultTrackDb)).toBe(true);
    expect(new Set(tracks.map((t) => t.id)).size).toBe(tracks.length);
  });
});

describe('pickReplacement', () => {
  it('returns a different sample when the pool has alternatives', () => {
    const pool = waterManifest().WATER.ISO;
    const next = pickReplacement(pool, 'WATER/ISO/5hz.wav', mulberry32(3));
    expect(next).not.toBeNull();
    expect(next!.path).not.toBe('WATER/ISO/5hz.wav');
  });
  it('returns the only sample if that is all there is', () => {
    const pool = waterManifest().WATER.NOISE;
    const next = pickReplacement(pool, pool[0].path, mulberry32(3));
    expect(next!.path).toBe(pool[0].path);
  });
  it('returns null for an empty pool', () => {
    expect(pickReplacement([], 'x', mulberry32(3))).toBeNull();
  });
});
```

- [ ] **Step 3: Run it to verify failure**

Run: `npx vitest run src/session/buildSelection.test.ts`
Expected: FAIL — `@/session/buildSelection` not found.

- [ ] **Step 4: Implement `src/session/buildSelection.ts`**

```ts
import type { ElementName, Manifest, SampleEntry, Track } from '@/types';
import type { EcosonicConfig } from '@/config';
import { SELECTION_ORDER, labelFor } from '@/session/selectionRules';

export type Rng = () => number; // returns [0, 1)

/** Choose how many to pick: a value in [min,max], clamped to what's available. */
export function pickCount(min: number, max: number, available: number, rng: Rng): number {
  const hi = Math.min(max, available);
  const lo = Math.min(min, hi);
  if (hi <= lo) return Math.max(0, hi);
  return lo + Math.floor(rng() * (hi - lo + 1));
}

/** Pick n distinct items via a partial Fisher–Yates shuffle. */
export function sampleN<T>(arr: T[], n: number, rng: Rng): T[] {
  const copy = [...arr];
  const take = Math.min(n, copy.length);
  for (let i = 0; i < take; i++) {
    const j = i + Math.floor(rng() * (copy.length - i));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, take);
}

/** Pick a replacement within a category, preferring one different from the current. */
export function pickReplacement(
  pool: SampleEntry[],
  currentPath: string,
  rng: Rng = Math.random,
): SampleEntry | null {
  if (pool.length === 0) return null;
  const others = pool.filter((s) => s.path !== currentPath);
  const from = others.length > 0 ? others : pool;
  return sampleN(from, 1, rng)[0];
}

/** Build the multitrack project for an element, per config selection rules. */
export function buildSelection(
  element: ElementName,
  manifest: Manifest,
  cfg: EcosonicConfig,
  rng: Rng = Math.random,
): Track[] {
  const el = manifest[element];
  const tracks: Track[] = [];

  for (const category of SELECTION_ORDER) {
    const pool = el[category]; // primary categories are SampleEntry[]
    const { min, max } = cfg.selection[category];
    const count = pickCount(min, max, pool.length, rng);
    const chosen = sampleN(pool, count, rng);
    chosen.forEach((sample, i) => {
      tracks.push({
        id: `${category}-${i}`,
        category,
        label: labelFor(category, i, count),
        sample: { name: sample.name, path: sample.path, bytes: sample.bytes },
        volumeDb: cfg.audio.volume.defaultTrackDb,
        muted: false,
        playing: true,
        locked: false,
      });
    });
  }

  return tracks;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/session/buildSelection.test.ts`
Expected: PASS (all cases).

- [ ] **Step 6: Commit**

```powershell
git add src/session/selectionRules.ts src/session/buildSelection.ts src/session/buildSelection.test.ts
git commit -m "feat: selection rules and seedable auto-builder"
```

---

### Task 7: Zustand session store

**Files:**
- Create: `src/session/sessionStore.ts`
- Test: `src/session/sessionStore.test.ts`
- Create: `src/session/appStore.ts`

**Interfaces:**
- Consumes: `@/types` (`Project`, `Track`, `ElementName`, `Manifest`, `SampleEntry`); `@/config` (`EcosonicConfig`, `config`); `@/audio/dsp` (`clampDb`); `@/session/buildSelection` (`buildSelection`, `pickReplacement`, `Rng`).
- Produces:
  - `interface SessionState` (project + globalPlaying + actions listed below)
  - `interface SessionDeps { manifest: Manifest; cfg: EcosonicConfig; rng?: Rng }`
  - `function createSessionStore(deps: SessionDeps)` → a Zustand vanilla store
  - `appStore.ts`: `const sessionStore` (real manifest+config) and `function useSession<T>(selector): T`
  - Actions: `selectElement(el)`, `backToChooser()`, `setMasterVolumeDb(db)`, `toggleGlobalPlaying()`, `setTrackVolumeDb(id, db)`, `toggleMute(id)`, `toggleLock(id)`, `toggleTrackPlaying(id)`, `changeTrack(id)`, `regenerate()`.

- [ ] **Step 1: Write the failing test** — `src/session/sessionStore.test.ts`:

```ts
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

  it('clamps track and master volume to the dB range', () => {
    store.getState().selectElement('WATER');
    const id = store.getState().project.tracks[0].id;
    store.getState().setTrackVolumeDb(id, 5);
    expect(store.getState().project.tracks[0].volumeDb).toBe(config.audio.volume.maxDb);
    store.getState().setTrackVolumeDb(id, -999);
    expect(store.getState().project.tracks[0].volumeDb).toBe(config.audio.volume.minDb);
    store.getState().setMasterVolumeDb(99);
    expect(store.getState().project.masterVolumeDb).toBe(config.audio.volume.maxDb);
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
```

- [ ] **Step 2: Run it to verify failure**

Run: `npx vitest run src/session/sessionStore.test.ts`
Expected: FAIL — `@/session/sessionStore` not found.

- [ ] **Step 3: Implement `src/session/sessionStore.ts`**

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/session/sessionStore.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Create the app-wired store + React hook** — `src/session/appStore.ts`:

```ts
'use client';
import { useStore } from 'zustand';
import manifestJson from '@/manifest.json';
import { config } from '@/config';
import type { Manifest } from '@/types';
import { createSessionStore, type SessionState } from '@/session/sessionStore';

export const sessionStore = createSessionStore({
  manifest: manifestJson as unknown as Manifest,
  cfg: config,
});

export function useSession<T>(selector: (s: SessionState) => T): T {
  return useStore(sessionStore, selector);
}
```

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: PASS (Parts 1–2). Note: `appStore.ts` imports `src/manifest.json`; ensure `npm run build:manifest` has been run at least once.

- [ ] **Step 7: Commit**

```powershell
git add src/session/sessionStore.ts src/session/sessionStore.test.ts src/session/appStore.ts
git commit -m "feat: zustand session store with project actions"
```

---

## Part 2 self-review

- **Spec coverage:** auto-build per element + counts/labels ✓ (T6); Change=random-in-category ✓ (T6/T7); Regenerate=unlocked-only ✓ (T7); Lock skips change/regenerate ✓ (T7); per-track volume(ceiling)/mute/play + master volume + global play ✓ (T7); ARP/SUB never selected ✓ (T6).
- **Placeholders:** none — all steps carry real code and runnable commands.
- **Type consistency:** `Rng` defined in `buildSelection.ts`, re-imported by the store; `SessionState` action names match the test and (forward) the UI in Part 4; `pickReplacement`/`buildSelection` signatures match their call sites.
- **Boundary with Part 1:** uses `Track`/`Project` (defined Part 1), `clampDb`, `buildManifest` (tests only). `tuningHz` carried in `Project` with no UI (Build-2 ready).
- **Boundary with Part 3:** store holds `globalPlaying` + per-track `playing`/`muted`/`volumeDb`; the audio engine/controller (Part 3) will subscribe and react.

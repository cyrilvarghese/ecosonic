# Layer Two — Part 2: Runtime (playback math, engine, store, scheduler) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Play a `Composition`: a pure per-track playback scalar, an engine hook to apply it, a Zustand store for session/playback state, and a scheduler loop that advances the clock and drives the audio engine.

**Architecture:** Pure `trackScalarAt` (composition + time → 0..1 gain, unit-tested) sits between Part 1's builders and the runtime. `Layer.setEnvelope`/`AudioEngine.setTrackEnvelope` multiply each layer's ceiling gain by that scalar. `arrangementStore` (Zustand singleton, like `sessionStore`) holds `composition`/`playing`/`positionSec`. `useArrangementScheduler` runs the tick loop (browser-verified when Part 3 mounts the screen).

**Tech Stack:** TypeScript, Zustand, Web Audio (browser-only), Vitest.

## Global Constraints

- Design spec: `docs/superpowers/specs/2026-07-03-layer-two-arrangement-engine-design.md`.
- One audio `Layer` per track id; Layer Two only modulates its gain via a `0..1` envelope scalar. Final gain = `ceilingGain × scalar`, never above ceiling. Master untouched.
- Density = arrangement: `trackScalarAt` combines covering module instances by **max** (never sum → never > 1). Continuity/bed categories (`NOISE/ISO/PLANET/ELEMENT`) carry through bridges (factor 1); drivers crossfade.
- Web Audio has no jsdom support — `Layer`/`AudioEngine`/scheduler are typecheck-verified here and browser-verified in Part 3 (Layer One convention). Pure logic (`trackScalarAt`, store) is unit-tested.
- Conventions: `@/` alias, `vitest run`, `npx tsc --noEmit`, Conventional Commits, `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` trailer.

---

### Task 1: `trackScalarAt` — per-track playback scalar

**Files:**
- Create: `src/arrange/trackScalar.ts`
- Test: `src/arrange/trackScalar.test.ts`

**Interfaces:**
- Consumes: `Composition`, `ArrTrack`, `isBed` from `@/arrange/types`; `regionEnvAt` from `@/arrange/regionEnv`; `crossfade` from `@/arrange/bridges`.
- Produces: `trackScalarAt(comp: Composition, track: Pick<ArrTrack, 'id' | 'category'>, s: number): number` in `[0, 1]`.

- [ ] **Step 1: Write the failing test `src/arrange/trackScalar.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { trackScalarAt } from '@/arrange/trackScalar';
import { buildComposition } from '@/arrange/buildComposition';
import type { ArrTrack } from '@/arrange/types';
import { config } from '@/config';

const t = (id: string, category: ArrTrack['category']): ArrTrack => ({
  id, category, label: id, sample: { name: id, path: id, bytes: 1 }, ceilingDb: 0, locked: false,
});
const tracks = [t('n', 'NOISE'), t('pad', 'PAD')];
const comp = buildComposition({ tracks, tuningHz: 440, masterDb: 0 }, 30 * 60);
const { moduleSeconds: M, bridgeSeconds: B } = config.layerTwo;

describe('trackScalarAt', () => {
  it('is 0 before the session and after it ends', () => {
    expect(trackScalarAt(comp, tracks[0], -5)).toBe(0);
    expect(trackScalarAt(comp, tracks[0], comp.totalSec + 5)).toBe(0);
  });
  it('holds a bed track near 1 through a module', () => {
    expect(trackScalarAt(comp, tracks[0], M / 2)).toBeCloseTo(1, 3);
  });
  it('keeps a bed track present through a bridge overlap (carry-through)', () => {
    const midBridge = M - B / 2; // inside the mod-0/mod-1 overlap
    expect(trackScalarAt(comp, tracks[0], midBridge)).toBeGreaterThan(0.8);
  });
  it('is 0 for a track absent in the covering module (PAD in IMMERSION)', () => {
    const midImmersion = (M - B) + M / 2; // deep inside mod-1 (IMMERSION)
    expect(trackScalarAt(comp, tracks[1], midImmersion)).toBe(0);
  });
  it('never exceeds 1 anywhere in the session', () => {
    for (let s = 0; s <= comp.totalSec; s += M / 20) {
      for (const tr of tracks) expect(trackScalarAt(comp, tr, s)).toBeLessThanOrEqual(1);
    }
  });
});
```

- [ ] **Step 2: Run it to verify failure**

Run: `npx vitest run src/arrange/trackScalar.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/arrange/trackScalar.ts`**

```ts
import type { ArrTrack, Composition } from '@/arrange/types';
import { isBed } from '@/arrange/types';
import { regionEnvAt } from '@/arrange/regionEnv';
import { crossfade } from '@/arrange/bridges';

/** Gain scalar (0..1) for one track at absolute session time `s`. Combines covering
 *  module instances by max (never > 1); bed tracks carry through bridges, drivers crossfade. */
export function trackScalarAt(
  comp: Composition,
  track: Pick<ArrTrack, 'id' | 'category'>,
  s: number,
): number {
  const bed = isBed(track.category);
  let best = 0;

  comp.sequence.forEach((inst, k) => {
    const end = inst.startSec + inst.durationSec;
    if (s < inst.startSec || s >= end) return;
    const region = comp.templates[inst.mode].regions.find((r) => r.trackId === track.id);
    if (!region) return;

    let env = regionEnvAt(region, s - inst.startSec);
    if (env <= 0) return;

    if (!bed) {
      // Outgoing side of the bridge to the next instance.
      const asFrom = comp.bridges.find((b) => b.fromInstanceId === inst.id);
      const next = comp.sequence[k + 1];
      if (asFrom && next && s >= next.startSec) {
        env *= crossfade(s - next.startSec, asFrom.overlapSec).out;
      }
      // Incoming side of the bridge from the previous instance.
      const asTo = comp.bridges.find((b) => b.toInstanceId === inst.id);
      const prev = comp.sequence[k - 1];
      if (asTo && prev && s < prev.startSec + prev.durationSec) {
        env *= crossfade(s - inst.startSec, asTo.overlapSec).in;
      }
    }
    best = Math.max(best, env);
  });

  return Math.min(1, best);
}
```

- [ ] **Step 4: Run tests → PASS**

Run: `npx vitest run src/arrange/trackScalar.test.ts`

- [ ] **Step 5: Typecheck + commit**

```powershell
npx tsc --noEmit
git add src/arrange/trackScalar.ts src/arrange/trackScalar.test.ts
git commit -m "feat(layer2): trackScalarAt per-track playback scalar"
```

---

### Task 2: Engine — `Layer.setEnvelope` + `AudioEngine.setTrackEnvelope`

**Files:**
- Modify: `src/audio/Layer.ts`
- Modify: `src/audio/AudioEngine.ts`

**Interfaces:**
- Produces: `Layer.setEnvelope(scalar: number, rampMs: number): void`; `AudioEngine.setTrackEnvelope(id: string, scalar: number): void`. Effective gain becomes `muted ? 0 : targetGain × envelope`.

- [ ] **Step 1: Add an `envelope` field + `effectiveGain()` to `src/audio/Layer.ts`.** After the `private muted = false;` line add:

```ts
  private envelope = 1; // Layer Two 0..1 modulation on top of the ceiling (targetGain)
```

Add this private helper (near `applyGain`):

```ts
  private effectiveGain(): number {
    return this.muted ? 0 : this.targetGain * this.envelope;
  }
```

- [ ] **Step 2: Route existing ramps through `effectiveGain()`.** In `src/audio/Layer.ts`:
  - In `unmute`: change `if (this.started) this.rampTo(this.targetGain, rampMs);` → `if (this.started) this.rampTo(this.effectiveGain(), rampMs);`
  - In `setVolumeDb`: change `if (this.started && !this.muted) this.rampTo(this.targetGain, rampMs);` → `... this.rampTo(this.effectiveGain(), rampMs);`
  - In `applyGain`: change `this.rampTo(this.muted ? 0 : this.targetGain, rampMs);` → `this.rampTo(this.effectiveGain(), rampMs);`

- [ ] **Step 3: Add `setEnvelope` to `src/audio/Layer.ts`** (near `setVolumeDb`):

```ts
  setEnvelope(scalar: number, rampMs: number) {
    this.envelope = Math.min(1, Math.max(0, scalar));
    if (this.started && !this.muted) this.rampTo(this.effectiveGain(), rampMs);
  }
```

- [ ] **Step 4: Add `setTrackEnvelope` to `src/audio/AudioEngine.ts`** (near `setTrackVolume`):

```ts
  setTrackEnvelope(id: string, scalar: number) {
    this.layers.get(id)?.setEnvelope(scalar, this.cfg.changeRampMs);
  }
```

- [ ] **Step 5: Typecheck + commit**

```powershell
npx tsc --noEmit
git add src/audio/Layer.ts src/audio/AudioEngine.ts
git commit -m "feat(layer2): Layer.setEnvelope + AudioEngine.setTrackEnvelope"
```

---

### Task 3: `arrangementStore`

**Files:**
- Create: `src/arrange/arrangementStore.ts`
- Test: `src/arrange/arrangementStore.test.ts`

**Interfaces:**
- Consumes: `buildComposition` (Part 1), `Composition`, `Mode`, `ArrTrack`.
- Produces: `createArrangementStore()` (vanilla Zustand store); singleton `arrangementStore`; `useArrangement<T>(selector)`. State: `composition: Composition | null`, `durationMin`, `playing`, `positionSec`, `activeMode: Mode`. Actions: `initFrom(sel, durationMin)`, `setDurationMin(min)`, `play()`, `pause()`, `seek(sec)`, `setPosition(sec)`, `setActiveMode(mode)`.

- [ ] **Step 1: Write the failing test `src/arrange/arrangementStore.test.ts`**

```ts
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
```

- [ ] **Step 2: Run it to verify failure**

Run: `npx vitest run src/arrange/arrangementStore.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/arrange/arrangementStore.ts`**

```ts
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
  return createStore<ArrangementState>((set, get) => {
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
```

- [ ] **Step 4: Run tests → PASS**

Run: `npx vitest run src/arrange/arrangementStore.test.ts`

- [ ] **Step 5: Typecheck + commit**

```powershell
npx tsc --noEmit
git add src/arrange/arrangementStore.ts src/arrange/arrangementStore.test.ts
git commit -m "feat(layer2): arrangementStore (composition + playback state)"
```

---

### Task 4: `useArrangementScheduler` — the tick loop

**Files:**
- Create: `src/arrange/useArrangementScheduler.ts`

**Interfaces:**
- Consumes: `AudioEngine`, `arrangementStore`, `trackScalarAt`, `config.layerTwo.schedulerTickMs`.
- Produces: `useArrangementScheduler(engine: AudioEngine): void` — a React hook that, while `playing`, advances `positionSec` in real time and calls `engine.setTrackEnvelope` per track each tick.

- [ ] **Step 1: Implement `src/arrange/useArrangementScheduler.ts`** (browser-only; verified in Part 3):

```ts
'use client';
import { useEffect } from 'react';
import type { AudioEngine } from '@/audio/AudioEngine';
import { arrangementStore } from '@/arrange/arrangementStore';
import { trackScalarAt } from '@/arrange/trackScalar';
import { config } from '@/config';

/** While playing, advance the session clock in real time and drive per-track envelopes. */
export function useArrangementScheduler(engine: AudioEngine): void {
  useEffect(() => {
    let raf = 0;
    let last: number | null = null;
    let sinceTick = Infinity; // force an envelope update on the first playing frame
    const tickSec = config.layerTwo.schedulerTickMs / 1000;

    const frame = (now: number) => {
      const st = arrangementStore.getState();
      if (st.playing && st.composition) {
        const t = now / 1000;
        const dt = last === null ? 0 : t - last;
        last = t;
        const next = st.positionSec + dt;
        st.setPosition(next);
        sinceTick += dt;
        if (sinceTick >= tickSec) {
          sinceTick = 0;
          for (const track of st.composition.tracks) {
            engine.setTrackEnvelope(track.id, trackScalarAt(st.composition, track, next));
          }
        }
      } else {
        last = null;
        sinceTick = Infinity;
      }
      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [engine]);
}
```

- [ ] **Step 2: Typecheck + commit**

```powershell
npx tsc --noEmit
git add src/arrange/useArrangementScheduler.ts
git commit -m "feat(layer2): useArrangementScheduler tick loop (browser-verified in Part 3)"
```

---

## Part 2 done — what's next

Part 2 delivers the runtime: pure playback math (`trackScalarAt`, tested), the engine envelope hook, the store, and the scheduler skeleton. **Part 3** wires `/layer2` (route + handoff snapshot + engine mount + scheduler) and the Module Designer UI, where the scheduler gets its real browser verification.

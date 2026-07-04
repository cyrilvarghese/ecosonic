# Layer Two — Part 3: Route + Handoff + Playable Screen — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use `- [ ]`.

**Goal:** Navigate Layer One → `/layer2`, mount the audio engine on the snapshotted selection, and play the generated arrangement (module band + track lanes + transport + playhead). This is Layer Two's **audio milestone**. Drag editing (Module Designer) is Part 4.

**Architecture:** A pure `snapshotSelection(project)` maps Layer One's `Project` → the Layer Two selection (non-muted tracks, `volumeDb`→`ceilingDb`). The "Continue to Layer Two" button seeds `arrangementStore` and routes to `/layer2`. `useLayer2Engine` mounts an `AudioEngine`, loads the tracks, and gates the context on `playing`; `useArrangementScheduler` (Part 2) drives envelopes. `ArrangeScreen` renders the composition.

**Tech Stack:** Next 16 App Router (client), Zustand, Web Audio, Vitest.

## Global Constraints
- Spec: `docs/superpowers/specs/2026-07-03-layer-two-arrangement-engine-design.md`.
- `muted = unselected` → excluded from Layer Two. `ceilingDb = Layer One volumeDb`. Master read-only.
- UI/engine are browser-verified (jsdom has no Web Audio); the handoff mapping is unit-tested.
- Conventions: `@/` alias, `vitest run`, `npx tsc --noEmit`, Conventional Commits, `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

### Task 1: `snapshotSelection` — Layer One → Layer Two handoff (pure, tested)

**Files:** Create `src/arrange/snapshotSelection.ts`; Test `src/arrange/snapshotSelection.test.ts`.

**Interfaces:** `snapshotSelection(project: Project): { tracks: ArrTrack[]; tuningHz: number; masterDb: number }` — drops muted tracks, maps `volumeDb`→`ceilingDb`.

- [ ] **Step 1: Failing test** (`src/arrange/snapshotSelection.test.ts`):

```ts
import { describe, it, expect } from 'vitest';
import { snapshotSelection } from '@/arrange/snapshotSelection';
import type { Project, Track } from '@/types';

const tr = (id: string, muted: boolean, volumeDb: number): Track => ({
  id, category: 'PAD', label: id, sample: { name: id, path: id, bytes: 1 },
  volumeDb, muted, playing: true, locked: false,
});
const project: Project = {
  element: 'WATER', masterVolumeDb: -3, tuningHz: 432,
  tracks: [tr('a', false, -6), tr('b', true, 0), tr('c', false, 2)],
};

describe('snapshotSelection', () => {
  it('keeps only non-muted tracks', () => {
    expect(snapshotSelection(project).tracks.map((t) => t.id)).toEqual(['a', 'c']);
  });
  it('maps volumeDb to ceilingDb and passes tuning/master through', () => {
    const s = snapshotSelection(project);
    expect(s.tracks[0].ceilingDb).toBe(-6);
    expect(s.tuningHz).toBe(432);
    expect(s.masterDb).toBe(-3);
  });
});
```

- [ ] **Step 2:** Run → FAIL. `npx vitest run src/arrange/snapshotSelection.test.ts`
- [ ] **Step 3: Implement** (`src/arrange/snapshotSelection.ts`):

```ts
import type { Project } from '@/types';
import type { ArrTrack } from '@/arrange/types';

/** Freeze the Layer One selection into Layer Two input: non-muted tracks, volumeDb→ceilingDb. */
export function snapshotSelection(project: Project): {
  tracks: ArrTrack[]; tuningHz: number; masterDb: number;
} {
  const tracks: ArrTrack[] = project.tracks
    .filter((t) => !t.muted)
    .map((t) => ({
      id: t.id, category: t.category, label: t.label, sample: t.sample,
      ceilingDb: t.volumeDb, locked: t.locked,
    }));
  return { tracks, tuningHz: project.tuningHz, masterDb: project.masterVolumeDb };
}
```

- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5: Commit:** `git add src/arrange/snapshotSelection.ts src/arrange/snapshotSelection.test.ts && git commit -m "feat(layer2): snapshotSelection handoff"`

---

### Task 2: Enable "Continue to Layer Two" on `/layer1`

**Files:** Modify `src/components/BuilderScreen.tsx`.

**Interfaces:** the existing disabled button becomes active: seeds `arrangementStore` from the current project and routes to `/layer2`.

- [ ] **Step 1:** In `BuilderScreen.tsx`, import `arrangementStore` (`@/arrange/arrangementStore`), `snapshotSelection` (`@/arrange/snapshotSelection`), and `config`. Grab the whole project via `useSession((s) => s.project)`.
- [ ] **Step 2:** Replace `<Button variant="outline" disabled>Continue to Layer Two</Button>` with:

```tsx
<Button variant="outline" aria-label="Continue to Layer Two"
  onClick={() => {
    arrangementStore.getState().initFrom(snapshotSelection(project), config.layerTwo.durationPresetsMin[2]);
    router.push('/layer2');
  }}>
  Continue to Layer Two
</Button>
```

(`router` already exists in BuilderScreen from the Part-earlier route work.)

- [ ] **Step 3:** `npx tsc --noEmit` → OK. Commit: `git add src/components/BuilderScreen.tsx && git commit -m "feat(layer2): enable Continue to Layer Two"`

---

### Task 3: `/layer2` route + guard

**Files:** Create `src/app/layer2/page.tsx`.

**Interfaces:** client page; if `arrangementStore` has no composition, redirect to `/`; else render `<ArrangeScreen />`.

- [ ] **Step 1: Implement** (`src/app/layer2/page.tsx`):

```tsx
'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useArrangement } from '@/arrange/arrangementStore';
import { ArrangeScreen } from '@/components/layer2/ArrangeScreen';

export default function Layer2Page() {
  const router = useRouter();
  const composition = useArrangement((s) => s.composition);
  useEffect(() => { if (!composition) router.replace('/'); }, [composition, router]);
  if (!composition) return null;
  return <ArrangeScreen />;
}
```

- [ ] **Step 2:** (ArrangeScreen created in Task 5.) Defer tsc to Task 5. Commit with Task 5.

---

### Task 4: `useLayer2Engine` — mount engine + gate context

**Files:** Create `src/arrange/useLayer2Engine.ts`.

**Interfaces:** `useLayer2Engine(): AudioEngine` — creates the engine, `setTracks` from `composition.tracks` (playing, unmuted) with each envelope initialized to 0, `setMasterVolume(masterDb)`, and reconciles `engine.play()/pause()` with `arrangementStore.playing`.

- [ ] **Step 1: Implement** (`src/arrange/useLayer2Engine.ts`):

```ts
'use client';
import { useEffect, useRef } from 'react';
import { AudioEngine, type TrackAudioSpec } from '@/audio/AudioEngine';
import { arrangementStore } from '@/arrange/arrangementStore';
import { config } from '@/config';

export function useLayer2Engine(): AudioEngine {
  const ref = useRef<AudioEngine | null>(null);
  if (!ref.current) {
    ref.current = new AudioEngine({
      thresholdBytes: config.audio.hybridThresholdBytes,
      minDb: config.audio.volume.minDb,
      muteRampMs: config.audio.volume.muteRampMs,
      changeRampMs: config.audio.volume.changeRampMs,
    });
  }
  const engine = ref.current;

  useEffect(() => {
    const comp = arrangementStore.getState().composition;
    if (!comp) return;
    const specs: TrackAudioSpec[] = comp.tracks.map((t) => ({
      id: t.id, path: t.sample.path, bytes: t.sample.bytes,
      volumeDb: t.ceilingDb, muted: false, playing: true,
    }));
    engine.setMasterVolume(comp.masterDb);
    void engine.setTracks(specs).then(() => {
      for (const t of comp.tracks) engine.setTrackEnvelope(t.id, 0); // silent until the scheduler drives them
    });

    let wasPlaying = false;
    const unsub = arrangementStore.subscribe((s) => {
      if (s.playing === wasPlaying) return;
      wasPlaying = s.playing;
      if (s.playing) void engine.play(); else engine.pause();
    });
    return () => { unsub(); engine.clear(); };
  }, [engine]);

  return engine;
}
```

- [ ] **Step 2:** Defer tsc/commit to Task 5 (consumed by ArrangeScreen).

---

### Task 5: `ArrangeScreen` — playable UI + wiring

**Files:** Create `src/components/layer2/ArrangeScreen.tsx`, `src/components/layer2/ModuleBand.tsx`.

**Interfaces:** `ArrangeScreen` mounts `useLayer2Engine` + `useArrangementScheduler`, renders header (Return to Layer One, duration presets, play/pause, `mm:ss / mm:ss`), the `ModuleBand` (from `composition.sequence`), a simple list of track lanes (labels), and a playhead line over the band. `ModuleBand({ sequence, totalSec, positionSec })` draws the lens modules + bridges.

- [ ] **Step 1:** Implement `ModuleBand.tsx` — fl: modules positioned by `startSec/totalSec` as gradient lens blocks with mode name + `mm:ss`, bridge markers, and a playhead line at `positionSec/totalSec`. (Full component written at execution.)
- [ ] **Step 2:** Implement `ArrangeScreen.tsx` — see Interfaces; uses `useArrangement` selectors, `secToClock` helper (`Math.floor` mm:ss), duration preset buttons calling `setDurationMin`, play/pause calling `play()/pause()`.
- [ ] **Step 3:** `npx tsc --noEmit` → OK; `npx vitest run` → all green; `next build` → both `/layer1` and `/layer2` compile.
- [ ] **Step 4: Commit:**

```powershell
git add src/app/layer2/page.tsx src/arrange/useLayer2Engine.ts src/components/layer2/
git commit -m "feat(layer2): /layer2 route + playable ArrangeScreen (audio milestone)"
```

- [ ] **Step 5: Browser verification (human-in-the-loop):** `npm run dev` → `/` → pick element → `/layer1` → Continue to Layer Two → `/layer2`; press play; confirm the arrangement swells/recedes per module and modules transition smoothly.

---

## Part 3 done — what's next
Part 4: the Module Designer (click a module → draggable region clips) + Composition-track editing (drag durations/bridges), building on this playable base.

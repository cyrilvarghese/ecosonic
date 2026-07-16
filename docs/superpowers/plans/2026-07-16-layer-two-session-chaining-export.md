# Layer Two Session Chaining & Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Play the three Layer Two modes (Introduction → Deep Relaxation → Return) as one continuous ~30-min session, and export the whole session as a single WAV.

**Architecture:** Introduce a **Session** snapshot — the three modes' region-sets in playback order — built by one shared helper and consumed by both chained playback (scheduler + store) and export (offline render). The active mode contributes its on-screen regions; the other two reseed from their density tables.

**Tech Stack:** TypeScript, React, Zustand (vanilla store), Web Audio `OfflineAudioContext`, Vitest.

## Global Constraints

- Module length is `config.layerTwo.moduleSeconds` (600 s); never hardcode 600 — read from config.
- Modes and order come from `config.layerTwo.modes` = `['INTRODUCTION','DEEP_RELAXATION','RETURN']`; never hardcode the list.
- `renderModuleToWav`'s existing signature and behavior must not change (single-module export still works).
- Session-fill rule: `regionsByMode[mode] = (mode === activeMode) ? current moduleRegions : buildModeTemplate(tracks, mode, cfg).regions`.
- Follow existing test style: `vitest`, `createArrangementStore()` per-test, `@/` path alias.
- Read `node_modules/next/dist/docs/` before touching any Next.js-specific API (per AGENTS.md) — not expected here, but the rule stands.

---

### Task 1: Shared session-builder helper

**Files:**
- Create: `src/arrange/session.ts`
- Test: `src/arrange/session.test.ts`

**Interfaces:**
- Consumes: `buildModeTemplate(tracks, mode, cfg)` from `@/arrange/buildModeTemplate` (returns `{ regions: TemplateRegion[] }`); `config` from `@/config`; types `ArrTrack, Mode, TemplateRegion` from `@/arrange/types`.
- Produces:
  ```ts
  export interface SessionModules {
    order: Mode[];
    regionsByMode: Record<Mode, TemplateRegion[]>;
  }
  export function buildSessionModules(
    tracks: ArrTrack[],
    activeMode: Mode,
    moduleRegions: TemplateRegion[],
    cfg?: EcosonicConfig,
  ): SessionModules;
  ```

- [ ] **Step 1: Write the failing test**

```ts
// src/arrange/session.test.ts
import { describe, it, expect } from 'vitest';
import { buildSessionModules } from '@/arrange/session';
import { buildModeTemplate } from '@/arrange/buildModeTemplate';
import type { ArrTrack, TemplateRegion } from '@/arrange/types';
import { config } from '@/config';

const t = (id: string, category: ArrTrack['category']): ArrTrack => ({
  id, category, label: id, sample: { name: id, path: id, bytes: 1 }, ceilingDb: 0, locked: false,
});
const tracks = [t('n', 'NOISE'), t('pad', 'PAD')];

describe('buildSessionModules', () => {
  it('orders modes per config and uses on-screen regions only for the active mode', () => {
    const active = config.layerTwo.modes[1]; // DEEP_RELAXATION
    const edited: TemplateRegion[] = [{ trackId: 'n', enterSec: 42, exitSec: 300, fadeInSec: 10, fadeOutSec: 10 }];
    const s = buildSessionModules(tracks, active, edited, config);

    expect(s.order).toEqual(config.layerTwo.modes);
    // active mode: identity — the exact on-screen regions
    expect(s.regionsByMode[active]).toBe(edited);
    // the other two: freshly reseeded from the density table
    for (const m of config.layerTwo.modes) {
      if (m === active) continue;
      expect(s.regionsByMode[m]).toEqual(buildModeTemplate(tracks, m, config).regions);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/arrange/session.test.ts`
Expected: FAIL — cannot resolve `@/arrange/session` / `buildSessionModules is not a function`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/arrange/session.ts
import { config as defaultConfig, type EcosonicConfig } from '@/config';
import type { ArrTrack, Mode, TemplateRegion } from '@/arrange/types';
import { buildModeTemplate } from '@/arrange/buildModeTemplate';

export interface SessionModules {
  order: Mode[];
  regionsByMode: Record<Mode, TemplateRegion[]>;
}

/** Snapshot the three modes' region-sets in playback order. The active mode
 *  contributes its on-screen regions; the others reseed from their density table. */
export function buildSessionModules(
  tracks: ArrTrack[],
  activeMode: Mode,
  moduleRegions: TemplateRegion[],
  cfg: EcosonicConfig = defaultConfig,
): SessionModules {
  const order = cfg.layerTwo.modes;
  const regionsByMode = {} as Record<Mode, TemplateRegion[]>;
  for (const mode of order) {
    regionsByMode[mode] =
      mode === activeMode ? moduleRegions : buildModeTemplate(tracks, mode, cfg).regions;
  }
  return { order, regionsByMode };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/arrange/session.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/arrange/session.ts src/arrange/session.test.ts
git commit -m "feat(arrange): buildSessionModules — snapshot the three modes in playback order"
```

---

### Task 2: Store — session state and playSession/advanceSession/endSession

**Files:**
- Modify: `src/arrange/arrangementStore.ts` (interface `ArrangementState`, initial state, actions; `play`/`pause`)
- Test: `src/arrange/arrangementStore.test.ts` (append cases)

**Interfaces:**
- Consumes: `buildSessionModules`, `SessionModules` from `@/arrange/session` (Task 1).
- Produces (added to `ArrangementState`):
  ```ts
  session: { order: Mode[]; regionsByMode: Record<Mode, TemplateRegion[]>; index: number } | null;
  playSession: () => void;
  advanceSession: () => void;
  endSession: () => void;
  ```

- [ ] **Step 1: Write the failing test**

Append inside the top-level `describe('arrangementStore', …)` block in `src/arrange/arrangementStore.test.ts`:

```ts
  it('playSession snapshots all modes, starts at the first, playing from 0', () => {
    store.getState().initFrom(sel, 30);
    store.getState().loadMode(config.layerTwo.modes[2]); // active = RETURN, edited on screen
    store.getState().playSession();
    const s = store.getState();
    expect(s.session).not.toBeNull();
    expect(s.session!.index).toBe(0);
    expect(s.session!.order).toEqual(config.layerTwo.modes);
    expect(s.activeMode).toBe(config.layerTwo.modes[0]);
    expect(s.moduleRegions).toBe(s.session!.regionsByMode[config.layerTwo.modes[0]]);
    expect(s.playing).toBe(true);
    expect(s.positionSec).toBe(0);
  });
  it('advanceSession moves to the next mode and swaps its regions', () => {
    store.getState().initFrom(sel, 30);
    store.getState().playSession();
    store.getState().advanceSession();
    const s = store.getState();
    expect(s.session!.index).toBe(1);
    expect(s.activeMode).toBe(config.layerTwo.modes[1]);
    expect(s.moduleRegions).toBe(s.session!.regionsByMode[config.layerTwo.modes[1]]);
    expect(s.positionSec).toBe(0);
    expect(s.playing).toBe(true);
  });
  it('advanceSession past the last mode ends the session and stops', () => {
    store.getState().initFrom(sel, 30);
    store.getState().playSession();
    store.getState().advanceSession(); // -> index 1
    store.getState().advanceSession(); // -> index 2 (last)
    store.getState().advanceSession(); // -> end
    const s = store.getState();
    expect(s.session).toBeNull();
    expect(s.playing).toBe(false);
    expect(s.positionSec).toBe(0);
  });
  it('single-module play clears an active session', () => {
    store.getState().initFrom(sel, 30);
    store.getState().playSession();
    store.getState().play();
    expect(store.getState().session).toBeNull();
    expect(store.getState().playing).toBe(true);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/arrange/arrangementStore.test.ts`
Expected: FAIL — `playSession is not a function`.

- [ ] **Step 3: Add the import**

At the top of `src/arrange/arrangementStore.ts`, after the `steerModule` import line, add:

```ts
import { buildSessionModules, type SessionModules } from '@/arrange/session';
```

- [ ] **Step 4: Extend the interface**

In `interface ArrangementState`, after the `live: boolean;` field, add:

```ts
  session: SessionModules & { index: number } | null;
```

And after the `setLive` declaration, add:

```ts
  /** Play the full session: all three modes back-to-back, then stop. */
  playSession: () => void;
  /** Advance to the next module in the session, or end it after the last. */
  advanceSession: () => void;
  /** End the session and stop playback. */
  endSession: () => void;
```

- [ ] **Step 5: Add initial state and actions**

In the returned store object, after `live: false,` add:

```ts
      session: null,
```

After the `setLive` action, add:

```ts
      playSession: () =>
        set((s) => {
          const built = buildSessionModules(s.tracks, s.activeMode, s.moduleRegions, config);
          const first = built.order[0];
          return {
            session: { ...built, index: 0 },
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
```

- [ ] **Step 6: Make single-module play/pause clear the session**

Change the `play` action from:

```ts
      play: () => set({ playing: true }),
```
to:
```ts
      play: () => set({ playing: true, session: null }),
```

(Leave `pause` as `set({ playing: false })` — pausing a session keeps `session` so it can resume; ending is only via `advanceSession` past the last mode or `endSession`.)

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run src/arrange/arrangementStore.test.ts`
Expected: PASS (all existing + 4 new cases).

- [ ] **Step 8: Commit**

```bash
git add src/arrange/arrangementStore.ts src/arrange/arrangementStore.test.ts
git commit -m "feat(arrange): session state + playSession/advanceSession/endSession"
```

---

### Task 3: Scheduler — chain modules at the boundary

**Files:**
- Modify: `src/arrange/useModuleScheduler.ts`

**Interfaces:**
- Consumes: `st.session`, `st.advanceSession()`, `st.activeMode` from the store (Task 2).
- Produces: no exported surface change — behavior only.

This task has no unit test (the RAF/time loop is not unit-tested, consistent with the file having no existing test; the chaining logic it drives is covered by the Task 2 store tests). The deliverable is verified by typecheck + the manual run in Task 6.

- [ ] **Step 1: Replace the wrap logic to advance the session at the boundary**

In `src/arrange/useModuleScheduler.ts`, find:

```ts
        let pos = st.positionSec;
        if (!st.scrubbing) {
          pos += dt;
          if (pos >= D) pos -= D;
          st.setPosition(pos);
        }
```

Replace with:

```ts
        let pos = st.positionSec;
        if (!st.scrubbing) {
          pos += dt;
          if (pos >= D) {
            if (st.session) {
              // Chained session: hand off to the next module (or stop after the last).
              st.advanceSession();
              raf = requestAnimationFrame(frame);
              return;
            }
            pos -= D; // single-module play loops
          }
          st.setPosition(pos);
        }
```

- [ ] **Step 2: Force a resync when the active mode changes (session boundary)**

Near the top of the effect, alongside the other locals (after `let sinceSteer = 0;`), add:

```ts
    let lastMode = arrangementStore.getState().activeMode;
```

Then find the existing resync line:

```ts
        const resync = (wasScrubbing && !st.scrubbing) || !wasPlaying;
```

Replace with:

```ts
        const modeChanged = st.activeMode !== lastMode;
        lastMode = st.activeMode;
        const resync = (wasScrubbing && !st.scrubbing) || !wasPlaying || modeChanged;
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/arrange/useModuleScheduler.ts
git commit -m "feat(arrange): scheduler chains modules through a session, resyncs at each boundary"
```

---

### Task 4: Render — extract channel core, add full-session render

**Files:**
- Modify: `src/arrange/render/renderModuleWav.ts` (extract `renderModuleToChannels`; keep `renderModuleToWav` as a wrapper)
- Create: `src/arrange/render/renderSessionWav.ts`
- Test: `src/arrange/render/renderSessionWav.test.ts`

**Interfaces:**
- Consumes: `encodeWavPcm16(channels, sampleRate)` from `@/audio/wavEncode`; `SessionModules` from `@/arrange/session`; `ArrTrack, Mode` from `@/arrange/types`.
- Produces:
  ```ts
  // renderModuleWav.ts
  export function renderModuleToChannels(
    args: { tracks: ArrTrack[]; regions: TemplateRegion[]; masterDb: number; sampleRate?: number; onProgress?: (frac: number) => void },
    cfg?: EcosonicConfig,
  ): Promise<Float32Array[]>;
  // renderSessionWav.ts
  export function renderSessionToWav(
    args: { tracks: ArrTrack[]; regionsByMode: Record<Mode, TemplateRegion[]>; order: Mode[]; masterDb: number; sampleRate?: number; onProgress?: (frac: number) => void },
    cfg?: EcosonicConfig,
  ): Promise<Blob>;
  ```

- [ ] **Step 1: Refactor `renderModuleWav.ts` to expose a channel-returning core**

In `src/arrange/render/renderModuleWav.ts`, rename the current exported function body: change the signature line

```ts
export async function renderModuleToWav(
  args: {
    tracks: ArrTrack[];
    regions: TemplateRegion[];
    masterDb: number;
    sampleRate?: number;
    onProgress?: (frac: number) => void;
  },
  cfg: EcosonicConfig = defaultConfig,
): Promise<Blob> {
```

to

```ts
export async function renderModuleToChannels(
  args: {
    tracks: ArrTrack[];
    regions: TemplateRegion[];
    masterDb: number;
    sampleRate?: number;
    onProgress?: (frac: number) => void;
  },
  cfg: EcosonicConfig = defaultConfig,
): Promise<Float32Array[]> {
```

Then change the final two lines of that function from:

```ts
  const channels = Array.from({ length: rendered.numberOfChannels }, (_, c) => rendered.getChannelData(c));
  return new Blob([encodeWavPcm16(channels, sr)], { type: 'audio/wav' });
}
```

to:

```ts
  return Array.from({ length: rendered.numberOfChannels }, (_, c) => rendered.getChannelData(c));
}

/** Offline-render a single module to a WAV Blob (unchanged public behavior). */
export async function renderModuleToWav(
  args: {
    tracks: ArrTrack[];
    regions: TemplateRegion[];
    masterDb: number;
    sampleRate?: number;
    onProgress?: (frac: number) => void;
  },
  cfg: EcosonicConfig = defaultConfig,
): Promise<Blob> {
  const sr = args.sampleRate ?? 44100;
  const channels = await renderModuleToChannels(args, cfg);
  return new Blob([encodeWavPcm16(channels, sr)], { type: 'audio/wav' });
}
```

- [ ] **Step 2: Typecheck the refactor**

Run: `npx tsc --noEmit`
Expected: exit 0 (existing `renderModuleToWav` callers still compile).

- [ ] **Step 3: Write the failing test for `renderSessionToWav`**

`renderSessionToWav` should render each mode via `renderModuleToChannels` and concatenate the PCM before encoding. Test by mocking `renderModuleToChannels` (so no real `OfflineAudioContext` is needed) and spying on `encodeWavPcm16` to capture the exact concatenated channels handed to the encoder — no WAV decoding required:

```ts
// src/arrange/render/renderSessionWav.test.ts
import { describe, it, expect, vi } from 'vitest';
import type { ArrTrack, Mode, TemplateRegion } from '@/arrange/types';

// Mock the module core: each mode returns one channel of 4 samples, all set to a per-mode
// marker derived from the first region's trackId — so we can assert order + concatenation.
vi.mock('@/arrange/render/renderModuleWav', () => ({
  renderModuleToChannels: vi.fn(async (args: { regions: { trackId: string }[] }) => {
    const marker = args.regions[0].trackId.charCodeAt(0); // 65/66/67 for A/B/C
    return [Float32Array.from([marker, marker, marker, marker])];
  }),
}));

// Spy on the encoder to capture the concatenated channels directly.
const encodeSpy = vi.fn(() => new ArrayBuffer(8));
vi.mock('@/audio/wavEncode', () => ({ encodeWavPcm16: (...a: unknown[]) => encodeSpy(...a) }));

import { renderSessionToWav } from '@/arrange/render/renderSessionWav';

const tracks: ArrTrack[] = [];
const order: Mode[] = ['INTRODUCTION', 'DEEP_RELAXATION', 'RETURN'];
const reg = (id: string): TemplateRegion[] => [{ trackId: id, enterSec: 0, exitSec: 4, fadeInSec: 0, fadeOutSec: 0 }];
const regionsByMode = {
  INTRODUCTION: reg('A'), DEEP_RELAXATION: reg('B'), RETURN: reg('C'),
} as Record<Mode, TemplateRegion[]>;

describe('renderSessionToWav', () => {
  it('concatenates modules in order and encodes one blob', async () => {
    encodeSpy.mockClear();
    const blob = await renderSessionToWav({ tracks, regionsByMode, order, masterDb: 0, sampleRate: 44100 });
    expect(blob.type).toBe('audio/wav');
    const [channels, sr] = encodeSpy.mock.calls[0] as [Float32Array[], number];
    expect(sr).toBe(44100);
    expect(channels[0]).toHaveLength(12); // 3 modules × 4 samples
    expect([...channels[0]]).toEqual([65,65,65,65, 66,66,66,66, 67,67,67,67]); // A,B,C order
  });
  it('reports progress ending at 1', async () => {
    const seen: number[] = [];
    await renderSessionToWav({ tracks, regionsByMode, order, masterDb: 0, onProgress: (f) => seen.push(f) });
    expect(seen[seen.length - 1]).toBe(1);
  });
});
```

- [ ] **Step 4: Write `renderSessionWav.ts`**

```ts
// src/arrange/render/renderSessionWav.ts
import { config as defaultConfig, type EcosonicConfig } from '@/config';
import type { ArrTrack, Mode, TemplateRegion } from '@/arrange/types';
import { renderModuleToChannels } from '@/arrange/render/renderModuleWav';
import { encodeWavPcm16 } from '@/audio/wavEncode';

/** Render the whole session — every mode in `order`, back-to-back — to one WAV Blob,
 *  reusing the single-module offline renderer per mode and concatenating the PCM. */
export async function renderSessionToWav(
  args: {
    tracks: ArrTrack[];
    regionsByMode: Record<Mode, TemplateRegion[]>;
    order: Mode[];
    masterDb: number;
    sampleRate?: number;
    onProgress?: (frac: number) => void;
  },
  cfg: EcosonicConfig = defaultConfig,
): Promise<Blob> {
  const sr = args.sampleRate ?? 44100;
  const n = args.order.length;
  const perModule: Float32Array[][] = [];
  for (let i = 0; i < n; i++) {
    const mode = args.order[i];
    const channels = await renderModuleToChannels(
      {
        tracks: args.tracks,
        regions: args.regionsByMode[mode],
        masterDb: args.masterDb,
        sampleRate: sr,
        onProgress: (f) => args.onProgress?.((i + f) / n),
      },
      cfg,
    );
    perModule.push(channels);
  }

  const numChannels = perModule[0]?.length ?? 2;
  const totalLen = perModule.reduce((sum, ch) => sum + (ch[0]?.length ?? 0), 0);
  const channels = Array.from({ length: numChannels }, () => new Float32Array(totalLen));
  let offset = 0;
  for (const modChannels of perModule) {
    const len = modChannels[0]?.length ?? 0;
    for (let c = 0; c < numChannels; c++) channels[c].set(modChannels[c] ?? new Float32Array(len), offset);
    offset += len;
  }

  args.onProgress?.(1);
  return new Blob([encodeWavPcm16(channels, sr)], { type: 'audio/wav' });
}
```

- [ ] **Step 5: Run the render tests**

Run: `npx vitest run src/arrange/render/renderSessionWav.test.ts`
Expected: PASS (both cases).

- [ ] **Step 6: Full typecheck + suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc exit 0; all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/arrange/render/renderModuleWav.ts src/arrange/render/renderSessionWav.ts src/arrange/render/renderSessionWav.test.ts
git commit -m "feat(render): full-session WAV — channel-core refactor + renderSessionToWav concat"
```

---

### Task 5: UI — Play Session + Export Session buttons

**Files:**
- Modify: `src/components/layer2/ArrangeScreen.tsx`

**Interfaces:**
- Consumes: `session`, `playSession`, `endSession` from the store (Task 2); `buildSessionModules` from `@/arrange/session` (Task 1); `renderSessionToWav` from `@/arrange/render/renderSessionWav` (Task 4).
- Produces: no exported surface change.

This task is verified by typecheck + the manual run in Task 6.

- [ ] **Step 1: Add the imports**

In `src/components/layer2/ArrangeScreen.tsx`, after the `renderModuleToWav` import, add:

```ts
import { renderSessionToWav } from '@/arrange/render/renderSessionWav';
import { buildSessionModules } from '@/arrange/session';
```

- [ ] **Step 2: Subscribe to the new store slices**

After the existing `const setLive = useArrangement((s) => s.setLive);` line, add:

```ts
  const session = useArrangement((s) => s.session);
  const playSession = useArrangement((s) => s.playSession);
  const endSession = useArrangement((s) => s.endSession);
```

- [ ] **Step 3: Add the session-export handler**

After the existing `exportWav` function, add:

```ts
  const exportSession = async () => {
    if (renderPct !== null) return;
    setRenderPct(0);
    try {
      const { order, regionsByMode } = buildSessionModules(tracks, activeMode, moduleRegions, config);
      const blob = await renderSessionToWav({
        tracks,
        regionsByMode,
        order,
        masterDb,
        onProgress: (f) => setRenderPct(f),
      });
      downloadBlob(blob, `ecosonic-session.wav`);
    } catch {
      window.alert('Session WAV render failed — check the console for details.');
    } finally {
      setRenderPct(null);
    }
  };
```

- [ ] **Step 4: Add the Play Session button**

Immediately after the existing single-module Play `<button>` (the one whose `onClick` is `() => (playing ? pause() : play())`), add:

```tsx
          <button
            type="button"
            onClick={() => (session ? endSession() : playSession())}
            aria-pressed={!!session}
            title="Play the full session: Introduction → Deep Relaxation → Return, then stop"
            className={`rounded-full px-3.5 py-1.5 text-xs transition-calm ${
              session ? 'text-white' : 'bg-card text-muted-foreground hover:text-foreground'
            }`}
            style={session ? { background: 'var(--accent-ink)' } : undefined}
          >
            {session ? `Session ${session.index + 1}/${session.order.length}` : 'Play Session'}
          </button>
```

- [ ] **Step 5: Add the Export Session button**

Immediately after the existing Export WAV `<button>` (its `onClick` is `exportWav`), add:

```tsx
          <button
            type="button"
            onClick={exportSession}
            disabled={renderPct !== null}
            className="rounded-full border border-border px-3 py-1 text-xs transition-calm hover:text-foreground disabled:opacity-50"
          >
            {renderPct !== null ? `Rendering ${Math.round(renderPct * 100)}%` : 'Export Session'}
          </button>
```

(If the existing Export WAV button already shows `renderPct` text, this shares the same `renderPct` state — only one render runs at a time because both guard on `renderPct !== null`.)

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 7: Lint**

Run: `npx eslint src/components/layer2/ArrangeScreen.tsx`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/components/layer2/ArrangeScreen.tsx
git commit -m "feat(layer2): Play Session + Export Session controls"
```

---

### Task 6: Verify end-to-end + full suite

**Files:** none (verification only).

- [ ] **Step 1: Full typecheck + test suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc exit 0; all tests pass (existing + new from Tasks 1, 2, 4).

- [ ] **Step 2: Manual run of the app**

Use the `run` skill (or `npm run dev`) to open Layer Two. Verify:
- **Play Session** starts at Introduction; the label reads `Session 1/3`; when a module ends the header advances to the next mode and the label increments; after Return it stops and the button returns to `Play Session`.
- Single-module **Play** still loops one module and (per Task 2) clears any running session.
- **Export Session** downloads one WAV (`ecosonic-session.wav`); its duration ≈ `3 × moduleSeconds`; progress runs 0→100%.
- Existing **Export WAV** still downloads a single-module file.

- [ ] **Step 3: Commit any fixups**

If manual testing surfaced issues, fix, re-run Step 1, and commit with a descriptive message.

---

## Self-Review Notes

- **Spec coverage:** Session snapshot + fill rule → Task 1; store playSession/advance/end + play-clears-session → Task 2; scheduler chaining + boundary resync + stop-after-Return → Task 3; render channel-core refactor (behavior unchanged) + `renderSessionToWav` concatenation + progress → Task 4; Play Session & Export Session UI → Task 5; testing (`buildSessionModules`, store transitions, `renderSessionToWav` length/order) → Tasks 1/2/4; manual verification → Task 6.
- **YAGNI items** from the spec (no crossfade, no per-mode duration, no live-steer during session, no zip, no full-session loop) are simply not implemented — nothing to do.
- **Type consistency:** `SessionModules`, `regionsByMode`, `order`, `index`, `renderModuleToChannels`, `renderSessionToWav`, `buildSessionModules` used identically across tasks.

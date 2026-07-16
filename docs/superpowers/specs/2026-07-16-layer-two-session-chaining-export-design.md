# Layer Two — Chained Session Playback & Full-Session WAV Export

**Date:** 2026-07-16
**Status:** Approved (design)
**Area:** Layer Two (Module Designer / Gen-B)

## Problem

Layer Two designs one *module* at a time — the region-set for a single mode
(`INTRODUCTION`, `DEEP_RELAXATION`, or `RETURN`), each 600 s (10 min). Today:

- Playback **loops the single active module** (`useModuleScheduler.ts`: `if (pos >= D) pos -= D`).
- WAV export renders **only the active module** (`renderModuleWav.ts`).

Users want the three modes to play as one continuous ~30-min session
(Introduction → Deep Relaxation → Return), and to export that whole session as a
single WAV — not one module at a time.

## Core concept: the Session snapshot

The store holds only the *active* mode's regions. Both features need all three
modes' region-sets held together, so we introduce a **Session**: a snapshot of
the three modes' region-sets in playback order, built on demand and consumed by
**both** chained playback and export. Because both consume the same snapshot, the
exported WAV is exactly what was heard.

### Session-fill rule

For each mode, in `config.layerTwo.modes` order:

```
session.regionsByMode[mode] =
    (mode === activeMode) ? current on-screen moduleRegions
                          : seedModuleFromTable(tracks, mode)   // deterministic density table
```

So the mode you're actively designing contributes its on-screen (generated/edited)
regions; the other two are reseeded deterministically from their density tables.
The snapshot is rebuilt each time a session is started or exported, so later edits
are picked up on the next action.

## Feature 1 — Chained playback ("Play Session")

### UI
- New **Play Session** control in the Layer Two header, distinct from the existing
  single-module Play (which continues to loop one module).
- While a session plays, the header reflects the current module (existing
  `activeMode` label / tabs update as it advances) and the existing clock shows
  position within the current module.

### Store additions (`arrangementStore.ts`)
- State: `session: { order: Mode[]; regionsByMode: Record<Mode, TemplateRegion[]>; index: number } | null`
- `playSession()` — build the snapshot per the fill rule; set `session` with
  `index: 0`; set `activeMode` + `moduleRegions` to the first mode; `positionSec: 0`;
  `playing: true`.
- `advanceSession()` — if `index + 1 < order.length`: `index++`, swap
  `moduleRegions` and `activeMode` to the next mode, `positionSec: 0`. Otherwise
  call `endSession()`.
- `endSession()` — `session: null`, `playing: false`, `positionSec: 0`.
- `play()` (single-module) and `pause()` clear the session (`session: null`) so the
  two playback modes never interleave.

### Scheduler change (`useModuleScheduler.ts`)
- Replace the wrap `if (pos >= D) pos -= D` with:
  - If `st.session` is active and `pos >= D` → `st.advanceSession()` and skip the
    rest of this frame (next frame reads the new mode's state).
  - Else (no session) → keep the current loop behavior `pos -= D`.
- **Boundary resync:** track the last-seen `activeMode` locally; when it changes
  (a session advance), force `resync = true` so every present track re-seeks to its
  sample offset at the new module's `pos = 0`. This makes the mode transition clean
  (old tracks released, new tracks triggered from 0).
- After `RETURN` ends, `endSession()` sets `playing: false`. This stops exactly like
  a normal Pause: the scheduler's not-playing branch holds the (now near-silent, since
  `RETURN` has faded to 0 at `pos → D`) sources suspended, same as pausing any module.
  No special teardown is needed. Position resets to 0 as part of `endSession` so a
  subsequent single-module Play starts clean.

## Feature 2 — Full-session export ("Export Session")

### Render refactor (`renderModuleWav.ts`)
- Extract `renderModuleToChannels(args, cfg): Promise<Float32Array[]>` — the current
  offline-render core, returning raw channel data instead of a Blob.
- `renderModuleToWav` becomes a thin wrapper: call `renderModuleToChannels`, then
  `encodeWavPcm16`. **Existing behavior and signature unchanged.**

### New `renderSessionToWav` (`renderSessionWav.ts`)
- Input: `{ tracks, regionsByMode, order, masterDb, sampleRate?, onProgress? }`.
- For each mode in `order`, call `renderModuleToChannels` with that mode's regions.
- Concatenate the per-module channel arrays into one continuous set of channels
  (length `order.length × D × sr` per channel), then `encodeWavPcm16` → one Blob.
- Progress maps each module into an equal slice of `[0, 1]`
  (e.g. module *i* of *n* reports `(i + frac) / n`).

### UI
- New **Export Session** button beside the existing Export WAV button, reusing the
  existing `renderPct` progress state/label.
- Build the session snapshot with the **same fill rule** (shared helper
  `buildSessionModules(state)`) so export matches playback.

## Shared helper

`buildSessionModules(tracks, activeMode, moduleRegions, cfg)` → `{ order, regionsByMode }`,
used by both `playSession()` and Export Session, so the fill rule lives in one place.

## Testing

- **`buildSessionModules`**: `order` equals `config.layerTwo.modes`; the active mode's
  entry is the passed-in `moduleRegions` (identity), the other two equal
  `seedModuleFromTable(tracks, mode)`.
- **Store transitions**: `playSession` sets index 0 + first mode's regions;
  `advanceSession` increments index and swaps `moduleRegions`/`activeMode`;
  `advanceSession` on the last mode calls `endSession` (`session: null`,
  `playing: false`).
- **`renderSessionToWav`**: decoded output sample count per channel equals
  `order.length × ceil(D × sr)`; module order preserved (assert boundaries by
  rendering distinct-length dummy regions or by mocking `renderModuleToChannels`).

The RAF/time-based chaining in the scheduler is exercised indirectly via the store
transition tests; the scheduler wiring itself is not unit-tested (consistent with
the existing scheduler having no unit test).

## Out of scope (YAGNI)

- No crossfades between modules (each module already fades 0 → peak → 0).
- No per-mode duration editing (all modules are `moduleSeconds`).
- No live-steer during session chaining.
- No zip / multi-file export (single concatenated WAV only).
- No looping the full session (stops after `RETURN`).

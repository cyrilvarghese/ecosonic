# ADR-0006 — Reuse the Layer One AudioEngine with per-track trigger/release

**Status:** Accepted · 2026-07-04

## Context

Layer Two needs to play the same tracks Layer One loads, but drive them differently (start/stop per
clip, seek to offsets, resume/suspend for a session). Options considered:
1. A second per-track "arrangement gain" node in series.
2. Native `AudioParam` automation curves precomputed for the whole session.
3. Reuse the existing `AudioEngine`/`Layer`, extending them minimally.

Layer One's controls are not live on `/layer2`, so there is no real conflict to isolate with a
second gain node; and precomputed curves make pause/seek/edit a full reschedule and complicate a
live playhead.

## Decision

**Reuse the shared `AudioEngine`/`Layer`.** Add a small Layer-Two-specific surface:
- `Layer.trigger(offsetSec)` / `Layer.release(rampMs)` — playback control (ADR-0002/0003).
- `AudioEngine.triggerTrack/releaseTrack/resumeContext/suspendContext/getLayerDuration`.
- `useLayer2Engine` loads tracks *not started*; a rAF `useModuleScheduler` drives trigger/release.

A **navigation race** was found and fixed as a consequence: `setTracks` `await`s each sample load,
and navigating away calls `engine.clear()` (nulling the `AudioContext`) mid-load, so the next
`new Layer(null, …)` threw on `createGain`. `setTracks` now bails if the context was cleared during
an await.

## Consequences

- **+** One audio codebase; buffer/stream handling, analyser taps, and loading are shared.
- **+** Minimal new surface; pause/seek are trivial (context + discrete re-seek).
- **−** The `Layer` class now serves two control models (Layer One gain/mute + Layer Two
  trigger/release); its responsibilities are broader.
- **−** Lifecycle care needed around async loads vs. teardown (the race above); guarded, but a
  reminder that shared mutable audio state spans routes.
- Rejected: second gain node (no benefit here); precomputed automation (poor fit for live editing).

# Per-Mode Edit Persistence (Layer Two · ROADMAP Phase B) — Design

**Status:** Approved design (2026-07-10)
**Related:** [ROADMAP §4/§8](../../ROADMAP.md) · [PRD §6.3](../../PRD.md) ·
[ADR-0005 (single-module-first)](../../adr/0005-single-module-first.md) ·
[`src/arrange/arrangementStore.ts`](../../../src/arrange/arrangementStore.ts)

## 1. Problem

The mode picker works, but switching modes destroys work:
[`loadMode`](../../../src/arrange/arrangementStore.ts) reseeds `moduleRegions` from the mode's
canonical timing table (`buildModeTemplate`) on every switch, discarding drag-edits and generated
arrangements. You cannot design the three modes independently and move freely between them — the
remaining Phase-B gap named in ROADMAP §4.

## 2. Decisions (brainstormed 2026-07-10)

1. **What persists:** *whatever's on screen* — drag edits **and** Generate results alike. Leaving a
   mode keeps its current arrangement; returning restores it exactly. No hidden distinction between
   edited and unedited states.
2. **Reset path:** a **per-mode Reset button** (next to Generate) restores the *active* mode to its
   canonical table. This replaces the escape hatch that destructive mode-switching accidentally
   provided. (Generate is not a substitute — it yields a seed-varied draw, not canon.)
3. **Storage:** write-through to **`composition.templates[activeMode]`** — the home ROADMAP §4
   already names for Phase B and the exact shape Phase C's composition view will read. No new state
   shape; no second source of truth.

## 3. Store design

**Invariant:** `moduleRegions` (the working view the UI binds to) is always a copy of
`composition.templates[activeMode].regions`. Every mutation writes both; the stored copy is never
stale.

| Action | Today | After |
|---|---|---|
| `initFrom` | seeds `moduleRegions` via `seedModuleFromTable`; builds `composition` separately | builds `composition` first, seeds `moduleRegions` **from** `composition.templates[modes[0]].regions` (same values — `buildComposition` uses `buildModeTemplate` internally — but one source) |
| `updateModuleRegion` (drag) | writes `moduleRegions` only | writes `moduleRegions` **and** `composition.templates[activeMode].regions` |
| `generateModule` | writes `moduleRegions` only | writes both |
| `loadMode(mode)` | **reseeds** from the table (destroys edits) | **restores** `moduleRegions` from `composition.templates[mode].regions`; `positionSec` still resets to 0 |
| `resetMode()` — **new** | — | reseeds the active mode from `buildModeTemplate(tracks, activeMode)` and writes both |
| `setDurationMin` | rebuilds the whole composition (`buildComposition`) — would wipe stored edits | rebuilds **sequence/bridges/totalSec** but carries the existing `templates` over onto the new composition |

Notes:
- `composition` is non-null after `initFrom` (always built there). If a mutation runs with no
  composition (only reachable in tests that skip `initFrom`), `moduleRegions` still updates and
  only the template write is skipped.
- Region copies are shallow-cloned on write-through so the template and the working view never
  share mutable region objects.
- Fade caps on drag (`fadeIn/OutSec ≤ half width`) already applied in `updateModuleRegion` carry
  into the template unchanged — restore never needs to re-clamp.

## 4. UI

One addition to [`ArrangeScreen.tsx`](../../../src/components/layer2/ArrangeScreen.tsx): a
**Reset** button beside Generate, same pill styling, calling `resetMode()`. Mode buttons are
unchanged — they simply stop losing work.

## 5. Testing (store-level, Vitest)

1. Drag-edit Introduction → switch to Deep Relaxation → switch back → the edit is restored exactly.
2. Generate → round-trip through another mode → the generated arrangement is restored exactly.
3. `resetMode()` output equals `buildModeTemplate(tracks, activeMode)`'s regions.
4. `setDurationMin` preserves edited templates (edit → change duration → edit still present).
5. A drag writes through: `composition.templates[activeMode]` reflects the change immediately
   (not only after a switch).

## 6. Out of scope

- Per-mode playhead memory (playhead resets to 0 on switch, as today — decided in brainstorm).
- Persistence across hard refresh (PRD: sessions are in-memory only).
- Per-instance variation of repeated modes (Phase D; needs a `Composition` model change).
- Surfacing composition playback / the Phase C view — though this design *is* the write-side half
  of ROADMAP §6's reconciliation, so Phase C reads edits with zero migration.

## 7. Success criteria

- Switching modes never discards work; each mode round-trips exactly (drag edits and generated
  arrangements alike).
- Reset restores the active mode to the brief's canonical table on demand.
- A duration change does not wipe per-mode edits.
- All existing store/scheduler tests still pass; the five tests above pass.

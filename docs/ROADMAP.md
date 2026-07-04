# ECOSONIC Layer Two — Build Roadmap & Mode/Track Model

**Status:** Living document · **Last updated:** 2026-07-04
**Related:** [PRD](./PRD.md) · [SPEC](./SPEC.md) · [ADR-0005 (single-module-first)](./adr/0005-single-module-first.md)

This document records **what has been built**, **how we chose to build it (one mode first, then the
rest one by one)**, and the **drill-down hierarchy** of composition → modes → tracks-per-mode.

---

## 1. The mental model — three levels of drill-down

```
COMPOSITION  (the whole session — STRUCTURE view)
│   a timeline of module instances; bridges/crossfades between them; one session playhead
│
├── MODULE / MODE  (a reusable 10-min template — Relaxation │ Immersion │ Return)
│     each mode is a "density table": which categories play, and how densely
│
└──── TRACKS PER MODE  (the DETAIL view — the Module Designer)
        every handed-off track as a clip [enter, exit] on the module timeline
        seeded from the mode's density table, then hand-dragged
```

- **Zoom out** = the **Composition**: you see modes as blocks on a session timeline and sequence
  them (with bridges). *Not surfaced yet — engine built, UI parked.*
- **Zoom in** (drill down into one module) = the **Module Designer**: you see *that mode's tracks*
  as clips and orchestrate their entrances/exits. *This is what ships today.*

The two levels stay in sync: editing a mode's tracks reshapes the density summary that the
composition view shows for every instance of that mode.

## 2. Why one mode first (the build strategy)

We deliberately built the **innermost level first** — a single mode's Module Designer — before the
composition/sequencing around it. Rationale (see [ADR-0005]):

1. **The core interaction is the risk.** "Layer One, but the tracks are draggable to orchestrate
   when they come and go" is the heart of Layer Two. Get that right — drag, playback-from-the-clip,
   sample-accurate scrub — and everything else is arrangement *of* it.
2. **Showing all modes × all tracks at once is unusable.** A single flat wall of every track in
   every mode is noise. Drilling into one mode at a time keeps each screen legible.
3. **No throwaway work.** The full composition engine (templates, sequence, bridges, per-track
   scalar) is already implemented and unit-tested underneath; only its *UI* is deferred.

So the order is **inside-out**: perfect one mode → add the other modes one by one → sequence them.

## 3. Where we are now (Phase A — done)

Layer One is complete. Layer Two ships a **single-module designer** for **one mode at a time**
(currently seeded from `modes[0]` = Relaxation):

- Handoff from Layer One (non-muted tracks + ceilings + element + tuning + master).
- Every track is a **draggable clip**; seeded from the **density table** (bed spans the module,
  drivers stagger to the mid-module peak).
- **Clips control playback** (trigger/release), honoring baked fades — loop if shorter, cut if
  longer ([ADR-0002]).
- **Sample-accurate scrub** + single playhead + `played/total` readout ([ADR-0003]).
- Element theme inherited.

**Parked (built + tested, not wired):** `buildModeTemplate`, `buildSequence`, `buildComposition`,
`trackScalar`, `crossfade`, `useArrangementScheduler`, and the `ModuleBand`/composition-as-track UI.

## 4. Next — the other modes, one by one (Phase B)

Add **mode selection** so each mode is designed in turn: Relaxation → Immersion → Return. Each mode
is a distinct **density table** and a distinct **template** the user refines.

What each mode should look like when you drill in (from `config.layerTwo.modeRules`):

| Category | Relaxation | Immersion (deep/sparse) | Return (full) |
|---|---|---|---|
| NOISE / ISO / PLANET (bed) | continuous | continuous | continuous |
| ELEMENT | continuous | active (some movement) | continuous |
| BASS | sparse | **absent** | active |
| PAD | active | **absent** | active |
| MELODY | sparse | **absent** | sparse |
| FX | sparse | **absent** | active |
| **feel** | settling, medium | inward, stripped-back | re-emergent, full |

### How the tables become clips

The modes are **pure config** — two tables under `config.layerTwo` (in
[config/ecosonic.config.json](../config/ecosonic.config.json)), validated by
[src/config.ts](../src/config.ts):

- **`modeRules[mode][category]`** → a **presence tier**: `continuous | active | sparse | absent`.
- **`presenceBands[tier]`** → `[lo, hi]`, the fraction of the module the clip occupies:

  | tier | band | meaning |
  |---|---|---|
  | `continuous` | `[0.0, 1.0]` | spans the whole module (the bed) |
  | `active` | `[0.18, 0.82]` | wide, mid-module |
  | `sparse` | `[0.4, 0.6]` | short, hugging the peak |
  | `absent` | — | no clip (silent this mode) |

[`buildModeTemplate(tracks, mode, cfg)`](../src/arrange/buildModeTemplate.ts) reads them: for each
track, look up its category's tier; `absent` → no clip; else place a clip at
`[lo·moduleSeconds, hi·moduleSeconds]`. Bed clips are exact `[0, D]`; drivers get a tiny per-index
jitter so equal tiers don't stack identically.

**Worked example — RELAXATION at `moduleSeconds = 600`:**
```
NOISE / ISO / PLANET / ELEMENT   continuous → clip [0:00 – 10:00]   (the bed, spans the module)
PAD                              active     → clip [1:48 – 8:12]     (wide, mid-module)
BASS / MELODY / FX               sparse     → clip [4:00 – 6:00]     (short, hugging the peak)
```
Stack those and the overlap (density) peaks mid-module — the growth→peak→decrease, built purely from
where the clips sit (no imposed curve; see [ADR-0001](./adr/0001-density-is-the-arrangement.md)).
The tables are an explicit **tunable starter set** ([ADR-0004](./adr/0004-mode-rules-as-config-data.md)).

Implementation notes (the store is already shaped for this):
- `arrangementStore` already carries `activeMode` and a full `composition.templates[mode]` per mode.
- Phase B adds a **mode picker** that sets `activeMode` and (re)seeds `moduleRegions` via
  `buildModeTemplate(tracks, activeMode)` — i.e. "load this mode's density table."
- Each mode's edits persist in its own template (**shared** across that mode's instances — repeats
  are identical until sample regeneration lands; see Phase D).

## 5. Then — sequence the modes (Phase C)

Surface the **Composition** view:
- Modules as blocks on a session timeline (duration-driven count; modes cycle
  Relaxation→Immersion→Return).
- **Adjustable bridges** (crossfade overlaps) between adjacent modules; continuity bed carries
  through, drivers crossfade.
- One **session playhead**; play the whole session; click a module to drill into its Module Designer.
- Powered by the already-built `buildComposition` / `trackScalar` / `crossfade`.

At this point the two code paths (single-module `moduleRegions` vs. `composition.templates`) get
**reconciled**: the designer edits `composition.templates[activeMode]`, and playback uses the
composition scheduler.

## 6. Later — advanced (Phase D)

- **Sample regeneration** — swap unlocked samples between/within modules so repeats vary (needs the
  Lock status already carried in the handoff).
- **Density dynamics** — ISO↔PLANETS alternation, time-varying rarefaction.
- **Tuning** wired to `playbackRate`; **effects** once Layer One models them; **persistence**.

## 7. Phase summary

| Phase | Scope | Status |
|---|---|---|
| **A** | Single mode's Module Designer (drag clips, playback, scrub) | ✅ done |
| **B** | Mode selection — design each mode's tracks one by one | ⏭ next |
| **C** | Composition — sequence modules + bridges + session playhead | 🅿 engine built, UI parked |
| **D** | Regeneration, density dynamics, tuning, effects, persistence | ⏳ later |

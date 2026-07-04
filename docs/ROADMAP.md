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
├── MODULE / MODE  (a reusable 10-min template — Introduction │ Deep Relaxation │ Return)
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

## 4. The modes — timing tables from the production brief (Phase B, partly done)

Each mode is a **10-min section** with an explicit **timing table** — transcribed from the
production brief (`TRACK INFO`) — giving every layer an `enter / exit / fadeIn / fadeOut` in seconds.
The three sections:

- **Introduction** — the build-up: layers enter staggered and hold, then fade near the end.
- **Deep Relaxation** — stripped back: only the environmental bed (Sub-Elements¹ + Noise + ISO +
  PLANETS); **no PAD / Bass / Melody / FX**; bed fades ~7:00; the final 2 min are elements only.
- **Return** — mirrors Introduction, then a full fade-out finale.

**Introduction timings (`config.layerTwo.modeRules.INTRODUCTION`):**

| Layer | enter | exit | notes |
|---|---|---|---|
| NOISE | 0:00 | 10:00 | continuous, no fade-out |
| ELEMENT / FX² | 0:00 | 10:00 | the soundscape identity |
| ISO | 1:00 | 9:00 | 1-min fades |
| PLANET | 2:00 | 9:00 | after ISO peaks |
| PAD | 3:00 | 9:00 | 1-min fade-in |
| BASS | 4:00 | 9:00 | **no fade-in** — enters directly |
| ARP | 4:30 | 9:00 | arpeggiator, between Bass and Melody |
| MELODY | 6:30 | 9:00 | completes the harmony |

¹ **Sub-Elements** (`ELEMENT_SUB`) are now real: selected in Layer One and present only in Deep
Relaxation. Caveat — the sample library has Sub-Elements for EARTH/AIR/FIRE but **not WATER/ETHER**;
for those, ELEMENT carries the environmental base in Deep Relaxation.
² Per the brief, **FX is Fire's Element**, so FX is treated as an element-type layer (present
throughout), not a driver. A **2nd Element / Sub-Element** enters late (`secondElementEnterSec`,
~5:00) per the brief.

### How a mode becomes clips

The tables are **pure config** (`config/ecosonic.config.json` → `layerTwo.modeRules`, validated by
`src/config.ts`). Each entry is `{ enter, exit, fadeIn, fadeOut }` in seconds, or `null` = absent.
[`buildModeTemplate(tracks, mode, cfg)`](../src/arrange/buildModeTemplate.ts): for each track, look
up its category's timing; `null` → no clip; else a clip at `[enter, exit]` with the given fades
(capped to half the clip width). Multiple tracks of a category share that category's timing.

The staggered enters/exits make density rise then fall — the growth→peak→decrease emerges from clip
placement (no imposed curve; [ADR-0001](./adr/0001-density-is-the-arrangement.md)), and it's a
**tunable table** ([ADR-0004](./adr/0004-mode-rules-as-config-data.md)).

**Done:** a **mode picker** (Introduction / Deep Relaxation / Return) is wired — clicking reseeds
`moduleRegions` via `buildModeTemplate(tracks, mode)`, so you watch a mode's tracks load.
**Remaining (Phase B):** **per-mode edit persistence** — today switching modes reseeds from the table
and discards drag-edits; storing edits back into `composition.templates[mode]` will let you design
each mode independently and switch freely.

## 5. Then — sequence the modes (Phase C)

Surface the **Composition** view:
- Modules as blocks on a session timeline (duration-driven count; modes cycle
  Introduction→Deep Relaxation→Return).
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

# ECOSONIC Layer Two — Build Roadmap & Mode/Track Model

**Status:** Living document · **Last updated:** 2026-07-19
**Related:** [PRD](./PRD.md) · [SPEC](./SPEC.md) · [ADR-0005 (single-module-first)](./adr/0005-single-module-first.md) ·
[Generative framework](./generative/03-generation-framework.md)

This document records **what has been built**, **how we chose to build it (one mode first, then the
rest one by one)**, and the **drill-down hierarchy** of composition → modes → tracks-per-mode.

---

## 1. The mental model — three levels of drill-down

```
COMPOSITION  (the whole session — STRUCTURE view)
│   a timeline of module instances; bridges/crossfades between them; one session playhead
│
├── MODULE / MODE  (a reusable 10-min template — Introduction │ Deep Relaxation │ Return)
│     each mode is a timing table: which layers play, and when (enter / exit / fade)
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

## 3. Where we are now

**Layer One** is complete — and now also selects **ARP** and **Sub-Elements** (see §4).
**Layer Two** ships a **single-module designer** with a **mode picker** (Introduction / Deep
Relaxation / Return); it opens on Introduction (`modes[0]`):

- Handoff from Layer One (non-muted tracks + ceilings + element + tuning + master).
- Every track is a **draggable clip**, seeded from the chosen mode's **timing table** (§4) — or
  **generated** from the grammar (§5) via the Generate button + drift picker.
- **Clips control playback** (trigger/release) — loop if shorter, cut if longer ([ADR-0002]) —
  and the scheduler drives each region's **~1-min volume envelope** (0 → ceiling → 0,
  [ADR-0007](./adr/0007-generated-playback-uses-volume-envelope.md)); baked fades play underneath.
- **Sample-accurate scrub** + single playhead + `played/total` readout (`×N` when looping)
  ([ADR-0003]).
- **Loop visualization** (per-repeat waveform segments + dividers) and a **Volume view**
  (DAW-style envelope line per clip, waveform dimmed under it).
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
| DRONE | 3:00 | 9:00 | sustained swell, with PAD; below PAD in the stack; randomized in Deep Relaxation |
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

## 5. The generative engine — grammar (built) and live scheduler (next session)

The [generative framework](./generative/03-generation-framework.md) (from the
[brief analysis](./generative/01-brief-analysis.md) + [domain research](./generative/02-domain-research.md))
has two parts with their own ledger — **distinct from this doc's Phase A–D letters**:

| Part | Scope | Status |
|---|---|---|
| **Gen-A · Grammar → tables** | `layerTwo.generation` config (`canon ± half` ranges, `after` ordering, presence); seeded PRNG; `generateModeTemplate` (drift-scaled draw, bottom-up order enforced); `validateTemplate` (invariants I1–I6); `generateComposition`; Generate + drift UI | ✅ **done 2026-07-09** (plan: [2026-07-09-generative-grammar-phase-a](./superpowers/plans/2026-07-09-generative-grammar-phase-a.md)) |
| **Gen-B · Live scheduler** | Live-steerable module playback: `steerModule` splice (drift + in-next/hold nudges), Live toggle, JSON/WAV snapshot export | ✅ **module scale done 2026-07-10** ([spec](./superpowers/specs/2026-07-10-gen-b-live-scheduler-design.md) · [plan](./superpowers/plans/2026-07-10-gen-b-live-scheduler.md)) — session scale (live bridges, per-instance regeneration) later |

**Gen-B status:** module scale **built 2026-07-10** — Live toggle in the designer; drift changes and
per-lane in-next/hold nudges redraw the un-played future (splice at the playhead, past verbatim,
I1–I6 enforced); untouched loops repeat the last-drawn pass (generation is purely reactive); JSON
arrangement export/import + offline WAV render (snapshot semantics — never interrupts live play).
Deferred to session scale: live bridges, regeneration between module instances, a listener surface.
Provenance + assessment: [04-gen-b-scheduler-rationale.md](./generative/04-gen-b-scheduler-rationale.md).

Decisions already locked that Gen-B inherits: envelope-path fades ([ADR-0007]), drift names
(STRICT/MODERATE/EXPLORATORY), fades keep slight jitter (brief says "average ~1 min"), seed internal.

## 6. Then — sequence the modes (Phase C)

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

## 7. Later — advanced (Phase D)

- **Sample regeneration** — swap unlocked samples between/within modules so repeats vary (needs the
  Lock status already carried in the handoff).
- **Density dynamics** — ISO↔PLANETS alternation, time-varying rarefaction.
- **Per-instance variation** — `Composition.templates` is per-mode, so repeated instances of a mode
  share one generated arrangement; varying each instance needs a small `Composition` model change.
- **Tuning** wired to `playbackRate`; **effects** once Layer One models them; **persistence**.

## 8. Rule Discovery (adjacent tool — built)

Separate from the Layer-Two build ladder, `/rules` is a workshop that **derives composition rules
from real reference tracks** and folds the good ones into the generator's grammar (full description:
[PRD §7](./PRD.md)). The model hears audio **blind** (told only what layers sound like, never the
house rules); a **deterministic local matcher** tags each observation `confirms / contradicts /
novel` against the grammar. It has grown in three steps:

| Step | Scope | Status |
|---|---|---|
| **Blind analysis + Keep/Promote** | Single-pass blind analysis → candidates → keep to registry, promote structured rules into `layerTwo.generation` | ✅ done 2026-07-15 ([design](./superpowers/specs/2026-07-15-rule-discovery-page-design.md)) |
| **Three-pass per-mode** | Slice the upload client-side into 3×10-min windows (16 kHz mono), analyze each as its known mode (Intro/Deep/Return) in parallel with per-tab isolation; deterministic mode replaces the fragile section-guess | ✅ done 2026-07-18 ([design](./superpowers/specs/2026-07-18-three-pass-analysis-design.md)) |
| **Timeline view + Save/Reload** | Per-tab Timeline ⇄ Cards toggle (lanes + grammar ghost bands + verdict-tinted bars, 1-min axis); auto-save analyses server-side by file name, reload/delete from an accordion (no re-analysis cost) | ✅ done 2026-07-19 ([timeline](./superpowers/specs/2026-07-19-analysis-timeline-design.md) · [save/reload](./superpowers/specs/2026-07-19-analysis-save-reload-design.md)) |

Next candidates (not scheduled): cross-module continuity checks (R7/R8 across passes), grammar
"expected-but-absent" lanes on the timeline, and surfacing structured `enter/exit` on the cards so
they reconcile with the timeline bars.

## 9. Phase summary

| Phase | Scope | Status |
|---|---|---|
| **A** | Single mode's Module Designer (drag clips, playback, scrub) | ✅ done |
| **B** | Mode picker + per-mode edit persistence | ◐ picker done; persistence [spec approved 2026-07-10](./superpowers/specs/2026-07-10-per-mode-edit-persistence-design.md), parked |
| **C** | Composition — sequence modules + bridges + session playhead | 🅿 engine built, UI parked |
| **D** | Regeneration, density dynamics, tuning, effects, persistence | ⏳ later |
| **Gen-A** | Generative grammar → timing tables + Generate/drift UI (§5) | ✅ done 2026-07-09 |
| **Gen-B** | Live generative scheduler (live-steerable playback) | ✅ module scale done 2026-07-10; session scale later (§5) |
| **Rules** | Rule Discovery — blind analysis → three-pass → timeline + save/reload (§8) | ✅ done 2026-07-15 → 07-19 |

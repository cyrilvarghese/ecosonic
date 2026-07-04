# ADR-0005 — Build the single-module designer first; park the composition engine

**Status:** Accepted · 2026-07-04

## Context

Layer Two was first specced as the full two-view product: a **Composition** view (an editable module
*track* with draggable modules and adjustable bridges) plus a **Module Designer** (per-mode track
clips). The complete engine for that — `buildModeTemplate`, `buildSequence`, `buildComposition`,
`trackScalar`, `bridges` — was implemented and unit-tested, and a playable `/layer2` was wired.

On first hands-on use the domain owner asked to **step back**: nail the core interaction — *"just
like Layer One but the tracks are draggable to orchestrate coming in and out"* — before layering on
modes, sequencing, and bridges. Showing all modes × all tracks at once was also too much to design
against.

## Decision

Ship a **single-module designer** as the current MVP:
- One Wave Module; the handed-off tracks as **draggable clips** seeded from the density table.
- Playback loops that one module; controls: play/pause, scrub, single playhead, `played/total`.
- **Keep** the composition machinery (templates, sequence, bridges, `trackScalar`) in the repo,
  fully tested, but **not surfaced** in the UI. Modes/sequencing are the next phase.

## Consequences

- **+** Fast, focused iteration on the interaction that matters most (drag + playback + scrub).
- **+** No throwaway work — the parked engine is the foundation for the multi-module phase.
- **+** The UI models one dead-simple structure (`moduleRegions`), easy to reason about.
- **−** Two parallel code paths exist temporarily (single-module `moduleRegions` + the parked
  `composition`); the store carries both. To be reconciled when sequencing lands.
- **−** Some already-built UI (module band, composition-as-track) is shelved for now.

# ADR-0001 — Density *is* the arrangement (no global volume envelope)

**Status:** Accepted · 2026-07-03

## Context

The source brief describes each Wave Module as a curve: *Growth → Peak → Decrease*, peak ~minute 5.
An early design modeled this as a **global volume envelope** — a master curve (plus a session arc)
that multiplied every track's gain to produce the swell.

Review with the domain owner surfaced that this is wrong on two counts:
1. The brief's curve is **sound density** ("how much material is present"), realized through
   *sample entry/exit, fade-in/out, volume automation* — not a single master gain.
2. The peak "happens because more tracks are playing," i.e. it is **emergent from the arrangement**,
   not imposed by a curve. Forcing a global curve also fought the composer's intent.

## Decision

There is **no global volume/session envelope**. **Density = the set of track regions on the
timeline.** The module's growth→peak→decrease and the session's arc are the *sum of overlapping
clips*. The engine imposes only per-clip behavior and each track's Layer One ceiling.

The generative starting point is produced by staggering clips from a **mode density table**
(continuity bed spans the module; drivers cluster toward the peak) — but the result is *just
regions*, which the composer then edits. "Peak at minute 5" is where the most clips overlap,
placed there by generation and/or the user.

## Consequences

- **+** Matches the brief's language and the composer's mental model; the timeline you edit *is* the
  density curve.
- **+** Simpler engine: no envelope math to reconcile with per-clip fades.
- **+** A single pure representation (`TemplateRegion[]`) drives both audio and UI.
- **−** No one-knob "make the whole thing swell"; intensity is shaped by arranging clips (by hand or
  by the density table).
- Superseded the earlier "plateau envelope" design entirely.

# ADR-0004 — Mode rules live in config as a tunable density table

**Status:** Accepted · 2026-07-03

## Context

The brief names three modes (Relaxation / Immersion / Return) and says each defines "which
categories play, which are excluded, how dense," etc. — but gives **no concrete rules or numbers**,
and the mode list is even inconsistent with the mockup (which adds "Expansion"). The behavior is
genuinely underspecified and expected to be **tuned by ear**.

We needed a way to seed a module's arrangement (which tracks, how staggered) without hard-coding
policy that will change.

## Decision

Separate **mechanism from policy**:
- **Mechanism** (code): `buildModeTemplate`, which turns a mode's table into `TemplateRegion[]`.
- **Policy** (config data): `config.layerTwo.modeRules` maps `Mode → Category → { enter, exit,
  fadeIn, fadeOut }` in seconds (or `null` = absent) — an explicit **per-layer timing table**,
  tunable, not fixed in code.

> **Update (2026-07-04):** the initial version used coarse presence *tiers*
> (`continuous | active | sparse | absent`) + a `presenceBands` map. When the precise production
> brief (`TRACK INFO`) arrived with exact per-layer timings (ISO@1:00, PLANETS@2:00, PAD@3:00,
> Bass@4:00, Melody@6:30, exits ~9:00), the tiers were replaced by explicit timings. The
> mechanism/policy split held — it was a config + schema change, no rework of the consuming code.

The modes are the brief's three sections: **Introduction / Deep Relaxation / Return**. `ARP` and
`ELEMENT_SUB` (Sub-Elements) are real categories (selected in Layer One, placed by the tables);
`FX` is treated as an element-type layer per the brief; a 2nd Element/Sub-Element enters ~5:00.

## Consequences

- **+** Tuning the feel = editing config, not code; validated by Zod at startup.
- **+** Modes become data, so "add a mode" or "reshape density" is low-risk.
- **+** The same table seeds the single-module designer today and the multi-module composition later.
- **−** Config and the (loose) brief can drift; the table is authoritative, the brief is guidance.
- Corrected an early starter table that made the bed `active` (drivers-only would leave ~2 min of
  NOISE-only at each module open); the fix was one config edit, validating this split.

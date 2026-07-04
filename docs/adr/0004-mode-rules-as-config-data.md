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
- **Mechanism** (code): the envelope/region math and `buildModeTemplate`, which turns a mode's rules
  into staggered `TemplateRegion[]` whose overlap peaks mid-module.
- **Policy** (config data): `config.layerTwo.modeRules` maps `Mode → Category → Presence`
  (`continuous | active | sparse | absent`), and `presenceBands` maps each presence tier to a
  region band within the module. These are an explicit **starter "sample" set** to be tuned, not a
  fixed spec.

Bed categories (NOISE/ISO/PLANET/ELEMENT) default to `continuous` (the perceptual foundation);
drivers (BASS/PAD/MELODY/FX) stagger to build the density peak.

## Consequences

- **+** Tuning the feel = editing config, not code; validated by Zod at startup.
- **+** Modes become data, so "add a mode" or "reshape density" is low-risk.
- **+** The same table seeds the single-module designer today and the multi-module composition later.
- **−** Config and the (loose) brief can drift; the table is authoritative, the brief is guidance.
- Corrected an early starter table that made the bed `active` (drivers-only would leave ~2 min of
  NOISE-only at each module open); the fix was one config edit, validating this split.

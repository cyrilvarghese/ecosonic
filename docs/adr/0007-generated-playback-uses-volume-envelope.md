# ADR-0007: Generated / composition playback uses the volume-envelope path

**Status:** Accepted (2026-07-09) · Supersedes [ADR-0002](./0002-clips-control-playback-not-gain.md) *for composition playback only*.

## Context

The generative framework (`docs/generative/03-generation-framework.md`) emits ~1-min fades per
region. [ADR-0002](./0002-clips-control-playback-not-gain.md) established that the single-module
designer treats a clip as playback trigger/release, with the sample's baked fades as the only fades.

## Decision

Generated **composition** playback applies a ~1-min cosine **volume envelope** per region via
`regionEnvAt` / `trackScalarAt`. The shipping **single-module** designer is unchanged (still
trigger/release, ADR-0002). The two paths coexist: baked fades for single-module audition, volume
envelopes for composition playback.

## Consequences

- The generator only needs to emit good `fadeIn/fadeOut` values; no new fade code.
- Hearing the envelope fades in-app depends on surfacing the composition scheduler (ROADMAP Phase C).

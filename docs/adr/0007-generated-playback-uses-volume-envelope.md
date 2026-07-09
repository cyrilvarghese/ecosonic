# ADR-0007: Generated / composition playback uses the volume-envelope path

**Status:** Accepted (2026-07-09) · Supersedes [ADR-0002](./0002-clips-control-playback-not-gain.md) *for composition playback only*.

## Context

The generative framework (`docs/generative/03-generation-framework.md`) emits ~1-min fades per
region. [ADR-0002](./0002-clips-control-playback-not-gain.md) established that the single-module
designer treats a clip as playback trigger/release, with the sample's baked fades as the only fades.

## Decision

Layer Two playback applies a ~1-min cosine **volume envelope** per region via `regionEnvAt`,
scaling the track's Layer One **ceiling** (`effectiveGain = ceilingGain × envelope`, never above it):

- **Composition** playback: `trackScalarAt` → `useArrangementScheduler` → `setTrackEnvelope`.
- **Single-module designer** (extended same day): `useModuleScheduler` drives
  `regionEnvAt(region, pos)` each tick, so clips audibly fade 0 → ceiling over `fadeInSec` and
  ceiling → 0 over `fadeOutSec`. Trigger/release still governs *playback* (ADR-0002); the envelope
  governs *gain on top of it*. Baked sample fades still play — the region fade shapes the volume.

## Consequences

- The generator only needs to emit good `fadeIn/fadeOut` values; no new fade code.
- `Layer.trigger()` ramps to the envelope-scaled gain (not the raw ceiling), so an entry under a
  fade-in starts quiet instead of blasting then dipping.
- Exceptions carry through the data: BASS (`fadeIn: 0`) still enters directly; a spanning NOISE
  (`fadeOut: 0`) never fades out.

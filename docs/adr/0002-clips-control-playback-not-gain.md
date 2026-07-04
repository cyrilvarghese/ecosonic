# ADR-0002 — Clips control playback (trigger/release), not gain

**Status:** Accepted · 2026-07-04

## Context

The first Layer Two runtime started every track looping once and used the clip `[enter, exit]` as a
**gain gate** (ramp the gain up at enter, down at exit) over a free-running loop. This meant a clip
re-entry *faded in mid-loop*, skipping the beginning of the sample.

The domain owner clarified a hard constraint: **the sound engineer bakes fade-in/out into each
sample.** A track must therefore *start from its own beginning* so the baked fade plays — the clip
must control **playback of the source**, not its volume.

## Decision

A clip controls the **audio source**, not a gain envelope:
- Playhead **enters** a clip → `Layer.trigger()`: (re)start the sample.
- Playhead **leaves** a clip → `Layer.release()`: stop it (short ~anti-click gain ramp only).
- The source **loops** (`loop = true`), giving the desired *loop-if-shorter, cut-if-longer* rule:
  a sample shorter than the clip repeats; a longer one is cut when release fires.
- Layer Two applies **no musical fades** — the sample's baked fades are the only fades. Gain is
  effectively on-at-ceiling / off.

The scheduler is **transition-based**: it fires trigger/release when the playhead crosses a clip
edge, rather than nudging gain every tick.

## Consequences

- **+** Honors the engineer's baked fades; entrances sound as designed.
- **+** "loop if shorter / cut if longer" falls out of `loop = true` + release timing for free.
- **+** A `played / total` readout is meaningful (`min(clip, sample) / sample`).
- **−** Requires start/stop of Web Audio sources at runtime (more moving parts than a gain ramp);
  a hard stop mid-sample needs an anti-click ramp.
- **−** Pause/resume and scrubbing need explicit handling of source state (see ADR-0003, ADR-0006).
- Enabled by [ADR-0003] (offset trigger) for scrubbing.

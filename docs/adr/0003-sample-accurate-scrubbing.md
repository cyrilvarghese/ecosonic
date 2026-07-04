# ADR-0003 — Sample-accurate scrubbing via offset trigger

**Status:** Accepted · 2026-07-04

## Context

A sound designer needs to **re-audition a specific section repeatedly** to tune it. With clips
controlling playback (ADR-0002), the first scrub implementation either (a) did nothing audible
inside a clip (tracks kept playing), or (b) restarted every track **from 0** on release. Neither is
right: the designer wants to hear *what actually plays at the playhead* — if the playhead is mid-clip,
the track should sound **mid-sample**; if the playhead isn't over a clip, the track should be silent.

## Decision

Playback is **seekable to a sample offset**:
- `Layer.trigger(offsetSec)` starts the source at `offsetSec` wrapped into the sample length
  (`AudioBufferSourceNode.start(0, offset)` / `audioEl.currentTime = offset`).
- A **scrub slider** (and single playhead) set `positionSec`; a `scrubbing` flag holds the clock
  while dragging.
- On a **position jump** (scrub released, or play (re)started after a seek), the scheduler re-seeks
  every present track to `positionSec − clipStart`; tracks whose clip doesn't cover the position are
  released.
- During **normal forward playback**, sources are *not* re-seeked — they were started at their clip
  entrance and stay naturally in sync, so no glitching.

Re-seek fires on **release**, not continuously while dragging, to avoid a machine-gun of restarts.

## Consequences

- **+** Landing anywhere plays each track from its true offset → repeatable, sample-accurate
  re-audition for tuning.
- **+** Cheap: only re-seeks on discrete jumps; forward playback is untouched.
- **−** A mid-sample seek starts **abruptly** (no baked fade at that offset); mitigated by an 8 ms
  gain ramp, but it is an instant entry by nature.
- **−** Not a true continuous/real-time scrub (audio doesn't stream while dragging). Deferred as a
  heavier option if needed.
- Depends on [ADR-0002].

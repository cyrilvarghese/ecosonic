# ECOSONIC — Product Requirements Document

**Status:** Living document · **Last updated:** 2026-07-04
**Related:** [SPEC.md](./SPEC.md) · [ROADMAP.md](./ROADMAP.md) · [ADRs](./adr/README.md)

---

## 1. Vision

ECOSONIC is a tool for composing **generative meditation & ambient sound sessions**. A user
assembles a *sound ecosystem* from curated samples, then shapes it into a *temporal composition*
that evolves slowly over a session — without touching a traditional DAW.

The product is organized into **layers**, each a distinct operational level:

- **Layer One — Sound Ecosystem Builder.** Pick an *element*, get a multitrack ecosystem of
  looping samples, and adjust it (volume, mute, lock, swap, tuning, master).
- **Layer Two — Arrangement Engine.** Turn that ecosystem into a time-structured session:
  tracks enter and exit over a timeline, so the soundscape breathes and progresses.

Design ethos throughout: **calm, slow, non-rhythmic, organic.** Changes happen over minutes, not
beats. The tool should feel like tending a garden, not sequencing a track.

## 2. Goals & Non-Goals

**Goals**
- Let a non-DAW user build a rich, element-themed ambient ecosystem in a few clicks.
- Let a sound designer *orchestrate* that ecosystem over time (when each track comes and goes).
- Preserve the sound engineer's intent — **samples carry their own baked fades**; the tool
  arranges them, it doesn't re-mix them.
- Support **re-auditioning any section** repeatedly, sample-accurately, for tuning.
- Keep the whole thing approachable, visual, and forgiving.

**Non-Goals (for now)**
- Not a general-purpose DAW; no beat grid, MIDI, or piano-roll.
- No rhythmic/quantized structures (explicitly avoided per the meditation brief).
- No cloud accounts, sharing, or persistence layer yet (in-memory session).
- No per-track effects UI yet (delay/reverb are not modeled — see §8).

## 3. Users & core use cases

- **The sound designer / engineer** (primary): builds the ecosystem, then arranges it and tunes
  sections by ear. Needs precise, repeatable playback of any portion.
- **The listener** (eventual): plays a finished session for meditation.

Core flows:
1. **Build** — choose element → adjust the auto-selected tracks (volume/mute/lock/swap) → tune.
2. **Arrange** — carry the selection into Layer Two → drag each track's clip to orchestrate
   entrances/exits → scrub to audition sections → refine.
3. **(Roadmap)** Sequence several modules (modes) into a full-length narrative session.

## 4. Product structure

| Route | Screen | Purpose |
|---|---|---|
| `/` | Element selector | Choose EARTH / WATER / AIR / FIRE / ETHER |
| `/layer1` | Builder | The multitrack sound ecosystem |
| `/layer2` | Module Designer | Orchestrate track entrances/exits on a timeline |

Navigation is one-way-friendly: `/` → `/layer1` → `/layer2`, with "back" links. State is held in
memory; a hard refresh returns to `/`.

## 5. Layer One — requirements (built)

- **Element selection** — five elements, each with its own accent theme (oklch tokens).
- **Auto-selection** — from a manifest of samples per element × category, build a set of tracks
  per configurable count rules. Categories: `ISO, PLANET, NOISE, ELEMENT, BASS, PAD, MELODY, FX`.
- **Per-track controls** — volume (**centered ±20 dB**, 0 dB = unity), mute, play/pause, lock,
  change (swap to another sample in the same category).
- **Session controls** — master volume, global tuning, regenerate (re-roll unlocked tracks),
  global play/pause.
- **Live visuals** — per-lane oscilloscope + circular playhead + progress trail; a master
  visualizer. Element-tinted.
- **Audio** — every track loops continuously; hybrid loading (decoded buffer for small files,
  streamed `<audio>` blob for large) so many long loops can play at once.

## 6. Layer Two — requirements

### 6.1 Handoff from Layer One
Layer Two **snapshots** the Layer One selection on entry (see [ADR-0006 context]):
- **Non-muted tracks** (muted = "not selected") with their **volume ceiling** (Layer One volume).
- The chosen **element** (for theming), **tuning**, and **master** (read-only passthrough).
- *Not* effects (Layer One has none) — see §8.

### 6.2 The module designer (current MVP)
- The handed-off tracks appear as **lanes** on a single **Wave Module** timeline (~10 min).
- Each track is a **draggable clip** `[enter, exit]`: drag edges to set when it enters/exits, drag
  the body to move it.
- The module is **seeded from a density table** (config mode rules): the continuity **bed**
  (NOISE/ISO/PLANET/ELEMENT) spans the module; **drivers** (BASS/PAD/MELODY/FX) come in as shorter
  clips staggered toward a **mid-module density peak**. The designer edits from there.
- **A clip controls playback, not volume** ([ADR-0002]): entering a clip *starts the actual
  sample*; leaving *stops* it. The sample loops if shorter than the clip, is cut if longer. The
  sample's own baked fades are the only fades.
- **Sample-accurate scrubbing** ([ADR-0003]): a single **playhead** and a **scrub slider** move
  playback across all tracks; landing at position *P* plays each present track from the sample
  offset for *P* (mid-clip → mid-sample), silent if the playhead isn't over the clip. This is the
  re-audition loop for tuning a section.
- **`played / total` readout** per clip — how much of the sample is heard (`min(clip, sample) /
  sample`), flagged when a clip is cutting the track short.
- **Element theme** inherited from the selection.

### 6.3 Roadmap (built underneath, not yet surfaced; or planned)
- **Mode selection** — load the IMMERSION / RETURN density tables (IMMERSION strips drivers for a
  deep/sparse section; RETURN is full). Modes are interchangeable module templates.
- **Composition / sequencing** — arrange several module instances on a session timeline with
  adjustable **bridges** (crossfades) between them; the whole composition = the density curve over
  the full session. (The pure engine for this — templates, sequence, bridges, per-track scalar —
  is implemented and unit-tested; it is simply not wired into the UI yet.)
- **Advanced** (deferred): live **sample regeneration** of unlocked tracks between/within modules,
  ISO↔PLANETS alternation & rarefaction dynamics, BPM/Key/Quantize, effects inheritance.

## 7. Glossary

- **Element** — EARTH/WATER/AIR/FIRE/ETHER; drives sample set + theme.
- **Category** — a track's role (ISO, PLANET, NOISE, ELEMENT, BASS, PAD, MELODY, FX).
- **Bed / continuity layers** — NOISE/ISO/PLANET/ELEMENT; the always-present perceptual foundation.
- **Drivers** — BASS/PAD/MELODY/FX; come and go to shape density.
- **Wave Module** — a ~10-minute section with a growth→peak→decrease **density** shape.
- **Clip / region** — a track's `[enter, exit]` window within a module.
- **Density** — how many tracks overlap at a moment; *is* the arrangement ([ADR-0001]).
- **Mode** — a behavioral preset (Relaxation / Immersion / Return) expressed as a density table.
- **Bridge** — the crossfade/overlap between two adjacent modules.

## 8. Constraints & principles

- **Meditation-first:** slow changes (1–2 min scale), no abrupt cuts, no rhythmic/quantized
  structures, avoid evident repetition.
- **Respect Layer One:** never exceed a track's volume ceiling; master is inherited, read-only.
- **Baked fades:** Layer Two must not add its own fades — samples carry them.
- **Known gaps:**
  - **Tuning is inert** — `tuningHz` is carried through but never applied (no `playbackRate` is set,
    in Layer One *or* Two). Wiring it is a small, isolated change.
  - **Effects not modeled** — Layer One's `Track` has no delay/reverb fields, so the spec's
    "effects inheritance" is blocked until Layer One grows them.
  - **No persistence** — sessions are in-memory only.

## 9. Success criteria (current phase)

- From `/layer1`, "Continue to Layer Two" lands on a themed `/layer2` seeded from the density table.
- Every handed-off track is a draggable clip; dragging changes when it plays.
- Play loops the module; each track plays its baked-fade sample per its clip.
- Scrubbing to any point plays each present track sample-accurately and can be repeated to tune.

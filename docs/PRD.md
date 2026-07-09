# ECOSONIC — Product Requirements Document

**Status:** Living document · **Last updated:** 2026-07-09
**Related:** [SPEC.md](./SPEC.md) · [ROADMAP.md](./ROADMAP.md) · [ADRs](./adr/README.md) ·
[Generative framework](./generative/03-generation-framework.md)

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
- **The generative grammar (inside Layer Two).** Rules distilled from the production brief
  ([analysis](./generative/01-brief-analysis.md) · [research](./generative/02-domain-research.md))
  *emit* valid arrangements — seeded, drift-controlled variation within the brief's boundaries —
  instead of every clip being hand-placed ([framework](./generative/03-generation-framework.md)).

Design ethos throughout: **calm, slow, non-rhythmic, organic.** Changes happen over minutes, not
beats. The tool should feel like tending a garden, not sequencing a track.

## 2. Goals & Non-Goals

**Goals**
- Let a non-DAW user build a rich, element-themed ambient ecosystem in a few clicks.
- Let a sound designer *orchestrate* that ecosystem over time (when each track comes and goes).
- Preserve the sound engineer's intent — samples carry their **baked fades**, and Layer Two never
  exceeds a track's Layer One **ceiling**; its ~1-min volume envelopes ride *on top* of both
  ([ADR-0007](./adr/0007-generated-playback-uses-volume-envelope.md)).
- **Generate** valid arrangements from rules — seeded and reproducible, with a drift control for
  how far a session strays from the brief's canonical timings.
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
  per configurable count rules. Categories: `ISO, PLANET, NOISE, ELEMENT, ELEMENT_SUB, BASS, PAD,
  ARP, MELODY, FX`.
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
- The module is **seeded from the chosen mode's timing table** (transcribed from the production
  brief `TRACK INFO`). In **Introduction**: NOISE and the Element(s)/FX span the module, while ISO
  (1:00), PLANETS (2:00), PAD (3:00), Bass (4:00), ARP (4:30) and Melody (6:30) enter staggered, and
  a **2nd Element** enters ~5:00. The designer edits from there.
- A **mode picker** (Introduction / Deep Relaxation / Return) reloads the tracks from each section's
  table — Deep Relaxation strips the musical layers to just the bed + Sub-Elements.
- **A clip controls playback** ([ADR-0002]): entering a clip *starts the actual sample*; leaving
  *stops* it. The sample loops if shorter than the clip, is cut if longer. On top of that, the
  scheduler drives each region's **~1-min cosine volume envelope** — 0 → Layer One ceiling over
  `fadeIn`, hold, ceiling → 0 over `fadeOut` ([ADR-0007]); baked sample fades play underneath.
  Exceptions carry through the data (BASS enters directly; spanning NOISE never fades out).
- **Generate + Variation picker**: a *Generate* button reseeds the active mode's clips from the
  generative grammar; the drift picker (**Strict / Moderate / Exploratory**) controls how far the
  draw strays from the brief's canonical timings (fades keep a slight organic jitter by design).
- **Loop visualization**: a clip longer than its sample shows the sample's stylized waveform
  repeated once per loop — dividers + alternating shading per repeat, a partial final segment when
  it doesn't tile evenly, and a `×N` readout (e.g. `2:22 ×4`).
- **Volume view**: a *Volume* checkbox overlays each clip's actual audible envelope as a DAW-style
  automation line (exact vertical edges for zero fades) and dims the waveform texture under it.
- **Sample-accurate scrubbing** ([ADR-0003]): a single **playhead** and a **scrub slider** move
  playback across all tracks; landing at position *P* plays each present track from the sample
  offset for *P* (mid-clip → mid-sample), silent if the playhead isn't over the clip. This is the
  re-audition loop for tuning a section.
- **`played / total` readout** per clip — how much of the sample is heard (`min(clip, sample) /
  sample`), flagged when a clip is cutting the track short; shows `×N` when the sample loops.
- **Element theme** inherited from the selection.

### 6.3 Roadmap (built underneath, not yet surfaced; or planned)
- **Generative grammar (built, 2026-07-09)** — `generateModeTemplate` (seeded draw within
  `canon ± half` ranges, bottom-up ordering enforced), `validateTemplate` (invariants I1–I6),
  `generateComposition` (a distinct generated arrangement per section on the module sequence).
  Wired into the designer via Generate + drift. See the
  [framework spec](./generative/03-generation-framework.md).
- **Live generative scheduler (deprioritized 2026-07-09)** — the framework's **Part B**: decisions
  made *during* playback from the same grammar rules. Its one purpose (decided in brainstorm) is
  **live-steerable playback** — a listener-facing feature; deprioritized below per-mode edit
  persistence and the composition view, which serve the designer
  ([rationale](./generative/04-gen-b-scheduler-rationale.md)).
- **Per-mode edit persistence** — the mode picker is wired, but switching modes reseeds from the
  table and discards drag-edits. Storing each mode's edits (so you design them independently and
  switch freely) is the remaining ROADMAP Phase-B piece.
- **Composition / sequencing** — arrange several module instances on a session timeline with
  adjustable **bridges** (crossfades) between them; the whole composition = the density curve over
  the full session. (The pure engine for this — templates, sequence, bridges, per-track scalar —
  is implemented and unit-tested; it is simply not wired into the UI yet. This is also where the
  generated ~30-min composition becomes playable end-to-end.)
- **Advanced** (deferred): live **sample regeneration** of unlocked tracks between/within modules,
  ISO↔PLANETS alternation & rarefaction dynamics, BPM/Key/Quantize, effects inheritance,
  per-instance variation (today repeated instances of a mode share one generated template).

## 7. Glossary

- **Element** — EARTH/WATER/AIR/FIRE/ETHER; drives sample set + theme.
- **Category** — a track's role (ISO, PLANET, NOISE, ELEMENT, ELEMENT_SUB/Sub-Elements, BASS, PAD,
  ARP, MELODY, FX).
- **Bed / continuity layers** — NOISE/ISO/PLANET/ELEMENT; the always-present perceptual foundation.
- **Drivers** — BASS/PAD/ARP/MELODY/FX; come and go to shape density.
- **Wave Module** — a ~10-minute section with a growth→peak→decrease **density** shape.
- **Clip / region** — a track's `[enter, exit]` window within a module.
- **Density** — how many tracks overlap at a moment; *is* the arrangement ([ADR-0001]).
- **Mode / Section** — one of the brief's three 10-min sections (Introduction / Deep Relaxation /
  Return), expressed as a per-layer timing table.
- **Bridge** — the crossfade/overlap between two adjacent modules.
- **Grammar** — the generative ruleset (`layerTwo.generation`): per-layer `canon ± half` timing
  ranges + ordering constraints that *emit* mode timing tables when seeded.
- **Drift** — how far a generated draw may stray from the brief's canonical timings:
  `STRICT / MODERATE / EXPLORATORY`.

## 8. Constraints & principles

- **Meditation-first:** slow changes (1–2 min scale), no abrupt cuts, no rhythmic/quantized
  structures, avoid evident repetition.
- **Respect Layer One:** never exceed a track's volume ceiling; master is inherited, read-only.
- **Fades:** a clip is still playback trigger/release
  ([ADR-0002](./adr/0002-clips-control-playback-not-gain.md)), but Layer Two now also drives each
  region's **~1-min cosine volume envelope** (0 → Layer One ceiling → 0) in both the module
  designer and composition playback ([ADR-0007](./adr/0007-generated-playback-uses-volume-envelope.md));
  baked sample fades play underneath.
- **Known gaps:**
  - **Tuning is inert** — `tuningHz` is carried through but never applied (no `playbackRate` is set,
    in Layer One *or* Two). Wiring it is a small, isolated change.
  - **Effects not modeled** — Layer One's `Track` has no delay/reverb fields, so the spec's
    "effects inheritance" is blocked until Layer One grows them.
  - **No persistence** — sessions are in-memory only.

## 9. Success criteria (current phase)

- From `/layer1`, "Continue to Layer Two" lands on a themed `/layer2` seeded from the density table.
- Every handed-off track is a draggable clip; dragging changes when it plays.
- Play loops the module; each track plays per its clip, rising to and falling from its Layer One
  ceiling along the region's ~1-min envelope (baked fades underneath).
- Scrubbing to any point plays each present track sample-accurately and can be repeated to tune.
- **Generate** reseeds the active mode from the grammar — always invariant-legal (I1–I6), visibly
  different per click, and drift-scaled (Strict hugs the brief; Exploratory strays, may drop
  ARP/MELODY).
- Loop repeats and volume automation are visible per clip (segments + `×N`; Volume view).

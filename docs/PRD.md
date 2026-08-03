# ECOSONIC — Product Requirements Document

**Status:** Living document · **Last updated:** 2026-08-02
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
- No effects beyond reverb and delay sends (§6.4) — no EQ, compression, or limiting, and no
  effects UI in Layer One.

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
| `/remix` | Remix | Draw a playable mix from the five **authored** session timelines — cross-element, scoped to one element, or one element's sound on every element's timings; full session or one section; play and export WAV (§6.4) |
| `/rules` | Rule Discovery | List all composition rules; analyze a reference track (three blind per-mode passes) into candidate rules — Cards or Timeline view; keep/promote; save & reload analyses by file name (§7) |

Navigation is one-way-friendly: `/` → `/layer1` → `/layer2`, with "back" links. State is held in
memory; a hard refresh returns to `/`.

## 5. Layer One — requirements (built)

- **Element selection** — five elements, each with its own accent theme (oklch tokens).
- **Auto-selection** — from a manifest of samples per element × category, build a set of tracks
  per configurable count rules. Categories: `ISO, PLANET, NOISE, ELEMENT, ELEMENT_SUB, BASS, PAD,
  DRONE, ARP, MELODY, FX`.
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
- *Not* effect sends. Sends exist in the engine (§6.4) but are seeded per **category** from config,
  not inherited from Layer One, which still has no effects UI.

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
- **Live mode (Gen-B, module scale)**: a *Live* toggle makes playback steerable — changing drift
  mid-play redraws the un-played future (splice at the playhead; played history is untouched), and
  eligible pending lanes offer *in next* / *hold* nudges. Scrubbing is disabled while live; an
  untouched loop repeats the last-drawn pass (generation is purely reactive). Toggling Live off
  freezes the arrangement in place, still editable.
- **Snapshot export**: *Export JSON* / *Import* round-trip the arrangement as a file; *Export WAV*
  offline-renders the module exactly as heard (clips, loops, envelopes, ceilings, master) without
  interrupting live playback.
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
- **Live generative scheduler — module scale shipped 2026-07-10** (see §6.2 Live mode); session
  scale (live bridges, regeneration between module instances, listener surface) remains
  ([provenance & assessment](./generative/04-gen-b-scheduler-rationale.md)).
- **Per-mode edit persistence** — the mode picker is wired, but switching modes reseeds from the
  table and discards drag-edits. Storing each mode's edits (so you design them independently and
  switch freely) is the remaining ROADMAP Phase-B piece.
- **Composition / sequencing** — arrange several module instances on a session timeline with
  adjustable **bridges** (crossfades) between them; the whole composition = the density curve over
  the full session. (The pure engine for this — templates, sequence, bridges, per-track scalar —
  is implemented and unit-tested; it is simply not wired into the UI yet. This is also where the
  generated ~30-min composition becomes playable end-to-end.)
- **Advanced** (deferred): live **sample regeneration** of unlocked tracks between/within modules,
  ISO↔PLANETS alternation & rarefaction dynamics, BPM/Key/Quantize, Layer One effects UI and
  effects inheritance (§6.4), per-instance variation (today repeated instances of a mode share one
  generated template).

### 6.4 Remix — playing the authored sessions (`/remix`)

Built 2026-07-26 → 07-28; effect sends added 2026-07-31. A distinct surface that **reuses Layer
Two's machinery** — the same arrangement store, audio engine, scheduler and offline renderer — but
takes its timings from somewhere else entirely. Full behavioural reference:
[remix-rules.md](./remix-rules.md).

Where §6.3's grammar *emits* timings from `canon ± half` ranges, Remix *draws* them from the five
**authored** session tables in `config/sessions/*.md` — real, hand-written 30-minute sessions, one
per element. The product question it answers is one the generator cannot: *what does EARTH's noise
under WATER's planets under AIR's bass actually sound like?*

- **The pool.** Every session file parses into `AuthoredRule`s — one layer's timing within one
  section of one element. A rule carries **timing only, never audio**. Authored layer names are
  normalised onto Categories, so two elements spelling a layer differently still meet on one lane
  and no timing is stranded by naming.
- **Three ways to narrow it.** **Cross-element** (default) uses the whole pool, and each track's
  sample follows the rule that won it. **Scoped**(el) uses one element's rules *and* samples.
  **Borrowed timings**(el) uses the whole pool for timing but one chosen element's samples
  throughout — which is the only mode that can play one element's *sound* on another's *clock*.
- **Full session or one section.** Thirty minutes as authored, or a single section rebased onto a
  10-minute timeline. Section windows differ per element (AIR's are 30 seconds early), so the
  rebase origin comes from the authored data, never from an index.
- **One track per category**, stacked in the vertical grammar's order. **Absence is never
  repaired**: a category no rule covers gets no track, a section an element never authored is
  simply silent, and nothing is substituted to fill the gap.
- **Deterministic.** The same pool, manifest, seed, element and section always give the same draw.
  *Regenerate* advances the seed.
- **Effect sends.** Each track row carries a **reverb** and a **delay** send, 0–100%, feeding one
  shared room and one shared echo rather than a copy per track. MELODY ships wet, every other
  category dry. Sends are tapped *after* the track's fader, so a phrase that ends keeps ringing —
  which is what stops melody phrases cutting off dead between non-contiguous phrases. Levels are
  runtime mix state: not saved with an arrangement, the same as per-track volume.
- **Adjust to whole loops** (opt-in, off by default). Resizes each interval to contain a whole
  number of loops so no pass is cut part-way, never shrinking below one loop and never moving an
  interval's **start** — authored entry points and their fades survive.
- **Playback and export.** Plays live, and exports the mix to WAV. The export mirrors playback
  *musically*, not byte for byte, and runs past the end of the timeline so the final decay finishes
  rather than being chopped — so an exported file is longer than its timeline.
- **What the screen tells you.** Chips list only candidates the current scope could actually have
  drawn; lit chips are the picks. Bars read `MELODY 1:56 ×5` — material and repeat count — against
  the interval length, with `×N+` written honestly where the sample does not divide evenly. In
  Borrowed timings, bars take the **sample**'s element colour and chips keep the **rule**'s, so the
  mode is visible rather than merely enabled.

**Deliberately not done:** stitching three section modules into one session · per-section separate
tracks · crossfading loop wraps · invariant repair of any kind · in-app rule editing · saving a
generated result.

## 7. Rule Discovery — reference-track analysis (`/rules`)

A workshop for **deriving composition rules from real reference tracks** and folding the good ones
into the generator's grammar. Two columns: **Discover** (left — analyze a track, review candidates)
and **Exists** (right — the principles R1–R9, invariants I1–I6, the live grammar, and rules you've
kept). Built 2026-07-15 ([design](./superpowers/specs/2026-07-15-rule-discovery-page-design.md)),
extended 2026-07-18/19.

### 7.1 Blind analysis, deterministic verdict
The model **hears the audio but is never told the house rules** — only what each of the 11 layer
roles *sounds* like (`buildSystemPrompt` is zero-arg by construction). It returns raw, timestamped
**observations**. A **local, deterministic matcher** (`src/rules/match.ts`) then classifies each
against the grammar as **`confirms` / `contradicts` / `novel`**. The model observes; code judges —
so a rule can never be "confirmed" just because the model was told about it.

### 7.2 Three blind passes, one per mode
The upload is sliced **client-side into three fixed 10-minute windows** and each is analyzed as its
**known mode** — Introduction / Deep Relaxation / Return — shown as tabs. This replaced a single
whole-file pass whose mode mapping only worked when the model happened to guess exactly three
sections; supplying the mode makes the per-mode grammar comparison fire every time. Slicing decodes
the file in the browser (Web Audio) and renders each window to **16 kHz mono WAV** (~18 MB) to stay
under the API's audio-size limit; the three passes run in parallel with per-tab error isolation.
(Audio models don't support strict structured outputs, so the JSON shape is requested in-prompt and
parsed defensively — `extractJson` + tolerant validation.)

### 7.3 Two views — Cards and Timeline
A per-tab **Timeline ⇄ Cards** toggle:
- **Cards** — each observation as text + evidence timestamps + confidence, with **Keep / Discard /
  Promote** actions.
- **Timeline** — a read-only lane-per-category view on a 0–10 min axis (1-minute steps): each
  observation is a verdict-tinted bar/tick against a faint **grammar "ghost band"** (the expected
  window), so `confirms` (bar inside) vs `contradicts` (bar outside) is *seen*, not read; prose /
  ordering findings sit in a chip strip below the lanes.

### 7.4 Keep → Promote lifecycle
**Keep** writes a candidate to `config/discovered-rules.json` (the registry). **Promote** takes a
kept *structured* rule and folds its timing into the live grammar (`layerTwo.generation`), after
which the generator can emit it. Kept/promoted rules appear in the Exists column.

### 7.5 Save & reload analyses
Every completed analysis **auto-saves server-side** to `config/analyses.json`, keyed by **file name**
(upsert — latest wins), so a paid analysis is never lost. A **"Saved analyses" accordion** below
Discover lists them; **Load** repopulates the tabs/timeline instantly with **no model call**, and
**Delete** prunes. Mirrors the rule-registry persistence pattern.

## 8. Glossary

- **Element** — EARTH/WATER/AIR/FIRE/ETHER; drives sample set + theme.
- **Category** — a track's role (ISO, PLANET, NOISE, ELEMENT, ELEMENT_SUB/Sub-Elements, BASS, PAD,
  DRONE, ARP, MELODY, FX).
- **Bed / continuity layers** — NOISE/ISO/PLANET/ELEMENT; the always-present perceptual foundation.
- **Drivers** — BASS/PAD/DRONE/ARP/MELODY/FX; come and go to shape density. (DRONE is a sustained
  swell that enters ~3:00 with PAD; unlike the other drivers its Deep Relaxation presence is
  randomized rather than always-stripped.)
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
- **Authored rule** — one layer's timing within one section of one element's hand-written session
  table. **Timing only, never audio** — which is why a remix track's audio comes from its element
  rather than from the rule (§6.4).
- **Borrowed timings** — the remix mode that fixes the sample element by hand, freeing every
  track's rules to be drawn from any element.
- **Reverb / delay** — a *room* and an *echo*. Reverb is a wash of reflections you cannot pick
  apart; delay is distinct repeats you can count. Both are shared once across the mix, not copied
  per track.
- **Send** — how much of a track is fed into a shared effect, 0–100%. 0% is **dry** (untouched),
  100% fully **wet**. Melody ships at 75% reverb; everything else at 0%.
- **Tail** — how long an effect keeps sounding *after* its input stops. The reason a phrase can
  dissolve rather than cut, and the reason an exported WAV is longer than its timeline.

## 9. Constraints & principles

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
  - **Effects are engine-wide but only surfaced in Remix** — every `AudioEngine` builds the reverb
    and delay buses, yet only `/remix` has send sliders (§6.4). Layer One's `Track` still has no
    send fields, so "effects inheritance" through the Layer One → Layer Two handoff remains
    blocked until it grows them.
  - **No limiter anywhere.** Nothing catches a summed peak above full scale; the WAV encoder simply
    clamps. Overlapping effect tails at high send levels are the most likely place for that to
    bite, and it is checked by ear rather than by a test.
  - **No persistence** — sessions are in-memory only, including per-track send levels.

## 10. Success criteria (current phase)

- From `/layer1`, "Continue to Layer Two" lands on a themed `/layer2` seeded from the density table.
- Every handed-off track is a draggable clip; dragging changes when it plays.
- Play loops the module; each track plays per its clip, rising to and falling from its Layer One
  ceiling along the region's ~1-min envelope (baked fades underneath).
- Scrubbing to any point plays each present track sample-accurately and can be repeated to tune.
- **Generate** reseeds the active mode from the grammar — always invariant-legal (I1–I6), visibly
  different per click, and drift-scaled (Strict hugs the brief; Exploratory strays, may drop
  ARP/MELODY).
- Loop repeats and volume automation are visible per clip (segments + `×N`; Volume view).
- **Live**: with Live on, a drift change or nudge visibly rearranges only upcoming clips within one
  tick, audio uninterrupted; stopping keeps the arrangement editable on the timeline.
- **Export**: JSON round-trips the arrangement; WAV renders the module as heard, mid-play, without
  glitching live playback.
- **Remix**: `/remix` draws a playable mix from the authored sessions; the same seed reproduces it
  exactly and *Regenerate* changes it. Every lit chip is a candidate the current scope could have
  drawn. Switching to Borrowed timings turns the timeline one colour while the chips stay many —
  one element's sound on every element's clock.
- **Effect sends**: melody phrases ring out past their last note instead of stopping dead, live and
  in the export alike; moving a send slider changes the wet level smoothly with no dropout and no
  sample reload; an exported WAV ends in a decay rather than a cut.

# Gen-B — Live Scheduler, Module Scale (live-steerable playback) — Design

**Status:** Approved design (2026-07-10)
**Related:** [Generative framework §Part B](../../generative/03-generation-framework.md) ·
[Gen-B provenance & assessment](../../generative/04-gen-b-scheduler-rationale.md) ·
[ROADMAP §5](../../ROADMAP.md) · [ADR-0002](../../adr/0002-clips-control-playback-not-gain.md) ·
[ADR-0007](../../adr/0007-generated-playback-uses-volume-envelope.md)

## 1. Purpose & scope

Gen-B's locked purpose: **live-steerable playback** — change drift / steer upcoming entrances
mid-session **without stopping**. This design scopes it to the **10-min module in the existing
`/layer2` designer** (inside-out strategy, ADR-0005). Deferred to session scale: live bridges,
regeneration between module instances, a listener-facing surface.

No LLM, no new variation source: the same grammar (`layerTwo.generation`) and the same seeded PRNG
as Gen-A. "Live" changes only *when* the dice are rolled
([04 §2–3](../../generative/04-gen-b-scheduler-rationale.md)).

## 2. Decisions (brainstormed 2026-07-10)

| # | Decision | Choice |
|---|---|---|
| 1 | Scale & surface | **Live module in the existing designer**; session scale later |
| 2 | Steering verbs | **Drift change + per-layer entrance nudges** (bring-in-next / hold-back); no density knob — density is emergent (ADR-0001) |
| 3 | Lookahead / timeline | **Full draw + splice-redraw**: the whole module is always drawn; a steer redraws only the un-played future, spliced at the playhead; timeline stays fully visible |
| 4 | On module wrap | **Repeat the last-drawn pass** — generation is *purely reactive*: nothing redraws unless steered; an untouched loop repeats identically |
| 5 | Keep on stop | Toggling Live off **freezes generation, not playback** — the arrangement (heard history + drawn future) remains on the timeline as ordinary editable regions; Live back on resumes steering from the playhead |
| 6 | Save/export | **JSON arrangement export/import + WAV offline render.** Export is a **snapshot** — it never interrupts or freezes live play; the file captures the module *as drawn at that moment* (steering afterwards diverges from the file, by design — confirmed) |

## 3. The core: `steerModule` (pure, seeded splice)

`src/arrange/generate/steerModule.ts`:

```
steerModule(regions, playheadSec, tracks, mode, drift, seed, nudge?) -> TemplateRegion[]
```

- **Past is verbatim.** Regions fully past (`exitSec ≤ t`) are returned untouched.
- **Active regions** (`enter < t < exit`) keep their entrance (it happened); their exit/fadeOut are
  future events and redraw within the grammar's ranges, clamped `≥ t`.
- **Pending layers** (`enter > t`) redraw entirely from the grammar at the current drift, with
  `enter` clamped `> t`; ordering (R2: `after` + `minGapSec`) is enforced against the *actual*
  (possibly historical) entrances.
- **Nudges:** *bring-in-next* sets an **eligible** layer's enter to ~now (eligible = its `after`
  layer is already active — the stack can't invert); *hold-back* pushes a pending layer's enter
  later within its legal range. A nudged value is pinned through that steer's ordering pass.
- **Squeeze rule:** if a pending layer's legal window has collapsed (playhead past its range and
  no room before its exit), it is dropped for this pass — invariant-legal, since only bed layers
  are mandatory and they enter early.
- **Validate & repair:** the spliced whole runs through the existing `validateTemplate` (I1–I6)
  and is clamped legal — the same repair philosophy as Gen-A.
- **Deterministic:** each steer advances an internal seed; same `(regions, t, drift, seed, nudge)`
  → identical splice. No `Math.random()`/`Date.now()` in generator code.
- A **drift change while live+playing is itself a steer** (routes through `steerModule` with no
  nudge).

## 4. Playback integration

Dragging a clip already mutates `moduleRegions` mid-play, and the module scheduler
(trigger/release per ADR-0002 + region volume envelopes per ADR-0007) follows the data every tick.
A steer is the same mutation, larger — it rides the identical path. No engine rewrite.

Verification point for the plan: mid-play region changes trigger/release cleanly at the edges —
e.g. an exit redrawn to before *now* releases immediately; an enter nudged to *now* triggers with
its fade rules (BASS still enters with no fade-in, R4).

## 5. Store & UI

**Store** ([arrangementStore.ts](../../../src/arrange/arrangementStore.ts)): `live: boolean`,
`setLive(b)`, `steer(nudge?)`; `setDrift` while `live && playing` routes through `steer()`.
Internal steer seed alongside `genSeed`.

**UI** ([ArrangeScreen.tsx](../../../src/components/layer2/ArrangeScreen.tsx)):
- A **Live** toggle in the transport.
- While live + playing: scrub slider **disabled** (the past is committed; jumping the playhead
  contradicts liveness); drift picker stays enabled (live steering); per-lane **"in next" /
  "hold"** buttons appear only on eligible, not-yet-entered layers.
- Future clips visibly rearrange the moment a steer lands (falls out of state — no extra code).
- Stopping playback or toggling Live off leaves the arrangement on the timeline, editable.

## 6. Export (snapshot semantics)

An **Export** control, available any time the module has regions (live or not):

- **JSON** — serialize the arrangement (mode, drift, regions, per-track sample refs) to a
  downloadable file; an **Import** loads one back onto the timeline. Tables are already pure data.
- **WAV** — offline-render the module: all stems mixed with their clip windows, loop repeats,
  ~1-min cosine envelopes, Layer One ceilings, and master applied — the file matches what playback
  sounds like. Rendered via `OfflineAudioContext` as a discrete async job with progress; **never
  touches the live audio graph** — live playback and steering continue during a render.

**Constraints (recorded for the plan):**
- Offline render cannot use the hybrid streaming path — every stem must be fully decoded to a
  buffer for the render (large files included). Memory is real: a 10-min 44.1 kHz stereo render is
  ~200 MB of float32 working buffer (~100 MB as 16-bit WAV) plus decoded stems. Mitigation: render
  is an explicit user action, one at a time, buffers released after encode.
- Export captures the arrangement **as currently drawn** (whole module, including un-played
  future). Timeline and file may diverge after later steers — snapshot, not sync.

## 7. Testing

- **`steerModule` (pure, across many seeds):** past preserved verbatim; spliced whole is I1–I6
  legal; drift change measurably narrows/widens future draws; bring-in-next respects eligibility
  and lands near *t*; hold-back delays within legal range; squeeze rule drops only non-bed layers;
  determinism (same inputs → same output).
- **Store:** `setLive`, `steer`, drift-while-live routing, steer resets nothing (playhead and
  playing state untouched).
- **Scheduler edges:** exit-moved-before-now releases; enter-nudged-to-now triggers (extends the
  existing drag-mid-play behavior tests if present).
- **Export:** JSON round-trip (export → import → identical regions); WAV render of a tiny fixture
  module matches expected envelope shape (sample-level spot checks at fade midpoints, e.g. ~0.5
  scalar at half-fade, as in the Gen-A envelope test).

## 8. Out of scope

- Live bridges, regeneration between module instances, session-scale live play (framework §Part B
  open questions at session scale).
- Listener-facing play surface (PRD §3: the listener is "eventual").
- Per-mode edit persistence — separate approved spec, parked
  ([2026-07-10 spec](./2026-07-10-per-mode-edit-persistence-design.md)).
- Autonomous drift/evolution (untouched loops repeat by decision #4 — no self-wandering).

## 9. Success criteria

- Toggle Live during playback; change drift mid-play → upcoming clips visibly rearrange within one
  scheduler tick and audio never glitches or stops.
- Nudge an eligible layer → it enters near-now with its fade rules (BASS hard entry preserved).
- An untouched live loop repeats the last-drawn pass identically; every steer is deterministic and
  invariant-legal (I1–I6) across seeds.
- Live off mid-module keeps the full arrangement on the timeline, replayable and editable.
- Export JSON round-trips; export WAV produces a file audibly matching in-app playback, without
  interrupting a running live session.

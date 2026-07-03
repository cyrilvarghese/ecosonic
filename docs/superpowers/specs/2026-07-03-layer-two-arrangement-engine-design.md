# Layer Two — Arrangement Engine (MVP) — Design

**Date:** 2026-07-03
**Status:** Draft for review
**Branch:** `feat/layer-one-core` (Layer Two work will branch from here)
**Reference UI:** `LAYER_TWO_EN.pdf` p.10 mockup — *directional only, not pixel-exact*

---

## 1. Overview

Layer Two turns the static Layer One sound ecosystem into a **time-structured meditation session**.
Tracks enter and leave over ~10-minute **Wave Modules** whose *activity* grows to a peak around the
midpoint and recedes; modules are sequenced with smooth **bridges** into a full session.

### Core idea: the density curve *is* the arrangement

There is **no global volume envelope** and the master is never automated. A module's
`Growth → Peak → Decrease` is **sound density** — how many tracks overlap at a moment — and density
is just **the set of track regions on the timeline**. The peak at ~min 5 happens because the most
tracks overlap there, not because a curve scales anyone's volume. The engine imposes only **per-clip
fades and the Layer One ceiling**.

### Two views, two levels of zoom

A **mode is a reusable Wave Module template**, designed once against the handed-off selection:

- **DETAIL — Module Designer** (`MODULES`): one mode at a time. Its tracks are **generated** from a
  config **mode rule set** into staggered regions whose overlap peaks mid-module; the composer then
  **drags** clip entries/exits to refine that mode. Each module shows a **density summary**.
- **STRUCTURE — Composition** (`ARRANGE`): the modules are an **editable track** — clips you drag to
  set order, duration, and the **bridges** (transition/crossfade length) between them. Clicking a
  module opens its Designer. No individual clips are touched here.

Overlap is a **structure-level** edit (module boundaries); clip timing is a **detail-level** edit
(inside a module). They stay in sync: editing a mode's clips reshapes the density summary shown in
the composition.

### Relationship to Layer One

Layer Two **snapshots** Layer One's state on entry, read-only:

| Inherited | Used for |
|---|---|
| Non-muted tracks (`muted = unselected`) + `volumeDb` **ceiling** | tracks to arrange; ceiling caps gain |
| `category`, `sample`, `locked` | lane grouping, labels, lock badge |
| `tuningHz`, `masterVolumeDb` | passthrough; master shown read-only |

Never exceeds a track's ceiling; never touches the master ("Master Volume remains unchanged").

---

## 2. Scope

### Core (this MVP)
1. **Handoff + `/layer2` route** via the (disabled) "Continue to Layer Two" button on `/layer1`.
2. **Duration-driven sequence** — `moduleCount = round(totalSec / moduleSec)`, min 1; modes cycle
   **Relaxation → Immersion → Return**.
3. **Generative density builder** — `buildModeTemplate` turns config mode rules into staggered
   regions whose overlap peaks mid-module.
4. **Mode rules as a tunable config starter set** — a *sample rendering*; editable without code.
5. **Per-clip envelope only** — fade-in → hold at ceiling → fade-out. No global curve.
6. **Two views** — Module Designer (detail) + Composition (structure); click-to-drill-in.
7. **Adjustable bridges** — crossfade overlap between adjacent modules; continuity layers
   (NOISE/ISO/PLANET/ELEMENT) carry through; length draggable (~1–2 min).
8. **Draggable editing** — clip entries/exits (detail); module order/duration/bridges (structure).
9. **Transport + scheduler** — play/pause/seek, session clock driving per-clip gains, moving playhead.

### Advanced (deferred; nav stubs)
- **Sample regeneration / live replacement** of unlocked samples (→ makes repeated modules vary).
- **Dynamic density behaviors**: ISO↔PLANETS alternation, time-varying rarefaction, density automation.
- **BPM / Key / Quantize**, Mixer, Automate, Atmospheres, Presets, Journal panels.
- **Effects inheritance** (delay/reverb) — *blocked*: Layer One `Track` has no effects fields yet.
- Editable master, free cross-module region placement, per-instance (non-shared) mode edits.

---

## 3. Domain model (pure, testable — mirrors Layer One's `buildSelection`)

```ts
type Mode = 'RELAXATION' | 'IMMERSION' | 'RETURN';
type Presence = 'continuous' | 'active' | 'sparse' | 'absent';   // from config mode rules

interface ArrTrack {                       // snapshot of a non-muted Layer One track
  id: string; category: Category; label: string;
  sample: { name: string; path: string; bytes: number };
  ceilingDb: number; locked: boolean;
}

// DETAIL level: a mode designed once, regions relative to module-local time [0, moduleSeconds]
interface TemplateRegion { trackId: string; enterSec: number; exitSec: number;
                           fadeInSec: number; fadeOutSec: number; }
interface ModeTemplate   { mode: Mode; regions: TemplateRegion[]; }

// STRUCTURE level: the session timeline
interface ModuleInstance { id: string; mode: Mode; startSec: number; durationSec: number; }
interface Bridge         { id: string; fromInstanceId: string; toInstanceId: string; overlapSec: number; }

interface Composition {
  tracks: ArrTrack[];
  templates: Record<Mode, ModeTemplate>;   // shared: one design per mode, reused by every instance
  sequence: ModuleInstance[];              // ordered
  bridges: Bridge[];                       // one per adjacent pair
  totalSec: number; tuningHz: number; masterDb: number;   // masterDb read-only
}
```

Builders (all pure):
- **`buildModeTemplate(selection, mode, cfg) → ModeTemplate`** — for each selected track, read
  `cfg.layerTwo.modeRules[mode][category]` and place a region via `cfg.layerTwo.presenceBands`:
  - **continuous** → `[0, D]` (bed; carries across bridges).
  - **active** → wide band around the peak, e.g. `[0.18·D, 0.82·D]`.
  - **sparse** → narrow band hugging the peak, e.g. `[0.40·D, 0.60·D]`.
  - **absent** → no region.
  A small per-track-index offset avoids identical stacking (deterministic, no RNG). Fades default to
  `regionFadeSeconds`, shortened for narrow regions.
- **`buildSequence(totalSec, cfg) → { sequence, bridges }`** — duration-driven instances (cycling
  modes, `moduleSeconds` each) + default `bridgeSeconds` overlaps.
- **`buildComposition(selection, { totalSec }, cfg)`** — templates for all 3 modes + sequence.

`density(s) = Σ (tracks whose expanded region covers s)` — grows to a max near `peakFrac·D` per
module by construction. No separate curve object exists.

---

## 4. Per-clip envelope (the only per-track envelope)

For a track with covering region `[enter, exit]` (expanded to absolute time), at session time `s`:

```
regionEnv(s) = 0                                    if s ∉ [enter, exit]
             = 0.5·(1 - cos(π·(s-enter)/fadeIn))    fade-in   (smooth 0→1)
             = 1                                     sustain   (hold at ceiling)
             = 0.5·(1 - cos(π·(exit-s)/fadeOut))    fade-out  (smooth 1→0)
gain(track,s) = ceilingGain(track) · regionEnv(s) · bridgeFactor(track, s)     // ≤ ceiling
ceilingGain   = dbToGain(ceilingDb, minDb)          // reuses Layer One dsp
```

No wave-wide or session-wide multiplier. Session start/stop is clean because the outermost regions
fade in/out. `regionEnvAt(region, s)` is the single pure function scheduler + renderer call.

---

## 5. Bridges / transitions (structure level)

A **bridge** is the crossfade window between two adjacent module instances (`overlapSec`, draggable
~1–2 min). Within it:
- **Non-continuity tracks** of the outgoing instance fade *out*; those of the incoming fade *in*
  (`bridgeFactor` ramps 1→0 and 0→1 across `overlapSec`).
- **Continuity layers** (`continuous` presence: NOISE/ISO/PLANET/ELEMENT) **carry straight through**
  — `bridgeFactor = 1`, no dip — so the seam is a merge, not a cut (PDF p.4).

`overlapSec = 0` → a hard adjacency; wider → a slower, more merged transition. Total session length
accounts for overlaps (`totalSec = Σ durationSec − Σ overlapSec`), recomputed on any structure edit.

---

## 6. Config (`layerTwo` block in `config/ecosonic.config.json`)

```jsonc
"layerTwo": {
  "moduleSeconds": 600,               // 10:00 real; tests pass small totals directly
  "bridgeSeconds": 120,               // default transition overlap (2:00), draggable
  "regionFadeSeconds": 12,            // default clip fade in/out
  "peakFrac": 0.5,                    // module density peak (≈ minute 5)
  "schedulerTickMs": 250,
  "durationPresetsMin": [10, 20, 30, 40],
  "modes": ["RELAXATION", "IMMERSION", "RETURN"],

  "presenceBands": {                  // where each tier places its region within a module
    "continuous": [0.0, 1.0], "active": [0.18, 0.82], "sparse": [0.40, 0.60]
  },

  // SAMPLE / STARTER rendering of the modes — tune freely; not final.
  "modeRules": {
    "RELAXATION": { "NOISE":"continuous","ISO":"active","PLANET":"active","ELEMENT":"active",
                    "BASS":"sparse","PAD":"active","MELODY":"sparse","FX":"sparse" },
    "IMMERSION":  { "NOISE":"continuous","ISO":"sparse","PLANET":"sparse","ELEMENT":"sparse",
                    "BASS":"absent","PAD":"absent","MELODY":"absent","FX":"absent" },
    "RETURN":     { "NOISE":"continuous","ISO":"active","PLANET":"active","ELEMENT":"active",
                    "BASS":"active","PAD":"active","MELODY":"sparse","FX":"active" }
  }
}
```

Added to the Zod schema in `src/config.ts` + test fixture; `Presence` and the bed/driver category
split are validated. The `modeRules`/`presenceBands` are explicitly a **starter sample set** — the
point of keeping them in config is tuning by ear, not editing code.

---

## 7. Audio playback (approach ① — reuse the engine)

- **`Layer.setEnvelope(scalar, rampMs)`** — ramps gain to `ceilingGain × scalar` (`scalar ∈ [0,1]`);
  reuses the existing ceiling `targetGain` and ramp machinery. No second gain node.
- **`AudioEngine.setTrackEnvelope(id, scalar)`** — delegates to the layer.
- **`ArrangementScheduler`** — controller like `useAudioEngine`: on `play`, resumes the engine +
  starts a `schedulerTickMs` loop; each tick, for every track, finds the covering module
  instance(s), expands its template region, computes `regionEnv · bridgeFactor`, and applies
  `setTrackEnvelope` (0 if uncovered). `pause`/`seek` move the clock.
- Rejected: native `setValueCurveAtTime` (pause/seek/edit = full reschedule); second per-track gain
  node (no conflict to isolate on `/layer2`).

---

## 8. State, route, UI

**Route/handoff.** `/layer2` client page, guarded like `/layer1` (no selection → redirect). The
"Continue to Layer Two" button snapshots non-muted tracks → `buildComposition` → `router.push`.

**`arrangementStore`** (Zustand singleton): `composition`, `playing`, `positionSec`, `activeMode`
(which template the Designer is editing). Actions: `initFrom`, `setDurationMin` (rebuild),
`regenerate` (re-seed templates), `play/pause/seek`; **detail edits** `moveRegion/setRegionEdge/
toggleRegion` (on the active template — shared across instances); **structure edits**
`setModuleDuration/reorderModule/setBridgeOverlap`.

**UI — two views, Layer One accent tokens + canvas language:**
- **Composition (`ARRANGE`)** — header (Return to Layer One, duration, transport, `mm:ss/mm:ss`,
  read-only master); the **module track** (draggable clips with a per-module **density summary**
  preview; edge = duration, body = reorder) with **bridge handles** (⇄, draggable overlap) between;
  overview minimap + playhead. Click a module → Designer.
- **Module Designer (`MODULES`)** — mode tabs / back link; category lanes with **draggable region
  clips** (`regionEnv` fill); a density readout. This edits the active mode template.
- Left nav rail: `ARRANGE`/`MODULES` active; `BRIDGES/MIXER/AUTOMATE/ATMOSPHERES/PRESETS/JOURNAL/
  SETTINGS` disabled stubs.
- **Drag geometry** (`pxToSec`, `secToPx`, `clampRegion`, `clampBridge`) — pure + unit-tested;
  pointer wiring browser-verified. Playhead reuses Layer One's line + round-marker style.

---

## 9. File plan

```
src/arrange/buildModeTemplate.ts    mode rules + bands → template regions (density peak)
src/arrange/buildSequence.ts        duration → module instances + default bridges
src/arrange/buildComposition.ts     templates + sequence + bridges
src/arrange/regionEnv.ts            regionEnvAt() per-clip fade-in/hold/fade-out
src/arrange/bridges.ts              bridgeFactor(); continuity carry-through
src/arrange/geometry.ts             pxToSec / secToPx / clampRegion / clampBridge
src/arrange/arrangementStore.ts     Zustand store + detail/structure actions
src/arrange/ArrangementScheduler.ts play loop → engine.setTrackEnvelope
src/audio/Layer.ts                  + setEnvelope(scalar, rampMs)
src/audio/AudioEngine.ts            + setTrackEnvelope(id, scalar)
src/app/layer2/page.tsx             route + selection guard
src/components/layer2/*             CompositionView, ModuleTrack, ModuleClip, BridgeHandle,
                                    ModuleDesigner, TrackLaneRow, RegionClip, TransportBarL2, ...
src/config.ts / config/ecosonic.config.json   layerTwo block + schema
```

Layer One's `BuilderScreen` gets "Continue to Layer Two" enabled → `buildComposition` + navigate.

---

## 10. Testing

- **Pure, fully unit-tested:** `buildModeTemplate` (rules → presence → region placement; density
  peaks near `peakFrac`), `buildSequence` (count/rounding, mode cycling, default bridges),
  `regionEnv` (fade shape, 0 outside, `env ≤ 1`, `gain ≤ ceiling`), `bridges` (crossfade 1→0/0→1,
  continuity carries through, total-length accounting), `geometry` (px↔sec, clamping, min width).
- **Store-tested:** duration rebuild; `regenerate`; template edit reflected across instances;
  structure edits clamp.
- **Browser-verified** (jsdom has no Web Audio, per Layer One): scheduler → engine gain, drag
  interactions in both views, visual pass vs. the reference.

---

## 11. Open assumptions (resolved to a default)

1. **Density = arrangement.** No global volume/session curve; module & session shapes are the sum of
   overlapping regions. *(Corrected an earlier draft that imposed a global envelope.)*
2. **Mode templates are shared** — design a mode once; every instance reuses it (identical repeats
   for now; varying repeats = sample regeneration, deferred).
3. **Mode rules are a sample/starter config set**, tuned later.
4. **Bridges = adjustable crossfade overlap**; continuity layers carry through (not a hard cut, not a
   silent seam).
5. **Master read-only**; regions **module-bound** (relative to their module); time-scaled via small
   `totalSec` in tests.
```

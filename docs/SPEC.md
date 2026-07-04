# ECOSONIC — Technical Specification

**Status:** Living document · **Last updated:** 2026-07-04
**Related:** [PRD.md](./PRD.md) · [ADRs](./adr/README.md)

This describes the system *as built*. Design docs for individual builds live under
`docs/superpowers/specs/` and `docs/superpowers/plans/`.

---

## 1. Stack & conventions

- **Next.js 16** (App Router, Turbopack) — note: this repo's Next has breaking changes vs. common
  training data; consult `node_modules/next/dist/docs/` before touching routing/data APIs.
- **TypeScript**, `@/` path alias → `src/`.
- **Zustand** (vanilla stores + `useStore`) for state.
- **Web Audio API** for playback; **p5.js** + canvas for visuals.
- **Tailwind v4** + oklch design tokens; **light-first**, element-themed.
- **Zod** validates `config/ecosonic.config.json` at import time.
- **Vitest** (jsdom). Web Audio is unavailable in jsdom, so **pure logic is unit-tested and audio
  is browser-verified** (see §8).
- Verify with `npx tsc --noEmit`, `npm run test`, `npm run build`.

## 2. Routes

```
src/app/page.tsx          /         → <ElementChooser onSelected→push('/layer1')>
src/app/layer1/page.tsx   /layer1   → guard(no element→/) → <BuilderScreen>
src/app/layer2/page.tsx   /layer2   → guard(no composition→/) → <ArrangeScreen>
src/app/api/samples/[...path]/route.ts   streams audio files
```

## 3. Core data model (`src/types.ts`)

```ts
type ElementName = 'EARTH'|'WATER'|'AIR'|'FIRE'|'ETHER';
type Category    = 'ISO'|'PLANET'|'NOISE'|'ELEMENT'|'ELEMENT_SUB'|'BASS'|'PAD'|'ARP'|'MELODY'|'FX';

interface Track {              // Layer One track
  id; category: Category; label; sample: {name;path;bytes};
  volumeDb: number;            // the ceiling; UI range is centered ±20 dB (0 = unity)
  muted; playing; locked: boolean;
}
interface Project { element: ElementName|null; tracks: Track[]; masterVolumeDb; tuningHz }
```

## 4. Audio engine (`src/audio/`)

- **`AudioEngine`** owns one `AudioContext`, a master `GainNode` → `AnalyserNode` → destination,
  and a `Map<id, Layer>`.
  - `setTracks(specs)` — reconciles layers; loads each; **guards against the context being cleared
    mid-`await`** (navigation race, see ADR-0006 consequences).
  - Layer One control: `setTrackVolume`, `setMute`, `setTrackPlaying`, `play`/`pause` (global).
  - Layer Two control: `triggerTrack(id, offsetSec=0)`, `releaseTrack(id)`,
    `resumeContext()` / `suspendContext()`, `setTrackEnvelope(id, scalar)`, `getLayerDuration(id)`.
- **`Layer`** wraps one sample as a **looping** source — decoded `AudioBufferSourceNode` (small
  files) or streamed `HTMLAudioElement` from an in-memory blob URL (large files), chosen by
  `chooseSourceKind(bytes, threshold)`. Owns a per-layer gain + passive analyser.
  - `trigger(offsetSec)` — (re)start the source at `offsetSec` wrapped into the sample length; ramp
    gain to the ceiling over 8 ms.
  - `release(rampMs)` — short anti-click ramp then stop (no musical fade — see ADR-0002).
  - `getDuration()` — real sample length once loaded.
  - `dbToGain(db, minDb)` (`src/audio/dsp.ts`): `db<=minDb ? 0 : 10^(db/20)`.

## 5. Layer One (`src/session/`, `src/components/`, `src/audio/useAudioEngine.ts`)

- **`buildSelection(element, manifest, cfg, rng)`** (pure) — picks tracks per
  `config.selection[category]` counts.
- **`sessionStore`** (Zustand singleton via `appStore.ts`) — the `Project` + actions
  (`selectElement`, `setTrackVolumeDb`, `toggleMute/Lock/TrackPlaying`, `changeTrack`,
  `regenerate`, `setMasterVolumeDb`, `toggleGlobalPlaying`, `backToChooser`).
- **`useAudioEngine`** — mounts an `AudioEngine` and **reconciles** it against `sessionStore`
  (membership diff → `setTracks`; else per-track volume/mute/playing; master; global play/pause).
- **UI** — `ElementChooser`, `BuilderScreen`, `TrackLane`, `TransportBar`, `LaneVisualizer`,
  `Visualizer`. Volume config split into `track` (±20) vs `master` (−60…0) ranges; the silence
  floor is decoupled from the track-slider minimum.

## 6. Layer Two (`src/arrange/`, `src/components/layer2/`)

### 6.1 Handoff
`snapshotSelection(project)` → `{ element, tracks: ArrTrack[], tuningHz, masterDb }`, dropping muted
tracks and mapping `volumeDb → ceilingDb`. The (currently disabled-then-enabled) "Continue to Layer
Two" button seeds the store and routes.

### 6.2 Arrangement types (`src/arrange/types.ts`)
```ts
type Mode = 'INTRODUCTION'|'DEEP_RELAXATION'|'RETURN';   // the three 10-min sections
const BED_CATEGORIES = ['NOISE','ISO','PLANET','ELEMENT'];   // isBed()
interface ArrTrack { id; category; label; sample; ceilingDb; locked }
interface RegionTiming { enterSec; exitSec; fadeInSec; fadeOutSec }
interface TemplateRegion extends RegionTiming { trackId }
interface ModeTemplate { mode; regions: TemplateRegion[] }
interface ModuleInstance { id; mode; startSec; durationSec }
interface Bridge { id; fromInstanceId; toInstanceId; overlapSec }
interface Composition { tracks; templates: Record<Mode,ModeTemplate>; sequence; bridges;
                        totalSec; tuningHz; masterDb }
```

### 6.3 Single-module designer (the live UI)
- **`arrangementStore`** holds: `element`, `tracks`, `moduleRegions: TemplateRegion[]`,
  `trackDurations`, `playing`, `positionSec`, `scrubbing`, `masterDb` (+ the parked `composition`,
  `durationMin`, `activeMode`). Actions: `initFrom`, `play/pause/seek/setPosition/setScrubbing`,
  `updateModuleRegion`, `setTrackDuration`, `loadMode`, …
- **Seed / mode picker:** `initFrom` seeds `moduleRegions` via `buildModeTemplate(tracks, modes[0])`;
  `loadMode(mode)` reseeds from a chosen mode's **timing table** (§6.3.1). NOISE spans `[0, D]`;
  other layers enter/exit per the table, so density peaks mid-module.
- **`ArrangeScreen`** — header (Return, play/pause, **scrub slider**, `mm:ss/mm:ss`), element theme,
  and `ModuleDesigner`.
- **`ModuleDesigner`** — one lane per track: a draggable clip (edges = enter/exit via pointer +
  `clampRegion`; body = move) + a `played/total` readout. A **single playhead overlay** spans all
  lanes, aligned to the shared timeline column.
- **`useLayer2Engine`** — loads tracks (`playing:false`), sets master, polls `getLayerDuration` into
  `trackDurations`, and resumes/suspends the context on play/pause.
- **`useModuleScheduler`** — rAF loop: while playing, advance (or hold, while scrubbing) `positionSec`
  looping `[0, D]`; on each frame drive playback:
  - **entering a clip** → `triggerTrack(id, pos − enter)` (offset ≈ 0);
  - **leaving a clip** → `releaseTrack(id)`;
  - **on a position jump** (scrub released, or play (re)started) → re-seek every present track to
    `pos − enter` (sample-accurate, ADR-0003);
  - normal forward playback re-seeks nothing (sources stay in sync).

### 6.3.1 Loading a mode into clips (the density pipeline)

A mode is loaded from its config **timing table** (see `config.layerTwo`, §7) into draggable clips:

```
config.layerTwo.modeRules[mode][category]   → { enter, exit, fadeIn, fadeOut } (seconds) | null
        │                                       (null = the category is absent in this mode)
        ▼  buildModeTemplate(tracks, mode, cfg)          [src/arrange/buildModeTemplate.ts]
   for each track:  t = modeRules[mode][track.category]
                    null → no region
                    else → region [t.enter, t.exit] with fades capped to half the clip width
        │
        ▼  TemplateRegion[]
   arrangementStore.initFrom → seedModuleFromTable(tracks, modes[0])   (modes[0] = INTRODUCTION)
   arrangementStore.loadMode(mode) → reseed from that mode's table       (the mode picker)
        │
        ▼  moduleRegions
   ModuleDesigner renders one draggable clip per region;
   useModuleScheduler triggers each track from its playhead offset during playback.
```

- **Where the tables are:** `config/ecosonic.config.json` → `layerTwo.modeRules`; Zod-validated in
  `src/config.ts` (`Timing` / `ModeRule` / `LayerTwo`). Timings are transcribed from the production
  brief (`TRACK INFO`).
- **Swap mode (mode picker):** `loadMode(mode)` → `buildModeTemplate(tracks, mode, cfg)`.
  `DEEP_RELAXATION` sets the driver categories to `null` → stripped-back bed; `INTRODUCTION`/`RETURN`
  stagger PAD/Bass/Melody in.
- **Categories:** `ARP` and `ELEMENT_SUB` (Sub-Elements) are real categories, selected in Layer One
  (`SELECTION_ORDER`) and placed by the timing tables — ARP in Introduction/Return, Sub-Elements only
  in Deep Relaxation. A 2nd Element/Sub-Element enters at `secondElementEnterSec` (~5:00). Per the
  brief `FX` is an element-type layer (present throughout). *(Sub-Elements exist in the manifest for
  EARTH/AIR/FIRE only; WATER/ETHER fall back to ELEMENT.)*
- The tables are a **tunable set** (ADR-0004); the density peak is emergent from clip overlap
  (ADR-0001), not an imposed curve.

### 6.4 Composition machinery (built + tested, parked)
Pure functions ready for the multi-module phase, all unit-tested:
- `buildModeTemplate(tracks, mode, cfg)` — density table → staggered regions (bed jitter-free).
- `buildSequence(totalSec, cfg)` — duration → `ModuleInstance[]` (cycling modes) + `Bridge[]` +
  `totalSec` (modules overlap by `bridgeSeconds`).
- `buildComposition(sel, totalSec, cfg)` — templates for all modes + sequence.
- `regionEnvAt(region, s)` — cosine fade-in/hold/fade-out (Phase-2 gain model).
- `crossfade(t, overlap)` — cosine bridge crossfade.
- `trackScalarAt(comp, track, s)` — per-track gain scalar across the whole composition (max of
  covering instances; bed carries through bridges; drivers crossfade).
- `useArrangementScheduler` — the composition-level gain scheduler (unused while single-module).

## 7. Config (`config/ecosonic.config.json`, schema in `src/config.ts`)

Relevant to Layer Two (`config.layerTwo`):
```jsonc
moduleSeconds, bridgeSeconds, regionFadeSeconds, peakFrac, schedulerTickMs,
durationPresetsMin, modes: ['INTRODUCTION','DEEP_RELAXATION','RETURN'],
modeRules: {                                     // per-layer timing table, transcribed from the brief
  <MODE>: { <Category>: { enter, exit, fadeIn, fadeOut } | null }   // seconds; null = absent
}
```
The `modeRules` are an explicit **tunable set** (ADR-0004).

## 8. Testing strategy

- **Unit-tested (pure):** config schema, `buildSelection`, `dsp`, `waveform`, all `src/arrange/`
  builders + `regionEnv` + `bridges` + `trackScalar` + `geometry` + `snapshotSelection` + the
  stores. ~80 tests.
- **Browser-verified:** `AudioEngine`/`Layer` (Web Audio), the schedulers, and all drag/pointer
  interaction — jsdom cannot host these.
- Every task ships green `tsc`, `vitest`, and `next build`.

## 9. File map (abridged)

```
src/audio/            AudioEngine, Layer, dsp, sourceKind, useAudioEngine, EngineContext
src/session/          buildSelection, sessionStore, appStore, manifestBuild, selectionRules
src/arrange/          types, buildModeTemplate/Sequence/Composition, regionEnv, bridges,
                      trackScalar, geometry, snapshotSelection, arrangementStore,
                      useLayer2Engine, useModuleScheduler, useArrangementScheduler
src/components/        ElementChooser, BuilderScreen, TrackLane, TransportBar, LaneVisualizer, ...
src/components/layer2/ ArrangeScreen, ModuleDesigner, ModuleBand (parked)
config/ecosonic.config.json + src/config.ts
```

## 10. Known gaps (see PRD §8)

- `tuningHz` carried but never applied (no `playbackRate`).
- No per-track effects model.
- No persistence.
- Multi-module composition & mode selection are implemented at the engine level but not surfaced in
  the UI.

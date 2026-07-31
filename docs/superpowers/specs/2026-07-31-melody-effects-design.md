# Per-track reverb & delay sends — design

**Date:** 2026-07-31
**Status:** approved, ready for planning
**Branch:** `feat/melody-effects`

## 1. Problem

Melody phrases in `/remix` stop abruptly.

The cause is in `src/remix/parseSessionTimeline.ts:88-89`:

```ts
fadeInSec:  i === 0 ? fadeInSec : 0,
fadeOutSec: i === spans.length - 1 ? fadeOutSec : 0,
```

Only the **first** phrase of a rule gets a fade-in and only the **last** gets a fade-out. Every
phrase in between has `fadeInSec = 0` and `fadeOutSec = 0`. Combined with remix rule 5.3 — "a gap
between them releases and re-triggers" — an intermediate phrase plays at full level until
`Layer.release()` ramps it to zero in `muteRampMs` (80 ms). That is an anti-click ramp, not a
musical fade, and it is what sounds abrupt.

Widening those fades is not an option: `fadeInSec`/`fadeOutSec` derive from the authored `full:` /
`leaving:` clock markers in the session timeline files, and remix rule 6.5 states authored entry
points never move. A reverb tail adds time *after* the phrase without touching the timing grid.

Two consequences of the diagnosis shape the design:

- Because intermediate phrases have **no fade-out**, the signal is at full level right up to the
  cut. A post-fade send therefore feeds the reverb a strong signal and the tail rings out audibly.
- This addresses phrase boundaries only. Remix rule 5.2's internal loop seams are hard cuts inside
  a continuously-playing sample; a tail cannot bridge a seam in a signal that never stopped. Out of
  scope.

## 2. Goals and non-goals

**Goals**

- Reverb and delay available per track, as aux sends, driven by sliders in the remix track pool.
- MELODY seeded to a musically useful default so it sounds right before any slider is touched.
- Export reproduces what playback sounds like, including the final tail.
- Closes the `docs/SPEC.md` §10 gap "No per-track effects model."

**Non-goals**

- Fixing loop-seam cuts (remix rule 5.2).
- Persisting send values across save/load — `arrangementFile.ts:32` does not persist `ceilingDb`
  either, so sends are consistent with existing behaviour. See §9.
- Effects on the Layer One builder screen. The buses live in `AudioEngine`, so Layer One gets the
  capability for free, but no UI is added there and its sends stay at 0.

## 3. Architecture

Both effect chains are built once per `AudioContext` and shared by every track. One convolver
total, not one per track — convolution is the most expensive node in the graph, and a shared bus
keeps cost flat regardless of how many tracks play.

```
Layer.gain ─┬────────────────────────────────────────────► master ─► analyser ─► destination
            ├─► revSend ─► reverbBus ─► preDelay ─► convolver ─────► master
            ├─► delSend ─► delayBus  ─► delay ─► damp ─► feedback ─┐
            │                            ▲                         │
            │                            └─────────────────────────┘
            │                          delay ───────────────────────► master
            └─► analyser  (existing passive visualisation tap, unchanged)
```

`revSend` and `delSend` are per-Layer `GainNode`s — these are the knobs. They tap `this.gain`,
which is **post-fade**: when `release()` ramps the dry signal to zero, no new signal enters the
effects, but the convolver's and delay line's existing state keeps decaying. That decay is the
feature.

Ownership matters. The convolver and delay live on `AudioEngine`, not on `Layer`.
`Layer.dispose()` calls `this.gain.disconnect()`; if a Layer owned the effect nodes, disposing a
track would cut its own tail mid-decay.

### Why the send tap is post-fade

A pre-fade tap would keep feeding the effects after a phrase has faded out, which is wrong for the
last phrase of a rule (which has a real, authored fade-out — its tail should fade with it). Because
intermediate phrases have no fade at all, post-fade loses nothing where it matters.

## 4. New module: `src/audio/effects.ts`

The single source of truth that prevents the live and offline graphs from drifting apart.

```ts
export interface EffectsConfig { /* mirrors config.audio.effects */ }

/** Deterministic decaying-noise impulse response. Seeded, so live and export agree. */
export function makeImpulseResponse(
  ctx: BaseAudioContext, seconds: number, decay: number, seed: number,
): AudioBuffer;

/** Build the shared reverb and delay chains into `master`. Returns the two input buses
 *  and how long the graph keeps sounding after its last input. */
export function buildEffectBuses(
  ctx: BaseAudioContext, master: AudioNode, cfg: EffectsConfig,
): { reverbBus: GainNode; delayBus: GainNode; tailSec: number };
```

Typed on `BaseAudioContext`, so the same function serves the live `AudioContext` and the export's
`OfflineAudioContext`.

It returns bus nodes rather than doing the connecting itself, because the two callers wire
different sources in: live taps one persistent `Layer.gain` per track, the export taps one gain per
*region*. Acoustically identical — both sum into the same bus at the same levels.

### Deterministic impulse response

`Math.random()` would synthesize a different room in every context, so a live listen and an export
would differ, as would two exports of the same mix. A seeded PRNG (mulberry32) fixes this and makes
`makeImpulseResponse` unit-testable against exact sample values rather than only "it decays".

```ts
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

### `tailSec`

Derived from config, never hardcoded, so it cannot drift out of sync with the effects it must
outlast:

```
reverbTail = reverb.seconds
delayTail  = delay.timeSec × log(0.001) / log(clamp(delay.feedback, 0, 0.95))   // to −60 dB
tailSec    = max(reverbTail, delayTail)
```

Feedback is clamped below 1. At `feedback >= 1` the repeats never decay: the formula degenerates
and the audio is a runaway that pins and clips.

## 5. Data model

### Store — `arrangementStore`

Sends are runtime mix state keyed by track id, not track identity. They follow the existing
`trackDurations: Record<string, number>` precedent (`arrangementStore.ts:21`) rather than being
added to `ArrTrack`.

```ts
export interface TrackSends { reverb: number; delay: number }   // each 0..1

// state
trackSends: Record<string, TrackSends>;

// action
setTrackSend: (trackId: string, kind: 'reverb' | 'delay', value: number) => void;  // clamps 0..1
```

This keeps the diff to 2 files instead of 18: adding required fields to `ArrTrack` would break
every one of the 16 test files that construct `ArrTrack` literals, and would buy nothing, since
`arrangementFile.ts:32` persists only `id`, `category`, `sampleName`, `samplePath`.

`trackSends` is seeded from `config.audio.effects.defaultSends` keyed by category whenever tracks
are loaded — the same places `trackDurations` is reset.

### Engine

`TrackAudioSpec` and `LayerInit` each gain `reverbSend: number` and `delaySend: number`.

```ts
// AudioEngine
setTrackSend(id: string, kind: 'reverb' | 'delay', value: number): void;
// Layer
setSend(kind: 'reverb' | 'delay', value: number, rampMs: number): void;
```

### Config — `config.audio.effects`

```jsonc
"effects": {
  "reverb": { "seconds": 2.5, "decay": 2.0, "preDelayMs": 30, "seed": 1 },
  "delay":  { "timeSec": 0.375, "feedback": 0.3, "dampHz": 3000, "maxTimeSec": 5 },
  "defaultSends": { "MELODY": { "reverb": 0.20, "delay": 0.12 } }
}
```

Validated by a zod schema in `src/config.ts` alongside `volume` and `tuning`. `defaultSends` is a
partial record over `Category`; any category not listed defaults to `{ reverb: 0, delay: 0 }`.

## 6. Data flow

### Live

1. Slider → `setTrackSend(trackId, kind, value)`.
2. `useLayer2Engine`'s store subscription diffs sends against a `Map`, exactly as it already does
   for `ceilingDb` (`useLayer2Engine.ts:52-60`), and calls `engine.setTrackSend(...)`.
3. `Layer.setSend` ramps the send gain over `changeRampMs` (200 ms) so drags do not zipper.

The sends must ride the **subscription**, not the effect dependency. `trackKey`
(`useLayer2Engine.ts:25`) deliberately covers only id and sample path; putting sends in it would
re-fetch and re-decode every sample on each slider movement.

### Export

`renderModuleToChannels` calls `buildEffectBuses` and connects each region's gain node into the two
buses at that track's send levels, then extends the render window:

```ts
const renderSec = D + tailSec;                                   // was: D
const ctx = new OfflineAudioContext(2, Math.ceil(renderSec * sr), sr);
```

Regions are already clipped to the timeline (remix rule 4.3), so the last dry sound always ends at
or before `D` and the extra window is pure tail.

`renderFreeMix.ts` is a thin wrapper over `renderModuleToWav`, so the remix export inherits this
with no change of its own — but it needs `tracks`' send values threaded through, since the offline
renderer has no store access.

Knock-ons:

- `estimatedWavBytes` must account for `tailSec`; the file is now `totalSec + tailSec` long.
- `onProgress` marks (`renderModuleWav.ts:66-74`) must divide by `renderSec`, not `D`, or progress
  reaches 1.0 before the render finishes.

### Chained session export — overlap-add

`renderSessionToWav` (used by `ArrangeScreen.tsx:93`) renders each mode with
`renderModuleToChannels` and concatenates the PCM at `offset += len`
(`renderSessionWav.ts:41-45`). A longer per-module render breaks this: each module's tail would be
inserted *between* modules, adding `n × tailSec` of decay-then-silence gaps and pushing every
subsequent module late.

The fix is overlap-add, which also matches how live playback behaves — the context runs continuously
across `advanceSession()`, so module 1's tail rings over module 2's opening:

```
advance offset by  D × sr      (the module's musical length, not its rendered length)
mix with           +=          (sum into the buffer, not set())
total length       n × D × sr + tailSec × sr
```

Only the final module's tail extends past the end; every intermediate tail lands on top of the next
module's opening, where it belongs.

Two consequences:

- Summing overlapping tails can exceed 1.0 where a loud module ending meets a loud module opening.
  The existing renderer has no limiter and `encodeWavPcm16` will clamp. Acceptable at the send
  levels in `defaultSends`, but it is a real edge and should be listened for.
- `renderSessionWav.test.ts` asserts exact output sample counts. Those expectations change to
  `n × D + tailSec`.

## 7. UI

`TrackPoolRow`'s grid goes `[140px_1fr]` → `[140px_1fr_auto]`, with two compact sliders (Rev, Dly)
in the new column reading `trackSends[track.id]` and writing through `setTrackSend`. Values render
as percentages. Existing chip layout is unchanged.

## 8. Testing

This repo does not write fake audio tests — jsdom has no Web Audio, `RemixView.test.tsx` mocks
`AudioEngine` wholesale, and the Layer One engine plan states runtime behaviour is "verified in the
browser". This design follows that convention.

| Level | Coverage |
|---|---|
| Unit | `makeImpulseResponse` — length, channel count, monotonic decay, and exact values for a fixed seed (determinism is the point of seeding). |
| Unit | `tailSec` arithmetic, including the `feedback >= 1` clamp. |
| Store | `setTrackSend` updates only the target track and clamps to 0..1; `defaultSends` seeding puts MELODY above zero and everything else at zero. |
| Engine | `setTrackSend` routes to the right `Layer` (mocked, as existing engine tests do). |
| Component | `TrackPoolRow` renders both sliders and dispatches on change. |
| Browser | Graph wiring, the tail across a phrase boundary, and the exported WAV's ending — by ear on `/remix`. |

## 9. Risks and accepted limitations

- **Export length changes.** WAVs become `tailSec` (~2.5 s) longer than `totalSec`. Intended, but
  it makes the export duration differ from the arrangement duration, which should be documented.
- **Export is not a bit-identical bounce, and never was.** Live triggers land on
  `requestAnimationFrame` boundaries (~16 ms, `useModuleScheduler.ts:24`) while the offline renderer
  schedules sample-exactly; and `chooseSourceKind` streams large files live but decodes everything
  offline. Both pre-date this work. Remix rule 5.5 "export mirrors playback" is a claim about
  musical equivalence, not bytes — worth restating in the rules doc so the seeded IR does not invite
  the stronger expectation.
- **Loop wrap.** Live, remix loops (`useModuleScheduler.ts:42`) and the tail bleeds across the wrap
  into the next pass; an export is a single linear pass and decays into silence. Inherent to
  bouncing a loop.
- **Sends do not persist.** Consistent with `ceilingDb`, which also does not. If persistence is
  wanted later it belongs in a `version: 2` arrangement file covering both.
- **Layer One is untouched but capable.** The buses exist in any `AudioEngine`; Layer One simply
  has no UI and zero sends. A later change can surface them without engine work.

## 10. Documentation to update

- `docs/SPEC.md` §10 — remove "No per-track effects model."
- `docs/remix-rules.md` — new section covering sends, the export tail, and the loop-wrap caveat.

## 11. Files touched

**New:** `src/audio/effects.ts` (+ test)

**Changed:** `src/config.ts`, `config/ecosonic.config.json`, `src/audio/AudioEngine.ts`,
`src/audio/Layer.ts`, `src/arrange/arrangementStore.ts`, `src/arrange/useLayer2Engine.ts`,
`src/arrange/render/renderModuleWav.ts`, `src/arrange/render/renderSessionWav.ts`,
`src/remix/renderFreeMix.ts`, `src/components/remix/RemixView.tsx`,
`src/components/remix/TrackPoolRow.tsx`, `src/components/layer2/ArrangeScreen.tsx`,
`docs/SPEC.md`, `docs/remix-rules.md`

The two screen components appear because the offline renderers have no store access: `RemixView`
(`:104`) and `ArrangeScreen` (`:75`, `:93`) call the exporters, so they must read `trackSends` from
the store and pass it in.

**Test expectations that change:** `renderSessionWav.test.ts` (output sample counts),
`renderFreeMix.test.ts` (module seconds passed through).

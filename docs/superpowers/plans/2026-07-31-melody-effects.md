# Per-track reverb & delay sends — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-track reverb and delay aux sends so melody phrase transitions ring out instead of cutting off, in both live playback and every WAV export.

**Architecture:** One shared reverb chain and one shared delay chain are built per `AudioContext` and connected into `master`. Each `Layer` taps its own post-fade gain into both buses through a per-track send `GainNode` — the knob. Because the effect nodes are owned by `AudioEngine` rather than by `Layer`, a track stopping or being disposed leaves its tail decaying. The same `buildEffectBuses` function builds the graph in the live `AudioContext` and in the export's `OfflineAudioContext`, so the two cannot drift apart.

**Tech Stack:** TypeScript, raw Web Audio API (no audio libraries), Zustand, Zod, Vitest, React 19 / Next.js.

**Design spec:** `docs/superpowers/specs/2026-07-31-melody-effects-design.md` — read it before Task 1.

## Global Constraints

- **No new dependencies.** Reverb and delay are native Web Audio nodes. Do not add Tone.js or any DSP package.
- **This is not the Next.js you know** (`AGENTS.md`). Read the relevant guide in `node_modules/next/dist/docs/` before changing anything under `src/app/`. No task in this plan requires it.
- **No fake Web Audio tests.** jsdom has no Web Audio API. Test pure functions and store logic only; graph wiring is verified in the browser. This matches the existing convention — `RemixView.test.tsx` mocks `AudioEngine` wholesale.
- **Run tests scoped to `src/`:** `npx vitest run src/...`. A bare `npx vitest run` from the repo root can pick up `.claude/worktrees/` copies.
- **Send values are always `0..1`** and clamped at every boundary that accepts them.
- **Delay feedback is always clamped below 1.0.** At `feedback >= 1` the repeats never decay: the tail formula degenerates and the audio is a runaway that pins and clips.
- **Commit after every task**, using the repo's conventional-commit style (`feat(effects): ...`, `test(effects): ...`).

## Worktree Setup Note

A fresh worktree of this repo needs two gitignored artifacts before tests pass:

```bash
# ECOSONIC FILES/ (5.9 GB, gitignored) — junction to the main checkout, Windows:
#   New-Item -ItemType Junction -Path "<worktree>\ECOSONIC FILES" -Target "<main>\ECOSONIC FILES"
npm run build:manifest      # writes the gitignored src/manifest.json
```

Baseline before any work: **407 tests, 65 files, 0 failures.**

## File Structure

**New**

| File | Responsibility |
|---|---|
| `src/audio/effects.ts` | Seeded PRNG, impulse-response synthesis, tail-length arithmetic, default-send seeding, and the shared bus builder. The single source of truth shared by live and offline graphs. |
| `src/audio/effects.test.ts` | Unit tests for every pure export above. |

**Modified**

| File | Change |
|---|---|
| `src/config.ts` | `audio.effects` zod schema |
| `config/ecosonic.config.json` | `audio.effects` values |
| `src/audio/Layer.ts` | Two send `GainNode`s + `setSend` |
| `src/audio/AudioEngine.ts` | Own the buses; `setTrackSend`; pass sends into `Layer` |
| `src/arrange/arrangementStore.ts` | `trackSends` state, `setTrackSend` action, seeding in `initFrom` |
| `src/arrange/useLayer2Engine.ts` | Feed sends into specs; diff them in the subscription |
| `src/components/remix/TrackPoolRow.tsx` | Two sliders per row |
| `src/components/remix/RemixView.tsx` | Wire sliders; pass sends to the exporter |
| `src/arrange/render/renderModuleWav.ts` | Build buses; connect region sends; extend render by `tailSec` |
| `src/arrange/render/renderSessionWav.ts` | Overlap-add concatenation |
| `src/remix/renderFreeMix.ts` | Thread sends through; account for tail in `estimatedWavBytes` |
| `src/components/layer2/ArrangeScreen.tsx` | Pass sends to both exporters |
| `docs/SPEC.md`, `docs/remix-rules.md` | Document the feature |

---

### Task 1: Effects config and the pure effects module

Everything downstream reads from this. Pure functions here; the graph builder is added in Task 2.

**Files:**
- Create: `src/audio/effects.ts`
- Create: `src/audio/effects.test.ts`
- Modify: `src/config.ts` (add `EffectsSchema`, reference it in `ConfigSchema.audio`)
- Modify: `config/ecosonic.config.json` (add `audio.effects`)

**Interfaces:**
- Consumes: `EcosonicConfig` from `@/config`
- Produces:
  - `type EffectsConfig = EcosonicConfig['audio']['effects']`
  - `interface TrackSends { reverb: number; delay: number }`
  - `impulseChannel(length: number, decay: number, seed: number): Float32Array`
  - `tailSecFor(cfg: EffectsConfig): number`
  - `defaultSendsFor(tracks: ReadonlyArray<{ id: string; category: string }>, defaults: Record<string, TrackSends>): Record<string, TrackSends>`

- [ ] **Step 1: Add the config values**

In `config/ecosonic.config.json`, inside the existing `"audio"` object, after `"tuning"`:

```jsonc
"effects": {
  "reverb": { "seconds": 2.5, "decay": 2.0, "preDelayMs": 30, "seed": 1 },
  "delay": { "timeSec": 0.375, "feedback": 0.3, "dampHz": 3000, "maxTimeSec": 5 },
  "defaultSends": {
    "MELODY": { "reverb": 0.2, "delay": 0.12 }
  }
}
```

- [ ] **Step 2: Add the config schema**

In `src/config.ts`, add above `export const ConfigSchema`:

```ts
const SendsSchema = z.object({
  reverb: z.number().min(0).max(1),
  delay: z.number().min(0).max(1),
});
// Per-track aux sends. `defaultSends` is keyed by Category; an unlisted category is fully dry.
const EffectsSchema = z.object({
  reverb: z.object({
    seconds: z.number().positive(),
    decay: z.number().positive(),
    preDelayMs: z.number().nonnegative(),
    seed: z.number().int(),
  }),
  delay: z.object({
    timeSec: z.number().positive(),
    // Below 1 always: at >= 1 the repeats never decay and the tail is a runaway.
    feedback: z.number().min(0).max(0.95),
    dampHz: z.number().positive(),
    maxTimeSec: z.number().positive(),
  }),
  defaultSends: z.record(z.string(), SendsSchema),
});
```

Then inside `ConfigSchema`'s `audio` object, after the `tuning` block, add:

```ts
    effects: EffectsSchema,
```

- [ ] **Step 3: Write the failing tests**

Create `src/audio/effects.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { config } from '@/config';
import { defaultSendsFor, impulseChannel, tailSecFor } from '@/audio/effects';

describe('impulseChannel', () => {
  it('returns a buffer of the requested length', () => {
    expect(impulseChannel(128, 2, 1)).toHaveLength(128);
  });

  it('is deterministic for a given seed', () => {
    expect(Array.from(impulseChannel(64, 2, 7))).toEqual(Array.from(impulseChannel(64, 2, 7)));
  });

  it('differs between seeds, so the two stereo channels decorrelate', () => {
    expect(Array.from(impulseChannel(64, 2, 1))).not.toEqual(Array.from(impulseChannel(64, 2, 2)));
  });

  it('decays — the tail is quieter than the head', () => {
    const ir = impulseChannel(1000, 2, 1);
    const peak = (from: number, to: number) =>
      Math.max(...Array.from(ir.slice(from, to), Math.abs));
    expect(peak(900, 1000)).toBeLessThan(peak(0, 100));
  });

  it('ends at silence', () => {
    const ir = impulseChannel(256, 2, 1);
    expect(ir[255]).toBeCloseTo(0, 5);
  });

  it('stays within [-1, 1] so the convolver is not fed a hot buffer', () => {
    for (const v of impulseChannel(512, 2, 3)) expect(Math.abs(v)).toBeLessThanOrEqual(1);
  });
});

describe('tailSecFor', () => {
  const base = config.audio.effects;

  it('uses the reverb when it outlasts the delay', () => {
    const cfg = { ...base, reverb: { ...base.reverb, seconds: 9 }, delay: { ...base.delay, timeSec: 0.1, feedback: 0.1 } };
    expect(tailSecFor(cfg)).toBe(9);
  });

  it('uses the delay when it outlasts the reverb', () => {
    const cfg = { ...base, reverb: { ...base.reverb, seconds: 0.5 }, delay: { ...base.delay, timeSec: 1, feedback: 0.5 } };
    // 0.5 feedback reaches -60dB after log(0.001)/log(0.5) ≈ 9.97 repeats of 1s
    expect(tailSecFor(cfg)).toBeCloseTo(9.966, 2);
  });

  it('still allows one repeat at zero feedback', () => {
    const cfg = { ...base, reverb: { ...base.reverb, seconds: 0.1 }, delay: { ...base.delay, timeSec: 2, feedback: 0 } };
    expect(tailSecFor(cfg)).toBe(2);
  });

  it('clamps runaway feedback rather than returning Infinity', () => {
    const cfg = { ...base, delay: { ...base.delay, timeSec: 1, feedback: 1.5 } };
    expect(Number.isFinite(tailSecFor(cfg))).toBe(true);
  });

  it('is positive for the shipped config', () => {
    expect(tailSecFor(base)).toBeGreaterThan(0);
  });
});

describe('defaultSendsFor', () => {
  const defaults = { MELODY: { reverb: 0.2, delay: 0.12 } };

  it('seeds a listed category from the defaults', () => {
    const out = defaultSendsFor([{ id: 'm', category: 'MELODY' }], defaults);
    expect(out.m).toEqual({ reverb: 0.2, delay: 0.12 });
  });

  it('leaves an unlisted category fully dry', () => {
    const out = defaultSendsFor([{ id: 'b', category: 'BASS' }], defaults);
    expect(out.b).toEqual({ reverb: 0, delay: 0 });
  });

  it('covers every track', () => {
    const out = defaultSendsFor(
      [{ id: 'm', category: 'MELODY' }, { id: 'b', category: 'BASS' }],
      defaults,
    );
    expect(Object.keys(out).sort()).toEqual(['b', 'm']);
  });

  it('ships a non-zero MELODY default, so melody sounds right untouched', () => {
    expect(config.audio.effects.defaultSends.MELODY.reverb).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npx vitest run src/audio/effects.test.ts`
Expected: FAIL — `Failed to resolve import "@/audio/effects"`.

- [ ] **Step 5: Write the implementation**

Create `src/audio/effects.ts`:

```ts
import type { EcosonicConfig } from '@/config';

export type EffectsConfig = EcosonicConfig['audio']['effects'];

/** A track's aux send levels, 0..1 each. */
export interface TrackSends { reverb: number; delay: number }

export const DRY: TrackSends = { reverb: 0, delay: 0 };

const clamp01 = (v: number): number => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

/** mulberry32 — a small seeded PRNG. Same seed, same sequence, so the live context and the
 *  offline export context synthesize the identical room instead of two different ones. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One channel of a decaying-noise impulse response: white noise under a power envelope.
 *  Pure and AudioContext-free, so it unit-tests in jsdom where Web Audio does not exist. */
export function impulseChannel(length: number, decay: number, seed: number): Float32Array {
  const rand = mulberry32(seed);
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) out[i] = (rand() * 2 - 1) * Math.pow(1 - i / length, decay);
  return out;
}

/** How long the effects keep sounding after their last input, in seconds. Derived from config so
 *  it cannot drift out of sync with the effects it has to outlast. */
export function tailSecFor(cfg: EffectsConfig): number {
  const fb = Math.min(Math.max(cfg.delay.feedback, 0), 0.95); // >= 1 never decays
  // Repeats until -60dB (0.001). Zero feedback still yields the one audible repeat.
  const repeats = fb <= 0 ? 1 : Math.log(0.001) / Math.log(fb);
  return Math.max(cfg.reverb.seconds, cfg.delay.timeSec * Math.max(1, repeats));
}

/** Seed each track's sends from its category default. An unlisted category is fully dry. */
export function defaultSendsFor(
  tracks: ReadonlyArray<{ id: string; category: string }>,
  defaults: Record<string, TrackSends>,
): Record<string, TrackSends> {
  const out: Record<string, TrackSends> = {};
  for (const t of tracks) {
    const d = defaults[t.category];
    out[t.id] = { reverb: clamp01(d?.reverb ?? 0), delay: clamp01(d?.delay ?? 0) };
  }
  return out;
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/audio/effects.test.ts src/config.test.ts`
Expected: PASS. `config.test.ts` must still pass — it parses the real config, so a schema/JSON mismatch shows up here.

- [ ] **Step 7: Commit**

```bash
git add src/audio/effects.ts src/audio/effects.test.ts src/config.ts config/ecosonic.config.json
git commit -m "feat(effects): config schema and pure effects helpers"
```

---

### Task 2: The shared bus builder

Adds the graph-building half of `effects.ts`. Not unit-tested — it needs a real `AudioContext`. Verified in the browser at the end of Task 6.

**Files:**
- Modify: `src/audio/effects.ts`

**Interfaces:**
- Consumes: `impulseChannel`, `tailSecFor`, `EffectsConfig` (Task 1)
- Produces:
  - `interface EffectBuses { reverbBus: GainNode; delayBus: GainNode; tailSec: number }`
  - `buildEffectBuses(ctx: BaseAudioContext, master: AudioNode, cfg: EffectsConfig): EffectBuses`

- [ ] **Step 1: Add the bus builder**

Append to `src/audio/effects.ts`:

```ts
/** The two aux-send inputs, plus how long the chains keep sounding after their last input. */
export interface EffectBuses { reverbBus: GainNode; delayBus: GainNode; tailSec: number }

/** Build the shared reverb and delay chains and connect both into `master`.
 *
 *  Typed on BaseAudioContext so the identical graph is built for live playback (AudioContext) and
 *  for export (OfflineAudioContext) — one definition, so the two cannot drift.
 *
 *  Returns the bus inputs rather than connecting sources itself: live taps one persistent
 *  Layer.gain per track, the export taps one gain per region. Both sum into the same bus. */
export function buildEffectBuses(
  ctx: BaseAudioContext, master: AudioNode, cfg: EffectsConfig,
): EffectBuses {
  const { reverb, delay } = cfg;

  // --- reverb: send -> pre-delay -> convolver -> master
  const reverbBus = ctx.createGain();
  const preDelaySec = Math.max(0.001, reverb.preDelayMs / 1000);
  const preDelay = ctx.createDelay(preDelaySec);
  preDelay.delayTime.value = preDelaySec;
  const convolver = ctx.createConvolver();
  const len = Math.max(1, Math.floor(ctx.sampleRate * reverb.seconds));
  const ir = ctx.createBuffer(2, len, ctx.sampleRate);
  // Different seed per channel: identical channels would collapse the reverb to mono.
  ir.copyToChannel(impulseChannel(len, reverb.decay, reverb.seed), 0);
  ir.copyToChannel(impulseChannel(len, reverb.decay, reverb.seed + 1), 1);
  convolver.buffer = ir;
  reverbBus.connect(preDelay);
  preDelay.connect(convolver);
  convolver.connect(master);

  // --- delay: send -> line -> master, with a damped feedback loop around the line
  const delayBus = ctx.createGain();
  const line = ctx.createDelay(delay.maxTimeSec);
  line.delayTime.value = Math.min(delay.timeSec, delay.maxTimeSec);
  const damp = ctx.createBiquadFilter();
  damp.type = 'lowpass';
  damp.frequency.value = delay.dampHz;
  const feedback = ctx.createGain();
  feedback.gain.value = Math.min(Math.max(delay.feedback, 0), 0.95);
  delayBus.connect(line);
  // The spec requires a DelayNode inside any cycle, or every node in it is muted. `line` is it.
  line.connect(damp);
  damp.connect(feedback);
  feedback.connect(line);
  line.connect(master);

  return { reverbBus, delayBus, tailSec: tailSecFor(cfg) };
}
```

- [ ] **Step 2: Verify nothing regressed**

Run: `npx vitest run src/audio/ src/config.test.ts`
Expected: PASS (the Task 1 tests; this step adds no tests of its own).

- [ ] **Step 3: Commit**

```bash
git add src/audio/effects.ts
git commit -m "feat(effects): shared reverb and delay bus builder"
```

---

### Task 3: Per-track sends in the audio engine

**Files:**
- Modify: `src/audio/Layer.ts`
- Modify: `src/audio/AudioEngine.ts`

**Interfaces:**
- Consumes: `buildEffectBuses`, `EffectBuses`, `EffectsConfig` (Task 2)
- Produces:
  - `LayerInit` gains `reverbSend: number; delaySend: number`
  - `new Layer(ctx, master, init, buses: EffectBuses)`
  - `Layer.setSend(kind: 'reverb' | 'delay', value: number, rampMs: number): void`
  - `TrackAudioSpec` gains `reverbSend: number; delaySend: number`
  - `EngineConfig` gains `effects: EffectsConfig`
  - `AudioEngine.setTrackSend(id: string, kind: 'reverb' | 'delay', value: number): void`

- [ ] **Step 1: Add send nodes to `Layer`**

In `src/audio/Layer.ts`, add the import:

```ts
import type { EffectBuses } from '@/audio/effects';
```

Extend `LayerInit` with two fields after `minDb: number;`:

```ts
  reverbSend: number;  // 0..1
  delaySend: number;   // 0..1
```

Add two private fields next to `private gain: GainNode;`:

```ts
  private revSend: GainNode;
  private delSend: GainNode;
```

Change the constructor signature and append to its body, after the existing analyser wiring:

```ts
  constructor(ctx: AudioContext, master: GainNode, init: LayerInit, buses: EffectBuses) {
    // ... existing body unchanged, up to and including this.gain.connect(this.analyser);

    // Aux sends, tapped POST-fade: when release() ramps the dry signal to zero no new signal
    // enters the effects, but the convolver and delay line keep decaying. That tail is the point.
    // The effect nodes live on AudioEngine, not here — dispose() must not cut a tail short.
    this.revSend = ctx.createGain();
    this.revSend.gain.value = Math.min(1, Math.max(0, init.reverbSend));
    this.gain.connect(this.revSend);
    this.revSend.connect(buses.reverbBus);

    this.delSend = ctx.createGain();
    this.delSend.gain.value = Math.min(1, Math.max(0, init.delaySend));
    this.gain.connect(this.delSend);
    this.delSend.connect(buses.delayBus);
  }
```

Add the setter next to `setVolumeDb`:

```ts
  /** Ramp one aux send to a new level (0..1). */
  setSend(kind: 'reverb' | 'delay', value: number, rampMs: number) {
    const node = kind === 'reverb' ? this.revSend : this.delSend;
    const target = Math.min(1, Math.max(0, value));
    const now = this.ctx.currentTime;
    const g = node.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(target, now + Math.max(0.001, rampMs / 1000));
  }
```

In `dispose()`, add before `this.gain.disconnect();`:

```ts
    this.revSend.disconnect();
    this.delSend.disconnect();
```

- [ ] **Step 2: Own the buses in `AudioEngine`**

In `src/audio/AudioEngine.ts`, add the import:

```ts
import { buildEffectBuses, type EffectBuses, type EffectsConfig } from '@/audio/effects';
```

Add to `EngineConfig`:

```ts
  effects: EffectsConfig;
```

Add to `TrackAudioSpec`:

```ts
  reverbSend: number;
  delaySend: number;
```

Add the field next to `private analyser`:

```ts
  private buses: EffectBuses | null = null;
```

In `ensure()`, after `this.analyser = analyser;` and before `this.applyMaster();`:

```ts
    this.buses = buildEffectBuses(ctx, master, this.cfg.effects);
```

In `setTracks`, in the "existing && existing.path === s.path" branch, after the `setVolumeDb` line:

```ts
        existing.setSend('reverb', s.reverbSend, this.cfg.changeRampMs);
        existing.setSend('delay', s.delaySend, this.cfg.changeRampMs);
```

In the same method, replace the `const layer = new Layer(...)` call with:

```ts
      const buses = this.buses;
      if (!buses) return; // context cleared mid-load
      const layer = new Layer(ctx, master, {
        id: s.id, path: s.path, bytes: s.bytes,
        thresholdBytes: this.cfg.thresholdBytes, volumeDb: s.volumeDb, minDb: this.cfg.minDb,
        reverbSend: s.reverbSend, delaySend: s.delaySend,
      }, buses);
```

Add the public setter next to `setTrackVolume`:

```ts
  setTrackSend(id: string, kind: 'reverb' | 'delay', value: number) {
    this.layers.get(id)?.setSend(kind, value, this.cfg.changeRampMs);
  }
```

In `clear()`, add alongside the other nulling:

```ts
    this.buses = null;
```

- [ ] **Step 3: Verify the suite still compiles and passes**

Run: `npx vitest run src/`
Expected: PASS. Any test constructing a `TrackAudioSpec` needs the two new fields — fix by adding `reverbSend: 0, delaySend: 0`.

- [ ] **Step 4: Commit**

```bash
git add src/audio/Layer.ts src/audio/AudioEngine.ts
git commit -m "feat(effects): per-track aux sends in Layer and AudioEngine"
```

---

### Task 4: Send state in the arrangement store

**Files:**
- Modify: `src/arrange/arrangementStore.ts`
- Modify: `src/arrange/arrangementStore.test.ts`

**Interfaces:**
- Consumes: `defaultSendsFor`, `TrackSends`, `DRY` (Task 1)
- Produces:
  - store state `trackSends: Record<string, TrackSends>`
  - store action `setTrackSend(trackId: string, kind: 'reverb' | 'delay', value: number): void`

- [ ] **Step 1: Write the failing tests**

Append to `src/arrange/arrangementStore.test.ts` (inside the existing top-level `describe`, following the file's existing setup conventions):

```ts
  it('seeds MELODY sends from config and leaves other categories dry', () => {
    useArrangement.getState().initFrom(selLive, 10);
    const sends = useArrangement.getState().trackSends;
    expect(sends.mel.reverb).toBeGreaterThan(0);
    expect(sends.n).toEqual({ reverb: 0, delay: 0 });
  });

  it('setTrackSend updates only the target track and only the target kind', () => {
    useArrangement.getState().initFrom(selLive, 10);
    const before = useArrangement.getState().trackSends.mel.delay;
    useArrangement.getState().setTrackSend('mel', 'reverb', 0.5);
    const after = useArrangement.getState().trackSends;
    expect(after.mel.reverb).toBe(0.5);
    expect(after.mel.delay).toBe(before);
    expect(after.n).toEqual({ reverb: 0, delay: 0 });
  });

  it('setTrackSend clamps out-of-range values', () => {
    useArrangement.getState().initFrom(selLive, 10);
    useArrangement.getState().setTrackSend('mel', 'reverb', 5);
    expect(useArrangement.getState().trackSends.mel.reverb).toBe(1);
    useArrangement.getState().setTrackSend('mel', 'delay', -2);
    expect(useArrangement.getState().trackSends.mel.delay).toBe(0);
  });

  it('setTrackSend on an unknown track starts from dry', () => {
    useArrangement.getState().initFrom(selLive, 10);
    useArrangement.getState().setTrackSend('ghost', 'delay', 0.4);
    expect(useArrangement.getState().trackSends.ghost).toEqual({ reverb: 0, delay: 0.4 });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/arrange/arrangementStore.test.ts`
Expected: FAIL — `trackSends` is undefined.

- [ ] **Step 3: Implement the store changes**

In `src/arrange/arrangementStore.ts`, add the import:

```ts
import { defaultSendsFor, DRY, type TrackSends } from '@/audio/effects';
```

Add to the state interface, next to `trackDurations`:

```ts
  /** Per-track aux send levels, keyed by track id. Runtime mix state, like trackDurations —
   *  deliberately not on ArrTrack, which describes what a track IS. */
  trackSends: Record<string, TrackSends>;
```

Add to the actions interface, next to `setTrackCeilingDb`:

```ts
  setTrackSend: (trackId: string, kind: 'reverb' | 'delay', value: number) => void;
```

In the initial state object, next to `trackDurations: {},`:

```ts
      trackSends: {},
```

In `initFrom`'s `set({...})`, next to `trackDurations: {},`:

```ts
          trackSends: defaultSendsFor(sel.tracks, config.audio.effects.defaultSends),
```

Add the action next to `setTrackCeilingDb`:

```ts
      setTrackSend: (trackId, kind, value) =>
        set((s) => {
          const cur = s.trackSends[trackId] ?? DRY;
          const v = Math.min(1, Math.max(0, value));
          if (cur[kind] === v) return {};
          return { trackSends: { ...s.trackSends, [trackId]: { ...cur, [kind]: v } } };
        }),
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/arrange/arrangementStore.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/arrange/arrangementStore.ts src/arrange/arrangementStore.test.ts
git commit -m "feat(effects): per-track send levels in the arrangement store"
```

---

### Task 5: Wire sends from store to engine

**Files:**
- Modify: `src/arrange/useLayer2Engine.ts`

**Interfaces:**
- Consumes: store `trackSends` (Task 4), `AudioEngine.setTrackSend` (Task 3)
- Produces: no new exports

- [ ] **Step 1: Feed sends into the initial specs**

In `src/arrange/useLayer2Engine.ts`, add the import:

```ts
import { DRY } from '@/audio/effects';
```

Add `effects` to the engine construction in the `useRef` initializer, after `changeRampMs`:

```ts
      effects: config.audio.effects,
```

Replace the `specs` mapping with:

```ts
    const specs: TrackAudioSpec[] = st.tracks.map((t) => ({
      id: t.id, path: t.sample.path, bytes: t.sample.bytes,
      volumeDb: t.ceilingDb, muted: false, playing: false, // loaded, not started; scheduler triggers from 0
      reverbSend: (st.trackSends[t.id] ?? DRY).reverb,
      delaySend: (st.trackSends[t.id] ?? DRY).delay,
    }));
```

- [ ] **Step 2: Diff sends in the subscription**

Next to the existing `ceilings` map, add:

```ts
    const sends = new Map(st.tracks.map((t) => [t.id, st.trackSends[t.id] ?? DRY]));
```

Inside the `arrangementStore.subscribe` callback, immediately after the existing ceiling loop's closing brace, add:

```ts
      // Aux sends. These ride the subscription, not trackKey — putting them in trackKey would
      // re-fetch and re-decode every sample on each slider movement.
      for (const t of s.tracks) {
        const next = s.trackSends[t.id] ?? DRY;
        const prev = sends.get(t.id) ?? DRY;
        if (prev.reverb !== next.reverb) engine.setTrackSend(t.id, 'reverb', next.reverb);
        if (prev.delay !== next.delay) engine.setTrackSend(t.id, 'delay', next.delay);
        sends.set(t.id, next);
      }
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run src/arrange/useLayer2Engine.test.ts src/`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/arrange/useLayer2Engine.ts
git commit -m "feat(effects): sync per-track sends from store to engine"
```

---

### Task 6: Send sliders in the remix track pool

After this task the feature is audible end-to-end in live playback. Export still lags until Task 9.

**Files:**
- Modify: `src/components/remix/TrackPoolRow.tsx`
- Modify: `src/components/remix/RemixView.tsx`
- Modify: `src/components/remix/TrackPoolRow.test.tsx`

**Interfaces:**
- Consumes: store `trackSends` / `setTrackSend` (Task 4), `TrackSends` (Task 1)
- Produces: `TrackPoolRow` gains props `sends: TrackSends` and `onSend: (kind: 'reverb' | 'delay', value: number) => void`

- [ ] **Step 1: Write the failing tests**

Append to `src/components/remix/TrackPoolRow.test.tsx`, matching the file's existing render helpers and imports:

```ts
  it('renders a slider for each send, at the current value', () => {
    render(
      <TrackPoolRow
        track={track} candidates={[]} picked={new Set()}
        sends={{ reverb: 0.2, delay: 0.1 }} onSend={() => {}}
      />,
    );
    expect((screen.getByLabelText('Reverb send') as HTMLInputElement).value).toBe('0.2');
    expect((screen.getByLabelText('Delay send') as HTMLInputElement).value).toBe('0.1');
  });

  it('reports the kind and the new value on change', () => {
    const onSend = vi.fn();
    render(
      <TrackPoolRow
        track={track} candidates={[]} picked={new Set()}
        sends={{ reverb: 0, delay: 0 }} onSend={onSend}
      />,
    );
    fireEvent.change(screen.getByLabelText('Reverb send'), { target: { value: '0.5' } });
    expect(onSend).toHaveBeenCalledWith('reverb', 0.5);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/remix/TrackPoolRow.test.tsx`
Expected: FAIL — no element labelled "Reverb send".

- [ ] **Step 3: Add the sliders**

In `src/components/remix/TrackPoolRow.tsx`, add the import:

```ts
import type { TrackSends } from '@/audio/effects';
```

Add above the component:

```ts
const SEND_LABEL: Record<'reverb' | 'delay', string> = { reverb: 'Rev', delay: 'Dly' };
const SEND_A11Y: Record<'reverb' | 'delay', string> = { reverb: 'Reverb send', delay: 'Delay send' };
```

Change the signature to:

```ts
export function TrackPoolRow({ track, candidates, picked, sends, onSend }: {
  track: ArrTrack;
  candidates: AuthoredRule[];
  picked: ReadonlySet<AuthoredRule>;
  sends: TrackSends;
  onSend: (kind: 'reverb' | 'delay', value: number) => void;
}) {
```

Change the wrapper's grid class from `grid-cols-[140px_1fr]` to `grid-cols-[140px_1fr_auto]`, then add this third column immediately before the wrapper's closing `</div>`:

```tsx
      <div className="flex items-center gap-3 pl-2">
        {(['reverb', 'delay'] as const).map((kind) => (
          <label key={kind} className="flex items-center gap-1 text-xs text-muted-foreground">
            {SEND_LABEL[kind]}
            <input
              type="range"
              aria-label={SEND_A11Y[kind]}
              min={0}
              max={1}
              step={0.01}
              value={sends[kind]}
              onChange={(e) => onSend(kind, Number(e.target.value))}
              className="h-1 w-16 cursor-pointer"
              style={{ accentColor: 'var(--accent-ink)' }}
            />
            <span className="w-7 tabular-nums text-right">{Math.round(sends[kind] * 100)}%</span>
          </label>
        ))}
      </div>
```

- [ ] **Step 4: Pass the props from `RemixView`**

In `src/components/remix/RemixView.tsx`, add near the other `useArrangement` selectors:

```ts
  const trackSends = useArrangement((s) => s.trackSends);
  const setTrackSend = useArrangement((s) => s.setTrackSend);
```

Add the import:

```ts
import { DRY } from '@/audio/effects';
```

At the `<TrackPoolRow ... />` usage (inside `tracks.map((t) => (...))`, around line 311), add the two props after `picked`:

```tsx
            <TrackPoolRow
              key={t.id}
              track={t}
              candidates={candidatesFor(t.category)}
              picked={pickedRules}
              sends={trackSends[t.id] ?? DRY}
              onSend={(kind, value) => setTrackSend(t.id, kind, value)}
            />
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/components/remix/`
Expected: PASS.

- [ ] **Step 6: Verify in the browser**

```bash
npm run dev
```

Open `/remix`, generate a mix, and play it. Confirm:
- Melody rows show Rev/Dly sliders at 20% / 12%; other rows at 0%.
- Melody phrase endings ring out instead of cutting.
- Dragging a slider changes the wet level smoothly, with no zipper noise and no audio dropout or reload.

- [ ] **Step 7: Commit**

```bash
git add src/components/remix/TrackPoolRow.tsx src/components/remix/TrackPoolRow.test.tsx src/components/remix/RemixView.tsx
git commit -m "feat(effects): reverb and delay send sliders in the remix track pool"
```

---

### Task 7: Effects in the offline module render

**Files:**
- Modify: `src/arrange/render/renderModuleWav.ts`

**Interfaces:**
- Consumes: `buildEffectBuses`, `tailSecFor`, `TrackSends`, `DRY` (Tasks 1–2)
- Produces: `renderModuleToChannels` / `renderModuleToWav` args gain optional `sends?: Record<string, TrackSends>`; both now return `moduleSeconds + tailSecFor(cfg.audio.effects)` of audio

- [ ] **Step 1: Build the buses and extend the window**

In `src/arrange/render/renderModuleWav.ts`, add the import:

```ts
import { buildEffectBuses, DRY, tailSecFor, type TrackSends } from '@/audio/effects';
```

Add to the args type of **both** `renderModuleToChannels` and `renderModuleToWav`, after `masterDb`:

```ts
    /** Per-track aux send levels, keyed by track id. Omitted or missing entries render dry. */
    sends?: Record<string, TrackSends>;
```

Replace the context construction (currently `const ctx = new OfflineAudioContext(2, Math.ceil(D * sr), sr);`) with:

```ts
  // Render past the timeline so reverb and delay tails are not truncated mid-decay. Regions are
  // clipped to the timeline (rule 4.3), so everything past D is pure tail.
  const tailSec = tailSecFor(cfg.audio.effects);
  const renderSec = D + tailSec;
  const ctx = new OfflineAudioContext(2, Math.ceil(renderSec * sr), sr);
```

After `master.connect(ctx.destination);`, add:

```ts
  const { reverbBus, delayBus } = buildEffectBuses(ctx, master, cfg.audio.effects);
```

- [ ] **Step 2: Connect each region's sends**

Inside the per-region `args.regions.map(async (r) => {...})`, immediately after `gain.connect(master);`:

```ts
      // Post-fade sends, mirroring the live graph: the send taps the region's own envelope gain.
      const send = args.sends?.[r.trackId] ?? DRY;
      if (send.reverb > 0) {
        const g = ctx.createGain();
        g.gain.value = send.reverb;
        gain.connect(g);
        g.connect(reverbBus);
      }
      if (send.delay > 0) {
        const g = ctx.createGain();
        g.gain.value = send.delay;
        gain.connect(g);
        g.connect(delayBus);
      }
```

- [ ] **Step 3: Fix the progress marks**

In the progress block, change the loop bound and divisor from `D` to `renderSec`:

```ts
  if (args.onProgress) {
    for (let s = 30; s < renderSec; s += 30) {
      const at = s;
      void ctx.suspend(at).then(() => {
        args.onProgress!(at / renderSec);
        void ctx.resume();
      });
    }
  }
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/arrange/render/ src/remix/`
Expected: PASS, except `renderSessionWav.test.ts`, which asserts exact output sample counts — Task 8 fixes it. If it fails here, leave it and proceed.

- [ ] **Step 5: Commit**

```bash
git add src/arrange/render/renderModuleWav.ts
git commit -m "feat(effects): render sends and tail in the offline module render"
```

---

### Task 8: Overlap-add for the chained session export

Without this, each module's tail is inserted *between* modules, adding `n × tailSec` of decay-then-silence and pushing every later module late.

**Files:**
- Modify: `src/arrange/render/renderSessionWav.ts`
- Modify: `src/arrange/render/renderSessionWav.test.ts`

**Interfaces:**
- Consumes: `tailSecFor` (Task 1), the longer `renderModuleToChannels` output (Task 7)
- Produces: `renderSessionToWav` args gain optional `sends?: Record<string, TrackSends>`; output length is `order.length × moduleSeconds + tailSec`

- [ ] **Step 1: Rewrite the test around overlap-add**

The existing test mocks `renderModuleToChannels` to return a fixed **4 samples per module**, independent of `moduleSeconds`, and asserts `toHaveLength(12)` for 3 modules. That mock no longer matches the contract: a module is now `moduleSeconds + tailSec` long, and the hop between modules is `moduleSeconds`. Left as-is, the new code would allocate `3 × 600s × 44100` frames (~318 MB per channel) and assert nothing useful.

Rewrite `src/arrange/render/renderSessionWav.test.ts` so the mock honours the contract at a tiny scale. Replace the mock block and the `describe` body with:

```ts
import { describe, it, expect, vi } from 'vitest';
import type { ArrTrack, Mode, TemplateRegion } from '@/arrange/types';
import { config as baseConfig, type EcosonicConfig } from '@/config';

// A tiny config: 4-"second" modules at 1 sample/sec, and a 2-second effect tail. Keeps the
// overlap arithmetic small enough to assert sample by sample.
const HOP = 4;
const TAIL = 2;
const cfg: EcosonicConfig = {
  ...baseConfig,
  layerTwo: { ...baseConfig.layerTwo, moduleSeconds: HOP },
  audio: {
    ...baseConfig.audio,
    effects: {
      ...baseConfig.audio.effects,
      reverb: { ...baseConfig.audio.effects.reverb, seconds: TAIL },
      delay: { ...baseConfig.audio.effects.delay, timeSec: 0.1, feedback: 0 },
    },
  },
};

// Each mode returns HOP + TAIL samples of a per-mode marker, mirroring the real renderer, which
// now renders moduleSeconds + tailSec. The last TAIL samples are the part that must overlap.
vi.mock('@/arrange/render/renderModuleWav', () => ({
  renderModuleToChannels: vi.fn(async (args: { regions: { trackId: string }[] }) => {
    const marker = args.regions[0].trackId.charCodeAt(0); // 65/66/67 for A/B/C
    return [Float32Array.from(Array(4 + 2).fill(marker))];
  }),
}));

const encodeSpy = vi.fn((_channels: Float32Array[], _sampleRate: number) => new ArrayBuffer(8));
vi.mock('@/audio/wavEncode', () => ({
  encodeWavPcm16: (channels: Float32Array[], sampleRate: number) => encodeSpy(channels, sampleRate),
}));

import { renderSessionToWav } from '@/arrange/render/renderSessionWav';

const tracks: ArrTrack[] = [];
const order: Mode[] = ['INTRODUCTION', 'DEEP_RELAXATION', 'RETURN'];
const reg = (id: string): TemplateRegion[] => [{ trackId: id, enterSec: 0, exitSec: 4, fadeInSec: 0, fadeOutSec: 0 }];
const regionsByMode = {
  INTRODUCTION: reg('A'), DEEP_RELAXATION: reg('B'), RETURN: reg('C'),
} as Record<Mode, TemplateRegion[]>;

describe('renderSessionToWav', () => {
  it('overlap-adds each module tail onto the next module, in order', async () => {
    encodeSpy.mockClear();
    const blob = await renderSessionToWav(
      { tracks, regionsByMode, order, masterDb: 0, sampleRate: 1 }, cfg,
    );
    expect(blob.type).toBe('audio/wav');
    const [channels, sr] = encodeSpy.mock.calls[0];
    expect(sr).toBe(1);
    // 3 modules on a 4-sample grid, plus the last module's 2-sample tail.
    expect(channels[0]).toHaveLength(HOP * order.length + TAIL);
    // A at 0..5, B at 4..9, C at 8..13 — the overlaps sum.
    expect([...channels[0]]).toEqual([
      65, 65, 65, 65,   // A alone
      131, 131,         // A tail + B head  (65 + 66)
      66, 66,           // B alone
      133, 133,         // B tail + C head  (66 + 67)
      67, 67,           // C alone
      67, 67,           // C tail, past the grid
    ]);
  });

  it('reports progress ending at 1', async () => {
    const seen: number[] = [];
    await renderSessionToWav(
      { tracks, regionsByMode, order, masterDb: 0, sampleRate: 1, onProgress: (f) => seen.push(f) },
      cfg,
    );
    expect(seen[seen.length - 1]).toBe(1);
  });
});
```

Both tests must pass `cfg` and `sampleRate: 1` — with the default config the allocation is ~318 MB per channel.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/arrange/render/renderSessionWav.test.ts`
Expected: FAIL — the current code concatenates by the full rendered length, giving 18 samples (`[65×6, 66×6, 67×6]`) instead of 14 with summed overlaps.

- [ ] **Step 3: Implement overlap-add**

In `src/arrange/render/renderSessionWav.ts`, add the import:

```ts
import { tailSecFor, type TrackSends } from '@/audio/effects';
```

Add to the args type after `masterDb`:

```ts
    sends?: Record<string, TrackSends>;
```

Pass it through to `renderModuleToChannels` alongside `masterDb`:

```ts
        sends: args.sends,
```

Replace the whole concatenation block (from `const numChannels = ...` through the `for (const modChannels of perModule)` loop) with:

```ts
  const numChannels = perModule[0]?.length ?? 2;
  // Overlap-add, not concatenate: each module is rendered moduleSeconds + tailSec long, but the
  // NEXT module starts at moduleSeconds. Advancing by the rendered length would insert every
  // module's tail as a gap. Summing lets module N's tail ring over module N+1's opening, which
  // is what live playback does — the context runs continuously across advanceSession().
  const hop = Math.round(D * sr);
  const tailFrames = Math.ceil(tailSecFor(cfg.audio.effects) * sr);
  const totalLen = hop * n + tailFrames;
  const channels = Array.from({ length: numChannels }, () => new Float32Array(totalLen));
  let offset = 0;
  for (const modChannels of perModule) {
    for (let c = 0; c < numChannels; c++) {
      const src = modChannels[c];
      if (!src) continue;
      const dst = channels[c];
      const count = Math.min(src.length, dst.length - offset);
      for (let i = 0; i < count; i++) dst[offset + i] += src[i];
    }
    offset += hop;
  }
```

Add `D` near the top of the function, next to `const sr`:

```ts
  const D = cfg.layerTwo.moduleSeconds;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/arrange/render/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/arrange/render/renderSessionWav.ts src/arrange/render/renderSessionWav.test.ts
git commit -m "fix(effects): overlap-add chained session export so tails bridge modules"
```

---

### Task 9: Thread sends through the exporters

**Files:**
- Modify: `src/remix/renderFreeMix.ts`
- Modify: `src/remix/renderFreeMix.test.ts`
- Modify: `src/components/remix/RemixView.tsx`
- Modify: `src/components/layer2/ArrangeScreen.tsx`

**Interfaces:**
- Consumes: `tailSecFor`, `TrackSends` (Task 1); the render args from Tasks 7–8
- Produces: `exportFreeMixWav` args gain `sends?: Record<string, TrackSends>`; `estimatedWavBytes(totalSec)` accounts for the tail

- [ ] **Step 1: Write the failing test**

Append to `src/remix/renderFreeMix.test.ts`:

```ts
  it('passes sends through to the module renderer', async () => {
    const sends = { a: { reverb: 0.5, delay: 0.1 } };
    await exportFreeMixWav({ tracks: [], regions: [], totalSec: 1800, masterDb: 0, sends });
    const mock = renderModuleToWav as unknown as { mock: { calls: unknown[][] } };
    expect((mock.mock.calls[0][0] as { sends?: unknown }).sends).toEqual(sends);
  });

  it('estimates the tail into the file size', () => {
    expect(estimatedWavBytes(100)).toBeGreaterThan(Math.round(100 * 44100 * 2 * 2) + 44);
  });
```

Add `estimatedWavBytes` to the file's import from `./renderFreeMix`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/remix/renderFreeMix.test.ts`
Expected: FAIL — `sends` is undefined on the forwarded args.

- [ ] **Step 3: Thread sends and fix the size estimate**

In `src/remix/renderFreeMix.ts`, add the import:

```ts
import { tailSecFor, type TrackSends } from '@/audio/effects';
```

Add to the args type after `masterDb: number;`:

```ts
  /** Per-track aux send levels, keyed by track id. */
  sends?: Record<string, TrackSends>;
```

Add to the object passed to `renderModuleToWav`, after `masterDb`:

```ts
      sends: args.sends,
```

Replace `estimatedWavBytes` with:

```ts
/** Rough size of the finished 16-bit stereo WAV, for warning before a long render. Includes the
 *  effect tail the renderer appends past the timeline. */
export function estimatedWavBytes(totalSec: number, sampleRate = 44100): number {
  const withTail = totalSec + tailSecFor(config.audio.effects);
  return Math.round(withTail * sampleRate * 2 * 2) + 44;
}
```

- [ ] **Step 4: Pass sends from `RemixView`**

In `src/components/remix/RemixView.tsx`, in `onExport`, add `sends` to the `exportFreeMixWav` call:

```tsx
      const blob = await exportFreeMixWav({
        tracks: audible, regions: audibleRegions, totalSec, masterDb, sends: trackSends,
        onProgress: setRenderPct,
      });
```

`trackSends` is already selected in Task 6 — reuse it.

- [ ] **Step 5: Pass sends from `ArrangeScreen`**

In `src/components/layer2/ArrangeScreen.tsx`, add a selector alongside the existing `useArrangement` reads:

```ts
  const trackSends = useArrangement((s) => s.trackSends);
```

Add `sends: trackSends,` to the args object of **both** the `renderModuleToWav` call (~line 75) and the `renderSessionToWav` call (~line 93).

- [ ] **Step 6: Run the full suite**

Run: `npx vitest run src/`
Expected: PASS, all green.

- [ ] **Step 7: Verify exports in the browser**

```bash
npm run dev
```

On `/remix`: export a mix and confirm the WAV is ~`tailSec` longer than the timeline, the melody tails are present, and the ending decays rather than cutting. On the Layer Two arrange screen: export a chained session and confirm module boundaries have no silent gap and no late entries.

- [ ] **Step 8: Commit**

```bash
git add src/remix/renderFreeMix.ts src/remix/renderFreeMix.test.ts src/components/remix/RemixView.tsx src/components/layer2/ArrangeScreen.tsx
git commit -m "feat(effects): thread per-track sends through both exporters"
```

---

### Task 10: Documentation

**Files:**
- Modify: `docs/SPEC.md`
- Modify: `docs/remix-rules.md`

- [ ] **Step 1: Update `docs/SPEC.md`**

In §10, remove the "No per-track effects model." limitation line. Add to the audio section a short paragraph:

```markdown
Each track has two aux sends, reverb and delay, feeding chains shared across the whole engine
(one convolver, one delay line). Sends tap the track's gain post-fade, so a stopped track's tail
rings on. Levels are seeded per category from `audio.effects.defaultSends` — MELODY is wet by
default, everything else dry — and are adjustable per track in the remix track pool.
```

- [ ] **Step 2: Update `docs/remix-rules.md`**

Add a new numbered section following the file's existing style:

```markdown
## N. Effects

N.1 Each track has a reverb send and a delay send, 0–100%. MELODY starts wet
    (reverb 20%, delay 12%); every other category starts dry.

N.2 Sends are post-fade — a phrase that ends still rings out, which is what
    smooths the gap between phrases that rule 5.3 releases and re-triggers.

N.3 Sends are runtime mix state. They are not saved with an arrangement, the
    same as per-track volume.

N.4 An export runs past the end of the timeline by the effect tail length, so
    the final decay is complete rather than cut. An exported file is therefore
    slightly longer than its timeline.

N.5 Effects do not smooth the loop seams of rule 5.2 — a tail cannot bridge a
    seam in a signal that never stopped.

N.6 "Export mirrors playback" (rule 5.5) means musically equivalent, not
    byte-identical. Live triggers land on animation-frame boundaries while the
    offline renderer schedules sample-exactly, and live playback loops where an
    export is a single linear pass.
```

Renumber to fit the file's existing sequence.

- [ ] **Step 3: Run the full suite one last time**

Run: `npx vitest run src/`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add docs/SPEC.md docs/remix-rules.md
git commit -m "docs(effects): document per-track sends and export tail"
```

---

## Self-Review Notes

**Spec coverage:** every §-numbered spec section maps to a task — §3/§4 → Tasks 1–2, §5 → Tasks 1/3/4, §6 → Tasks 5/7/8/9, §7 → Task 6, §8 → tests within each task, §10 → Task 10.

**Deliberately deferred:** loop-seam smoothing (spec §2 non-goal), send persistence (spec §9), Layer One effects UI (spec §9). The buses exist in every `AudioEngine`, so Layer One has the capability with zero sends and no UI.

**Watch for:** summing overlapping tails in Task 8 can exceed 1.0 where a loud module ending meets a loud module opening; there is no limiter and `encodeWavPcm16` clamps. Listen for it at the default send levels during Task 9's browser check.

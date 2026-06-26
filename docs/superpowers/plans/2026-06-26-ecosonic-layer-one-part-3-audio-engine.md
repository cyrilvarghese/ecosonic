# ECOSONIC Layer One — Part 3: Audio Engine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make sound. A hybrid Web Audio engine that loads each track (decode small / stream large), loops and mixes them, and exposes per-track + global transport — wired to the store via a sync controller.

**Architecture:** `chooseSourceKind` (pure) decides buffer-vs-stream by byte size. `Layer` wraps one track's nodes (`source → gain → master`), handling load, loop, gain ramps, mute, per-track start/stop with phase-preserving offset, and media suspend/resume. `AudioEngine` owns the `AudioContext`, master gain, a passive `AnalyserNode`, and a map of `Layer`s; it reconciles a track-spec list and drives global play/pause via `ctx.suspend()/resume()`. `useAudioEngine` subscribes to the Zustand store and diffs state into engine calls.

**Tech Stack:** TypeScript, Web Audio API (no audio library), React (hook + store subscription), Vitest (pure-fn only).

**Part:** 3 of 5. Depends on Parts 1–2 (`@/samples`, `@/audio/dsp`, `@/config`, `@/session/appStore`, `@/types`). Next: Part 4 (UI), where the engine is verified end-to-end in the browser.

## Global Constraints

- All Part 1–2 constraints apply (config-driven; no magic numbers).
- **Hybrid threshold** from `config.audio.hybridThresholdBytes`; **ramps** from `config.audio.volume.muteRampMs`/`changeRampMs`; **floor** from `config.audio.volume.minDb`.
- **Mute ≠ stop:** muting ramps the layer's gain to 0 but the source keeps running (stays phase-locked). Only per-track Play/Pause and global pause actually stop/suspend audio.
- **Global pause preserves phase:** use `AudioContext.suspend()/resume()`; additionally `pause()`/`play()` streamed `<audio>` elements (they keep their own clock).
- **AudioContext is created lazily** and only on a user gesture path (first `play()`), per browser autoplay policy.
- **Testing reality:** jsdom has no Web Audio. Unit-test only the pure `chooseSourceKind`. `Layer`/`AudioEngine`/`useAudioEngine` are type-checked here (`tsc --noEmit`) and verified **at runtime in Part 4**. Do not write fake audio tests.

---

### Task 8: Source-kind decision, Layer, and AudioEngine

**Files:**
- Create: `src/audio/sourceKind.ts`
- Test: `src/audio/sourceKind.test.ts`
- Create: `src/audio/Layer.ts`
- Create: `src/audio/AudioEngine.ts`

**Interfaces:**
- Consumes: `@/samples` (`resolveSampleUrl`), `@/audio/dsp` (`dbToGain`).
- Produces:
  - `type SourceKind = 'buffer' | 'stream'`; `function chooseSourceKind(bytes: number, thresholdBytes: number): SourceKind`
  - `class Layer` with: `readonly id`, `readonly path`, `readonly kind`; `load(): Promise<void>`; `setWantPlaying(want: boolean, running: boolean, rampMs: number)`; `resumeForGlobal(rampMs: number)`; `suspendMedia()`; `setMutedInitial(m: boolean)`; `mute(rampMs)`, `unmute(rampMs)`; `setVolumeDb(db, rampMs)`; `dispose()`.
  - `interface EngineConfig { thresholdBytes; minDb; muteRampMs; changeRampMs }`
  - `interface TrackAudioSpec { id; path; bytes; volumeDb; muted; playing }`
  - `class AudioEngine` with: `getAnalyser(): AnalyserNode | null`; `setTracks(specs): Promise<void>`; `setTrackVolume(id, db)`; `setMute(id, muted)`; `setTrackPlaying(id, playing)`; `setMasterVolume(db)`; `play(): Promise<void>`; `pause()`; `clear()`.

- [ ] **Step 1: Write the failing test** — `src/audio/sourceKind.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { chooseSourceKind } from '@/audio/sourceKind';

describe('chooseSourceKind', () => {
  it('decodes files below the threshold', () => {
    expect(chooseSourceKind(1_000_000, 8_388_608)).toBe('buffer');
  });
  it('streams files at or above the threshold', () => {
    expect(chooseSourceKind(8_388_608, 8_388_608)).toBe('stream');
    expect(chooseSourceKind(170_000_000, 8_388_608)).toBe('stream');
  });
});
```

- [ ] **Step 2: Run it to verify failure**

Run: `npx vitest run src/audio/sourceKind.test.ts`
Expected: FAIL — `@/audio/sourceKind` not found.

- [ ] **Step 3: Implement `src/audio/sourceKind.ts`**

```ts
export type SourceKind = 'buffer' | 'stream';

/** Small files decode fully (gapless); large files stream (low memory). */
export function chooseSourceKind(bytes: number, thresholdBytes: number): SourceKind {
  return bytes < thresholdBytes ? 'buffer' : 'stream';
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/audio/sourceKind.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Implement `src/audio/Layer.ts`**

```ts
import { resolveSampleUrl } from '@/samples';
import { dbToGain } from '@/audio/dsp';
import { chooseSourceKind, type SourceKind } from '@/audio/sourceKind';

export interface LayerInit {
  id: string;
  path: string;
  bytes: number;
  thresholdBytes: number;
  volumeDb: number;
  minDb: number;
}

type PitchedAudio = HTMLAudioElement & { preservesPitch?: boolean };

export class Layer {
  readonly id: string;
  readonly path: string;
  readonly kind: SourceKind;

  private ctx: AudioContext;
  private gain: GainNode;
  private url: string;
  private minDb: number;

  private buffer: AudioBuffer | null = null;
  private bufferSource: AudioBufferSourceNode | null = null;
  private audioEl: PitchedAudio | null = null;
  private mediaNode: MediaElementAudioSourceNode | null = null;

  private targetGain: number;
  private startedAt = 0;
  private offset = 0;
  private started = false;
  private wantPlaying = false;
  private muted = false;

  constructor(ctx: AudioContext, master: GainNode, init: LayerInit) {
    this.ctx = ctx;
    this.id = init.id;
    this.path = init.path;
    this.url = resolveSampleUrl(init.path);
    this.minDb = init.minDb;
    this.kind = chooseSourceKind(init.bytes, init.thresholdBytes);
    this.targetGain = dbToGain(init.volumeDb, init.minDb);
    this.gain = ctx.createGain();
    this.gain.gain.value = 0; // silent until started
    this.gain.connect(master);
  }

  async load(): Promise<void> {
    if (this.kind === 'buffer') {
      const res = await fetch(this.url);
      const arr = await res.arrayBuffer();
      this.buffer = await this.ctx.decodeAudioData(arr);
    } else {
      const el = new Audio(this.url) as PitchedAudio;
      el.loop = true;
      el.preload = 'auto';
      el.preservesPitch = false;
      this.audioEl = el;
      this.mediaNode = this.ctx.createMediaElementSource(el);
      this.mediaNode.connect(this.gain);
    }
  }

  setMutedInitial(m: boolean) { this.muted = m; }

  setWantPlaying(want: boolean, running: boolean, rampMs: number) {
    this.wantPlaying = want;
    if (running && want && !this.started) this.startSource(rampMs);
    else if (!want && this.started) this.stopSource(rampMs);
  }

  /** Called on global play(): ensure desired sources are running, then ramp gain in. */
  resumeForGlobal(rampMs: number) {
    if (this.wantPlaying && !this.started) this.startSource(rampMs);
    else if (this.kind === 'stream' && this.started) void this.audioEl?.play();
    this.applyGain(rampMs);
  }

  /** Called on global pause(): pause streamed media (buffers are frozen by ctx.suspend). */
  suspendMedia() { if (this.kind === 'stream') this.audioEl?.pause(); }

  mute(rampMs: number) { this.muted = true; this.rampTo(0, rampMs); }
  unmute(rampMs: number) { this.muted = false; if (this.started) this.rampTo(this.targetGain, rampMs); }

  setVolumeDb(db: number, rampMs: number) {
    this.targetGain = dbToGain(db, this.minDb);
    if (this.started && !this.muted) this.rampTo(this.targetGain, rampMs);
  }

  dispose() {
    try { this.bufferSource?.stop(); } catch { /* already stopped */ }
    this.bufferSource?.disconnect();
    this.mediaNode?.disconnect();
    this.gain.disconnect();
    if (this.audioEl) { this.audioEl.pause(); this.audioEl.src = ''; }
  }

  private buildBufferSource(): AudioBufferSourceNode {
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffer;
    src.loop = true;
    src.connect(this.gain);
    return src;
  }

  private startSource(rampMs: number) {
    if (this.kind === 'buffer' && this.buffer) {
      const src = this.buildBufferSource();
      src.start(0, this.offset % this.buffer.duration);
      this.bufferSource = src;
      this.startedAt = this.ctx.currentTime;
    } else {
      void this.audioEl?.play();
    }
    this.started = true;
    this.applyGain(rampMs);
  }

  private stopSource(rampMs: number) {
    this.rampTo(0, rampMs);
    if (this.kind === 'buffer' && this.bufferSource && this.buffer) {
      const elapsed = this.ctx.currentTime - this.startedAt;
      this.offset = (this.offset + elapsed) % this.buffer.duration;
      const src = this.bufferSource;
      this.bufferSource = null;
      setTimeout(() => { try { src.stop(); } catch { /* noop */ } }, rampMs + 20);
    } else {
      this.audioEl?.pause();
    }
    this.started = false;
  }

  private applyGain(rampMs: number) { this.rampTo(this.muted ? 0 : this.targetGain, rampMs); }

  private rampTo(value: number, rampMs: number) {
    const now = this.ctx.currentTime;
    const g = this.gain.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(value, now + Math.max(0.001, rampMs / 1000));
  }
}
```

- [ ] **Step 6: Implement `src/audio/AudioEngine.ts`**

```ts
import { Layer } from '@/audio/Layer';

export interface EngineConfig {
  thresholdBytes: number;
  minDb: number;
  muteRampMs: number;
  changeRampMs: number;
}

export interface TrackAudioSpec {
  id: string;
  path: string;
  bytes: number;
  volumeDb: number;
  muted: boolean;
  playing: boolean;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private layers = new Map<string, Layer>();
  private running = false;
  private masterDb = 0;

  constructor(private cfg: EngineConfig) {}

  getAnalyser(): AnalyserNode | null { return this.analyser; }

  setMasterVolume(db: number) { this.masterDb = db; this.applyMaster(); }

  async setTracks(specs: TrackAudioSpec[]): Promise<void> {
    this.ensure();
    const ids = new Set(specs.map((s) => s.id));

    for (const [id, layer] of this.layers) {
      if (!ids.has(id)) { layer.dispose(); this.layers.delete(id); }
    }

    for (const s of specs) {
      const existing = this.layers.get(s.id);
      if (existing && existing.path === s.path) {
        if (s.muted) existing.mute(this.cfg.muteRampMs); else existing.unmute(this.cfg.muteRampMs);
        existing.setVolumeDb(s.volumeDb, this.cfg.changeRampMs);
        existing.setWantPlaying(s.playing, this.running, this.cfg.muteRampMs);
        continue;
      }
      if (existing) { existing.dispose(); this.layers.delete(s.id); }
      const layer = new Layer(this.ctx!, this.master!, {
        id: s.id, path: s.path, bytes: s.bytes,
        thresholdBytes: this.cfg.thresholdBytes, volumeDb: s.volumeDb, minDb: this.cfg.minDb,
      });
      this.layers.set(s.id, layer);
      await layer.load();
      layer.setMutedInitial(s.muted);
      layer.setWantPlaying(s.playing, this.running, this.cfg.muteRampMs);
    }
  }

  setTrackVolume(id: string, db: number) { this.layers.get(id)?.setVolumeDb(db, this.cfg.changeRampMs); }
  setMute(id: string, muted: boolean) {
    const l = this.layers.get(id);
    if (!l) return;
    if (muted) l.mute(this.cfg.muteRampMs); else l.unmute(this.cfg.muteRampMs);
  }
  setTrackPlaying(id: string, playing: boolean) {
    this.layers.get(id)?.setWantPlaying(playing, this.running, this.cfg.muteRampMs);
  }

  async play(): Promise<void> {
    this.ensure();
    this.running = true;
    await this.ctx!.resume();
    for (const l of this.layers.values()) l.resumeForGlobal(this.cfg.muteRampMs);
  }

  pause(): void {
    if (!this.ctx) return;
    this.running = false;
    for (const l of this.layers.values()) l.suspendMedia();
    void this.ctx.suspend();
  }

  clear(): void {
    for (const l of this.layers.values()) l.dispose();
    this.layers.clear();
    if (this.ctx) { void this.ctx.close(); this.ctx = null; this.master = null; this.analyser = null; }
    this.running = false;
  }

  private ensure() {
    if (this.ctx) return;
    const ctx = new AudioContext();
    const master = ctx.createGain();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    master.connect(analyser);
    analyser.connect(ctx.destination);
    this.ctx = ctx;
    this.master = master;
    this.analyser = analyser;
    this.applyMaster();
  }

  private applyMaster() {
    if (this.master) {
      this.master.gain.value = this.masterDb <= this.cfg.minDb ? 0 : Math.pow(10, this.masterDb / 20);
    }
  }
}
```

- [ ] **Step 7: Type-check and run the suite**

Run: `npx tsc --noEmit`
Expected: no errors.
Run: `npm test`
Expected: PASS (pure-fn tests across Parts 1–3).

- [ ] **Step 8: Commit**

```powershell
git add src/audio/sourceKind.ts src/audio/sourceKind.test.ts src/audio/Layer.ts src/audio/AudioEngine.ts
git commit -m "feat: hybrid Web Audio engine (Layer + AudioEngine)"
```

---

### Task 9: Audio sync controller (store → engine)

**Files:**
- Create: `src/audio/useAudioEngine.ts`

**Interfaces:**
- Consumes: `@/audio/AudioEngine` (`AudioEngine`, `TrackAudioSpec`), `@/session/appStore` (`sessionStore`), `@/config` (`config`), `@/types` (`Track`).
- Produces: `function useAudioEngine(): AudioEngine` — a stable engine instance kept in sync with the store; React components use its `getAnalyser()` for the visualizer.

- [ ] **Step 1: Implement `src/audio/useAudioEngine.ts`**

```ts
'use client';
import { useEffect, useRef } from 'react';
import { AudioEngine, type TrackAudioSpec } from '@/audio/AudioEngine';
import { sessionStore } from '@/session/appStore';
import type { SessionState } from '@/session/sessionStore';
import { config } from '@/config';
import type { Track } from '@/types';

function toSpec(t: Track): TrackAudioSpec {
  return {
    id: t.id, path: t.sample.path, bytes: t.sample.bytes,
    volumeDb: t.volumeDb, muted: t.muted, playing: t.playing,
  };
}

async function reconcile(engine: AudioEngine, prev: SessionState | undefined, next: SessionState) {
  const p = prev?.project;
  const n = next.project;

  const membershipChanged =
    !p ||
    p.tracks.length !== n.tracks.length ||
    n.tracks.some((t, i) => p.tracks[i]?.id !== t.id || p.tracks[i]?.sample.path !== t.sample.path);

  if (membershipChanged) {
    await engine.setTracks(n.tracks.map(toSpec));
  } else {
    for (const t of n.tracks) {
      const before = p.tracks.find((x) => x.id === t.id);
      if (!before || before.volumeDb !== t.volumeDb) engine.setTrackVolume(t.id, t.volumeDb);
      if (!before || before.muted !== t.muted) engine.setMute(t.id, t.muted);
      if (!before || before.playing !== t.playing) engine.setTrackPlaying(t.id, t.playing);
    }
  }

  if (!p || p.masterVolumeDb !== n.masterVolumeDb) engine.setMasterVolume(n.masterVolumeDb);

  if (!prev || prev.globalPlaying !== next.globalPlaying) {
    if (next.globalPlaying) await engine.play();
    else engine.pause();
  }
}

export function useAudioEngine(): AudioEngine {
  const ref = useRef<AudioEngine | null>(null);
  if (!ref.current) {
    ref.current = new AudioEngine({
      thresholdBytes: config.audio.hybridThresholdBytes,
      minDb: config.audio.volume.minDb,
      muteRampMs: config.audio.volume.muteRampMs,
      changeRampMs: config.audio.volume.changeRampMs,
    });
  }
  const engine = ref.current;

  useEffect(() => {
    let prev = sessionStore.getState();
    void reconcile(engine, undefined, prev);
    const unsub = sessionStore.subscribe((state) => {
      const before = prev;
      prev = state;
      void reconcile(engine, before, state);
    });
    return () => { unsub(); engine.clear(); };
  }, [engine]);

  return engine;
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```powershell
git add src/audio/useAudioEngine.ts
git commit -m "feat: audio sync controller bridging store and engine"
```

> **Runtime verification of Tasks 8–9 happens in Part 4**, once a screen mounts `useAudioEngine` and the transport toggles `globalPlaying`. Expected at that point: pressing Global Play starts all non-paused tracks looping and mixed; muting silences a track while it stays in sync; per-track pause stops just that track; master volume scales everything; global pause freezes and resumes in phase.

---

## Part 3 self-review

- **Spec coverage:** hybrid decode/stream by size ✓ (T8 `chooseSourceKind`/`Layer.load`); loop + mix via shared master ✓ (T8); per-track volume(dB)/mute(keep-running)/play-pause(phase offset) ✓ (`Layer`); master volume ✓ (`AudioEngine.applyMaster`); global play/pause via `suspend/resume` + media pause ✓ (`play`/`pause`); passive analyser for visualizer ✓ (`getAnalyser`); tuning deferred (model only) ✓.
- **Placeholders:** none — full class code; runtime checks explicitly deferred to Part 4 with concrete expected behavior (no fake audio tests).
- **Type consistency:** `TrackAudioSpec` produced by `AudioEngine`, consumed by `toSpec` in the controller; `SessionState` imported from `sessionStore`; `Layer` method names (`setWantPlaying`, `resumeForGlobal`, `suspendMedia`, `setMutedInitial`) match `AudioEngine` call sites.
- **Boundary with Part 4:** UI mounts `useAudioEngine()` once (in the builder screen) and reads `getAnalyser()` for the p5 visualizer; all control changes flow through store actions → `reconcile` → engine.

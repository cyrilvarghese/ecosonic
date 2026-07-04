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
  private analyser: AnalyserNode;
  private url: string;
  private minDb: number;

  private buffer: AudioBuffer | null = null;
  private bufferSource: AudioBufferSourceNode | null = null;
  private audioEl: PitchedAudio | null = null;
  private mediaNode: MediaElementAudioSourceNode | null = null;
  private objectUrl: string | null = null;

  private targetGain: number;
  private startedAt = 0;
  private offset = 0;
  private started = false;
  private wantPlaying = false;
  private muted = false;
  private envelope = 1; // Layer Two 0..1 modulation on top of the ceiling (targetGain)

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
    // Passive per-lane tap for visualization (no onward connection, does not affect audio).
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.gain.connect(this.analyser);
  }

  /** Passive analyser tapping this layer's output, for per-lane visualization. */
  getAnalyser(): AnalyserNode { return this.analyser; }

  /** Current loop position and loop duration (seconds), or null if not yet known. */
  getProgress(): { position: number; duration: number } | null {
    if (this.kind === 'buffer') {
      if (!this.buffer) return null;
      const duration = this.buffer.duration;
      const base = this.started ? this.offset + (this.ctx.currentTime - this.startedAt) : this.offset;
      return { position: ((base % duration) + duration) % duration, duration };
    }
    const el = this.audioEl;
    if (!el || !Number.isFinite(el.duration) || el.duration <= 0) return null;
    return { position: el.currentTime % el.duration, duration: el.duration };
  }

  async load(): Promise<void> {
    if (this.kind === 'buffer') {
      const res = await fetch(this.url);
      const arr = await res.arrayBuffer();
      this.buffer = await this.ctx.decodeAudioData(arr);
    } else {
      // Download the whole file once into an in-memory Blob and play from an object
      // URL. This releases the HTTP connection after the fetch, so many large loops
      // can play at once without hitting the browser's per-origin connection limit
      // (which stalled streamed <audio> elements beyond the ~6th). Memory stays ~1x
      // the file size (vs ~2x for decoded PCM).
      const res = await fetch(this.url);
      const blob = await res.blob();
      this.objectUrl = URL.createObjectURL(blob);
      const el = new Audio(this.objectUrl) as PitchedAudio;
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
  unmute(rampMs: number) { this.muted = false; if (this.started) this.rampTo(this.effectiveGain(), rampMs); }

  setVolumeDb(db: number, rampMs: number) {
    this.targetGain = dbToGain(db, this.minDb);
    if (this.started && !this.muted) this.rampTo(this.effectiveGain(), rampMs);
  }

  /** Layer Two: modulate the ceiling gain by a 0..1 envelope scalar. */
  setEnvelope(scalar: number, rampMs: number) {
    this.envelope = Math.min(1, Math.max(0, scalar));
    if (this.started && !this.muted) this.rampTo(this.effectiveGain(), rampMs);
  }

  /** Layer Two: (re)start the sample from position 0 so its baked fade-in plays. Loops
   *  (short samples repeat to fill the clip; long ones get cut when release() is called). */
  trigger() {
    if (this.kind === 'buffer') {
      if (this.bufferSource) { try { this.bufferSource.stop(); } catch { /* noop */ } this.bufferSource = null; }
      if (!this.buffer) return;
      const src = this.buildBufferSource(); // loop = true
      src.start(0, 0);
      this.bufferSource = src;
      this.startedAt = this.ctx.currentTime;
      this.offset = 0;
    } else if (this.audioEl) {
      try { this.audioEl.currentTime = 0; } catch { /* not seekable yet */ }
      this.audioEl.loop = true;
      void this.audioEl.play();
    }
    this.started = true;
    this.rampTo(this.targetGain, 8); // sample starts at ~0 amplitude (baked fade-in) → no click
  }

  /** Layer Two: stop playback with a short anti-click ramp (no musical fade — baked in). */
  release(rampMs: number) {
    this.rampTo(0, rampMs);
    if (this.kind === 'buffer' && this.bufferSource) {
      const src = this.bufferSource;
      this.bufferSource = null;
      setTimeout(() => { try { src.stop(); } catch { /* noop */ } }, rampMs + 30);
    } else if (this.audioEl) {
      setTimeout(() => this.audioEl?.pause(), rampMs + 30);
    }
    this.started = false;
  }

  dispose() {
    try { this.bufferSource?.stop(); } catch { /* already stopped */ }
    this.bufferSource?.disconnect();
    this.mediaNode?.disconnect();
    this.analyser.disconnect();
    this.gain.disconnect();
    if (this.audioEl) { this.audioEl.pause(); this.audioEl.src = ''; }
    if (this.objectUrl) { URL.revokeObjectURL(this.objectUrl); this.objectUrl = null; }
    if (this.objectUrl) { URL.revokeObjectURL(this.objectUrl); this.objectUrl = null; }
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

  private effectiveGain(): number { return this.muted ? 0 : this.targetGain * this.envelope; }

  private applyGain(rampMs: number) { this.rampTo(this.effectiveGain(), rampMs); }

  private rampTo(value: number, rampMs: number) {
    const now = this.ctx.currentTime;
    const g = this.gain.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(value, now + Math.max(0.001, rampMs / 1000));
  }
}

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

import { Layer } from '@/audio/Layer';
import { buildEffectBuses, type EffectBuses, type EffectsConfig } from '@/audio/effects';

export interface EngineConfig {
  thresholdBytes: number;
  minDb: number;
  muteRampMs: number;
  changeRampMs: number;
  effects: EffectsConfig;
}

export interface TrackAudioSpec {
  id: string;
  path: string;
  bytes: number;
  volumeDb: number;
  muted: boolean;
  playing: boolean;
  reverbSend: number;
  delaySend: number;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private buses: EffectBuses | null = null;
  private layers = new Map<string, Layer>();
  /** id → why its sample could not load. A lane in here will never report a duration, so the UI
   *  needs it to stop waiting and say what happened. */
  private loadErrors = new Map<string, string>();
  private running = false;
  private masterDb = 0;

  constructor(private cfg: EngineConfig) {}

  getAnalyser(): AnalyserNode | null { return this.analyser; }

  /** Per-lane analyser for visualization, or null if the track isn't loaded. */
  getLayerAnalyser(id: string): AnalyserNode | null { return this.layers.get(id)?.getAnalyser() ?? null; }

  /** A track's real sample length (seconds) once loaded, else null. */
  getLayerDuration(id: string): number | null { return this.layers.get(id)?.getDuration() ?? null; }

  /** Per-lane loop position/duration, or null if unknown. */
  getLayerProgress(id: string): { position: number; duration: number } | null {
    return this.layers.get(id)?.getProgress() ?? null;
  }

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
        existing.setSend('reverb', s.reverbSend, this.cfg.changeRampMs);
        existing.setSend('delay', s.delaySend, this.cfg.changeRampMs);
        existing.setWantPlaying(s.playing, this.running, this.cfg.muteRampMs);
        continue;
      }
      if (existing) { existing.dispose(); this.layers.delete(s.id); }
      const ctx = this.ctx;
      const master = this.master;
      const buses = this.buses;
      if (!ctx || !master || !buses) return; // context cleared (e.g. navigation/unmount) mid-load
      const layer = new Layer(ctx, master, {
        id: s.id, path: s.path, bytes: s.bytes,
        thresholdBytes: this.cfg.thresholdBytes, volumeDb: s.volumeDb, minDb: this.cfg.minDb,
        reverbSend: s.reverbSend, delaySend: s.delaySend,
      }, buses);
      this.layers.set(s.id, layer);
      try {
        await layer.load();
      } catch (e) {
        // Keep going. A missing or unreadable sample costs its own lane, not the whole mix, and
        // the reason is recorded so the UI can say it rather than waiting forever.
        this.loadErrors.set(s.id, e instanceof Error ? e.message : String(e));
        layer.dispose();
        this.layers.delete(s.id);
        continue;
      }
      if (!this.ctx) { layer.dispose(); this.layers.delete(s.id); return; } // cleared during the await
      this.loadErrors.delete(s.id);
      layer.setMutedInitial(s.muted);
      layer.setWantPlaying(s.playing, this.running, this.cfg.muteRampMs);
    }
  }

  /** id → load failure, for lanes whose sample never arrived. */
  getLoadError(id: string): string | undefined { return this.loadErrors.get(id); }

  setTrackVolume(id: string, db: number) { this.layers.get(id)?.setVolumeDb(db, this.cfg.changeRampMs); }
  /** Ramp one of a track's aux sends (0..1). */
  setTrackSend(id: string, kind: 'reverb' | 'delay', value: number) {
    this.layers.get(id)?.setSend(kind, value, this.cfg.changeRampMs);
  }
  setTrackEnvelope(id: string, scalar: number) { this.layers.get(id)?.setEnvelope(scalar, this.cfg.changeRampMs); }

  /** Layer Two: start a track's sample at `offsetSec` into itself (0 = beginning; mid = scrub). */
  triggerTrack(id: string, offsetSec = 0) { this.layers.get(id)?.trigger(offsetSec); }
  /** Layer Two: stop a track (short anti-click ramp), ready to re-trigger from 0. */
  releaseTrack(id: string) { this.layers.get(id)?.release(this.cfg.muteRampMs); }
  /** Layer Two: resume/suspend the audio context without touching per-track playback. */
  resumeContext() { this.ensure(); this.running = true; void this.ctx!.resume(); }
  suspendContext() { if (this.ctx) { this.running = false; void this.ctx.suspend(); } }
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
    if (this.ctx) { void this.ctx.close(); this.ctx = null; this.master = null; this.analyser = null; this.buses = null; }
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
    this.buses = buildEffectBuses(ctx, master, this.cfg.effects);
    this.applyMaster();
  }

  private applyMaster() {
    if (this.master) {
      this.master.gain.value = this.masterDb <= this.cfg.minDb ? 0 : Math.pow(10, this.masterDb / 20);
    }
  }
}

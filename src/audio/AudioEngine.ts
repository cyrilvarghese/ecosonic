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

  /** Per-lane analyser for visualization, or null if the track isn't loaded. */
  getLayerAnalyser(id: string): AnalyserNode | null { return this.layers.get(id)?.getAnalyser() ?? null; }

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
        existing.setWantPlaying(s.playing, this.running, this.cfg.muteRampMs);
        continue;
      }
      if (existing) { existing.dispose(); this.layers.delete(s.id); }
      const ctx = this.ctx;
      const master = this.master;
      if (!ctx || !master) return; // context cleared (e.g. navigation/unmount) mid-load
      const layer = new Layer(ctx, master, {
        id: s.id, path: s.path, bytes: s.bytes,
        thresholdBytes: this.cfg.thresholdBytes, volumeDb: s.volumeDb, minDb: this.cfg.minDb,
      });
      this.layers.set(s.id, layer);
      await layer.load();
      if (!this.ctx) { layer.dispose(); this.layers.delete(s.id); return; } // cleared during the await
      layer.setMutedInitial(s.muted);
      layer.setWantPlaying(s.playing, this.running, this.cfg.muteRampMs);
    }
  }

  setTrackVolume(id: string, db: number) { this.layers.get(id)?.setVolumeDb(db, this.cfg.changeRampMs); }
  setTrackEnvelope(id: string, scalar: number) { this.layers.get(id)?.setEnvelope(scalar, this.cfg.changeRampMs); }

  /** Layer Two: start a track's sample from position 0 (baked fade-in plays). */
  triggerTrack(id: string) { this.layers.get(id)?.trigger(); }
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

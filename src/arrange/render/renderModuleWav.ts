import { config as defaultConfig, type EcosonicConfig } from '@/config';
import type { ArrTrack, TemplateRegion } from '@/arrange/types';
import { resolveSampleUrl } from '@/samples';
import { dbToGain } from '@/audio/dsp';
import { envelopeCurve } from '@/arrange/render/envelopeCurve';
import { encodeWavPcm16 } from '@/audio/wavEncode';

/** Offline-render the module to a WAV Blob, mirroring live playback: one looping buffer source
 *  per region started at enterSec and stopped at exitSec (the sample loops from 0 under the clip,
 *  as Layer.trigger does), the region's volume envelope × Layer One ceiling on its gain node,
 *  and the master gain on top. Runs in its own OfflineAudioContext — never touches the live
 *  graph, so a running live session is unaffected (spec §6 snapshot semantics). */
export async function renderModuleToWav(
  args: {
    tracks: ArrTrack[];
    regions: TemplateRegion[];
    masterDb: number;
    sampleRate?: number;
    onProgress?: (frac: number) => void;
  },
  cfg: EcosonicConfig = defaultConfig,
): Promise<Blob> {
  const sr = args.sampleRate ?? 44100;
  const D = cfg.layerTwo.moduleSeconds;
  const minDb = cfg.audio.volume.minDb;
  const ctx = new OfflineAudioContext(2, Math.ceil(D * sr), sr);

  const master = ctx.createGain();
  master.gain.value = dbToGain(args.masterDb, minDb);
  master.connect(ctx.destination);

  // Decode each distinct sample once, even if several tracks share a file.
  const decoded = new Map<string, Promise<AudioBuffer>>();
  const decode = (path: string) => {
    let p = decoded.get(path);
    if (!p) {
      p = fetch(resolveSampleUrl(path))
        .then((res) => res.arrayBuffer())
        .then((arr) => ctx.decodeAudioData(arr));
      decoded.set(path, p);
    }
    return p;
  };

  const byId = new Map(args.tracks.map((t) => [t.id, t]));
  await Promise.all(
    args.regions.map(async (r) => {
      const track = byId.get(r.trackId);
      if (!track || r.exitSec - r.enterSec <= 0) return;
      const buffer = await decode(track.sample.path);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true; // sample loops from 0 under the clip window, exactly like live playback
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const curve = envelopeCurve(r, dbToGain(track.ceilingDb, minDb));
      gain.gain.setValueCurveAtTime(curve, r.enterSec, r.exitSec - r.enterSec);
      src.connect(gain);
      gain.connect(master);
      src.start(r.enterSec);
      src.stop(r.exitSec);
    }),
  );

  // Coarse progress: suspend at 30-timeline-second marks (must be scheduled before rendering).
  if (args.onProgress) {
    for (let s = 30; s < D; s += 30) {
      const at = s;
      void ctx.suspend(at).then(() => {
        args.onProgress!(at / D);
        void ctx.resume();
      });
    }
  }

  const rendered = await ctx.startRendering();
  args.onProgress?.(1);
  const channels = Array.from({ length: rendered.numberOfChannels }, (_, c) => rendered.getChannelData(c));
  return new Blob([encodeWavPcm16(channels, sr)], { type: 'audio/wav' });
}

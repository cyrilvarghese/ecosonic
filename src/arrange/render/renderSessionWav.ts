import { config as defaultConfig, type EcosonicConfig } from '@/config';
import type { ArrTrack, Mode, TemplateRegion } from '@/arrange/types';
import { renderModuleToChannels } from '@/arrange/render/renderModuleWav';
import { encodeWavPcm16 } from '@/audio/wavEncode';
import { tailSecFor, type TrackSends } from '@/audio/effects';

/** Render the whole session — every mode in `order`, back-to-back — to one WAV Blob,
 *  reusing the single-module offline renderer per mode and concatenating the PCM. */
export async function renderSessionToWav(
  args: {
    tracks: ArrTrack[];
    regionsByMode: Record<Mode, TemplateRegion[]>;
    order: Mode[];
    masterDb: number;
    /** Per-track aux send levels, keyed by track id. */
    sends?: Record<string, TrackSends>;
    sampleRate?: number;
    onProgress?: (frac: number) => void;
  },
  cfg: EcosonicConfig = defaultConfig,
): Promise<Blob> {
  const sr = args.sampleRate ?? 44100;
  const n = args.order.length;
  const D = cfg.layerTwo.moduleSeconds;
  const perModule: Float32Array[][] = [];
  for (let i = 0; i < n; i++) {
    const mode = args.order[i];
    const channels = await renderModuleToChannels(
      {
        tracks: args.tracks,
        regions: args.regionsByMode[mode],
        masterDb: args.masterDb,
        sends: args.sends,
        sampleRate: sr,
        onProgress: (f) => args.onProgress?.((i + f) / n),
      },
      cfg,
    );
    perModule.push(channels);
  }

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

  args.onProgress?.(1);
  return new Blob([encodeWavPcm16(channels, sr)], { type: 'audio/wav' });
}

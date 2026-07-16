import { config as defaultConfig, type EcosonicConfig } from '@/config';
import type { ArrTrack, Mode, TemplateRegion } from '@/arrange/types';
import { renderModuleToChannels } from '@/arrange/render/renderModuleWav';
import { encodeWavPcm16 } from '@/audio/wavEncode';

/** Render the whole session — every mode in `order`, back-to-back — to one WAV Blob,
 *  reusing the single-module offline renderer per mode and concatenating the PCM. */
export async function renderSessionToWav(
  args: {
    tracks: ArrTrack[];
    regionsByMode: Record<Mode, TemplateRegion[]>;
    order: Mode[];
    masterDb: number;
    sampleRate?: number;
    onProgress?: (frac: number) => void;
  },
  cfg: EcosonicConfig = defaultConfig,
): Promise<Blob> {
  const sr = args.sampleRate ?? 44100;
  const n = args.order.length;
  const perModule: Float32Array[][] = [];
  for (let i = 0; i < n; i++) {
    const mode = args.order[i];
    const channels = await renderModuleToChannels(
      {
        tracks: args.tracks,
        regions: args.regionsByMode[mode],
        masterDb: args.masterDb,
        sampleRate: sr,
        onProgress: (f) => args.onProgress?.((i + f) / n),
      },
      cfg,
    );
    perModule.push(channels);
  }

  const numChannels = perModule[0]?.length ?? 2;
  const totalLen = perModule.reduce((sum, ch) => sum + (ch[0]?.length ?? 0), 0);
  const channels = Array.from({ length: numChannels }, () => new Float32Array(totalLen));
  let offset = 0;
  for (const modChannels of perModule) {
    const len = modChannels[0]?.length ?? 0;
    for (let c = 0; c < numChannels; c++) channels[c].set(modChannels[c] ?? new Float32Array(len), offset);
    offset += len;
  }

  args.onProgress?.(1);
  return new Blob([encodeWavPcm16(channels, sr)], { type: 'audio/wav' });
}

import { config } from '@/config';
import type { ArrTrack, TemplateRegion } from '@/arrange/types';
import { renderModuleToWav } from '@/arrange/render/renderModuleWav';

/** Export a free-mix arrangement (a flat, absolute-timestamped region set) to a WAV Blob by
 *  rendering it as a single module sized to the full session length. Reuses the offline renderer. */
export function exportFreeMixWav(args: {
  tracks: ArrTrack[];
  regions: TemplateRegion[];
  totalSec: number;
  masterDb: number;
  /** 0..1, called as the offline render passes each 30-second mark of the timeline. Nothing fires
   *  until every sample has been fetched and decoded, which is the slow part for big files. */
  onProgress?: (frac: number) => void;
}): Promise<Blob> {
  const cfg = { ...config, layerTwo: { ...config.layerTwo, moduleSeconds: args.totalSec } };
  return renderModuleToWav(
    {
      tracks: args.tracks,
      regions: args.regions,
      masterDb: args.masterDb,
      onProgress: args.onProgress,
    },
    cfg,
  );
}

/** Rough size of the finished 16-bit stereo WAV, for warning before a long render. */
export function estimatedWavBytes(totalSec: number, sampleRate = 44100): number {
  return Math.round(totalSec * sampleRate * 2 * 2) + 44;
}

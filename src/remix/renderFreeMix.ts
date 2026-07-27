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
}): Promise<Blob> {
  const cfg = { ...config, layerTwo: { ...config.layerTwo, moduleSeconds: args.totalSec } };
  return renderModuleToWav(
    { tracks: args.tracks, regions: args.regions, masterDb: args.masterDb },
    cfg,
  );
}

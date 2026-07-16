import { config as defaultConfig, type EcosonicConfig } from '@/config';
import type { ArrTrack, Mode, TemplateRegion } from '@/arrange/types';
import { buildModeTemplate } from '@/arrange/buildModeTemplate';

export interface SessionModules {
  order: Mode[];
  regionsByMode: Record<Mode, TemplateRegion[]>;
}

/** Snapshot the three modes' region-sets in playback order. The active mode
 *  contributes its on-screen regions; the others reseed from their density table. */
export function buildSessionModules(
  tracks: ArrTrack[],
  activeMode: Mode,
  moduleRegions: TemplateRegion[],
  cfg: EcosonicConfig = defaultConfig,
): SessionModules {
  const order = cfg.layerTwo.modes;
  const regionsByMode = {} as Record<Mode, TemplateRegion[]>;
  for (const mode of order) {
    regionsByMode[mode] =
      mode === activeMode ? moduleRegions : buildModeTemplate(tracks, mode, cfg).regions;
  }
  return { order, regionsByMode };
}

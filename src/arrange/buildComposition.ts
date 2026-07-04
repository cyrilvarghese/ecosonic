import { config as defaultConfig, type EcosonicConfig } from '@/config';
import type { ArrTrack, Composition, Mode, ModeTemplate } from '@/arrange/types';
import { buildModeTemplate } from '@/arrange/buildModeTemplate';
import { buildSequence } from '@/arrange/buildSequence';

export function buildComposition(
  input: { tracks: ArrTrack[]; tuningHz: number; masterDb: number },
  totalSecTarget: number,
  cfg: EcosonicConfig = defaultConfig,
): Composition {
  const templates = {} as Record<Mode, ModeTemplate>;
  for (const mode of cfg.layerTwo.modes) {
    templates[mode] = buildModeTemplate(input.tracks, mode, cfg);
  }
  const { sequence, bridges, totalSec } = buildSequence(totalSecTarget, cfg);
  return {
    tracks: input.tracks,
    templates,
    sequence,
    bridges,
    totalSec,
    tuningHz: input.tuningHz,
    masterDb: input.masterDb,
  };
}

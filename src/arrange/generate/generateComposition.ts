import { config as defaultConfig, type EcosonicConfig } from '@/config';
import type { ArrTrack, Composition, Drift, Mode, ModeTemplate } from '@/arrange/types';
import { generateModeTemplate } from '@/arrange/generate/generateModeTemplate';
import { buildSequence } from '@/arrange/buildSequence';

/** Generate a whole composition: one seeded template per mode (a distinct arrangement per section),
 *  laid out on the standard module sequence. Mirrors buildComposition but swaps the template source,
 *  so the existing scheduler (trackScalarAt → regionEnvAt) plays it — volume fades included. */
export function generateComposition(
  input: { tracks: ArrTrack[]; tuningHz: number; masterDb: number },
  totalSecTarget: number,
  drift: Drift,
  seed: number,
  cfg: EcosonicConfig = defaultConfig,
): Composition {
  const templates = {} as Record<Mode, ModeTemplate>;
  cfg.layerTwo.modes.forEach((mode, i) => {
    templates[mode] = generateModeTemplate(input.tracks, mode, drift, seed + i * 1000, cfg);
  });
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

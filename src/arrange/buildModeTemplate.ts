import { config as defaultConfig, type EcosonicConfig } from '@/config';
import type { ArrTrack, Mode, ModeTemplate, Presence, TemplateRegion } from '@/arrange/types';

/** Build one reusable Wave Module template from the config mode rules. Regions are
 *  module-relative [0, moduleSeconds]; overlap peaks near the midpoint by construction. */
export function buildModeTemplate(
  tracks: ArrTrack[],
  mode: Mode,
  cfg: EcosonicConfig = defaultConfig,
): ModeTemplate {
  const { moduleSeconds: D, presenceBands, modeRules, regionFadeSeconds } = cfg.layerTwo;
  const rule = modeRules[mode];
  const regions: TemplateRegion[] = [];

  tracks.forEach((track, i) => {
    const presence = rule[track.category] as Presence;
    if (presence === 'absent') return;
    const [lo, hi] = presenceBands[presence];
    // Small per-index offset so equal-tier drivers don't stack identically (deterministic).
    // Continuity (bed) regions must span the full module exactly — never jitter them.
    const jitter = presence === 'continuous' ? 0 : (((i % 5) - 2) / 2) * 0.02 * D; // ±2% of D
    let enterSec = Math.max(0, lo * D + jitter);
    let exitSec = Math.min(D, hi * D + jitter);
    if (exitSec <= enterSec) {
      enterSec = lo * D;
      exitSec = hi * D;
    }
    const width = exitSec - enterSec;
    const fade = Math.min(regionFadeSeconds, width / 2);
    regions.push({ trackId: track.id, enterSec, exitSec, fadeInSec: fade, fadeOutSec: fade });
  });

  return { mode, regions };
}

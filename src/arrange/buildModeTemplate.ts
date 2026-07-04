import { config as defaultConfig, type EcosonicConfig } from '@/config';
import type { ArrTrack, Mode, ModeTemplate, TemplateRegion } from '@/arrange/types';

/** Build a Wave Module template from a mode's timing table: each category has an explicit
 *  enter/exit/fade (transcribed from the production brief); a `null` entry = the category is
 *  absent in that mode. Multiple tracks of a category share that category's timing. */
export function buildModeTemplate(
  tracks: ArrTrack[],
  mode: Mode,
  cfg: EcosonicConfig = defaultConfig,
): ModeTemplate {
  const D = cfg.layerTwo.moduleSeconds;
  const rule = cfg.layerTwo.modeRules[mode];
  const regions: TemplateRegion[] = [];

  tracks.forEach((track) => {
    const t = rule[track.category];
    if (!t) return; // absent in this mode
    const enterSec = Math.max(0, Math.min(t.enter, D));
    const exitSec = Math.max(enterSec, Math.min(t.exit, D));
    const halfWidth = (exitSec - enterSec) / 2;
    regions.push({
      trackId: track.id,
      enterSec,
      exitSec,
      fadeInSec: Math.min(t.fadeIn, halfWidth),
      fadeOutSec: Math.min(t.fadeOut, halfWidth),
    });
  });

  return { mode, regions };
}

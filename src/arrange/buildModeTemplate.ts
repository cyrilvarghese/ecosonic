import { config as defaultConfig, type EcosonicConfig } from '@/config';
import type { Category } from '@/types';
import type { ArrTrack, Mode, ModeTemplate, TemplateRegion } from '@/arrange/types';

/** Build a Wave Module template from a mode's timing table: each category has an explicit
 *  enter/exit/fade (transcribed from the production brief); a `null` entry = the category is
 *  absent in that mode. Multiple tracks of a category share that category's timing — except a
 *  2nd (or later) Element / Sub-Element, which enters later per the brief (~5:00). */
export function buildModeTemplate(
  tracks: ArrTrack[],
  mode: Mode,
  cfg: EcosonicConfig = defaultConfig,
): ModeTemplate {
  const D = cfg.layerTwo.moduleSeconds;
  const rule = cfg.layerTwo.modeRules[mode];
  const secondEnter = cfg.layerTwo.secondElementEnterSec;
  const seen: Partial<Record<Category, number>> = {};
  const regions: TemplateRegion[] = [];

  tracks.forEach((track) => {
    const t = rule[track.category];
    if (!t) return; // absent in this mode
    const idx = seen[track.category] ?? 0;
    seen[track.category] = idx + 1;

    const isElementish = track.category === 'ELEMENT' || track.category === 'ELEMENT_SUB';
    const enterRaw = isElementish && idx >= 1 ? Math.max(t.enter, secondEnter) : t.enter;
    const enterSec = Math.max(0, Math.min(enterRaw, D));
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

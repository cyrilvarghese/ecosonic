import type { TemplateRegion } from '@/arrange/types';
import type { EcosonicConfig } from '@/config';

/** A sample past a certain length stops being a loop and becomes a composed passage: heard twice in
 *  a row it reads as a repeat rather than as a bed. So a long sample plays exactly ONE pass per
 *  interval, and the interval ends when the pass does.
 *
 *  Unconditional — unlike the whole-loop trim (§6) this is not a checkbox. It is a fact about the
 *  material rather than a preference about seams.
 *
 *  Beds are exempt (`alwaysLoopCategories`): NOISE and BASS are meant to be continuous, and a long
 *  file there is a long bed, not a passage.
 *
 *  Pure, and safe to apply after the whole-loop trim — which is where it belongs, so that trim
 *  cannot extend a long sample back out to two passes. Intervals only ever shrink: a start never
 *  moves (§6.5), and an interval already shorter than one pass is left exactly as authored. */
export function playLongOnce(
  regions: TemplateRegion[],
  trackDurations: Record<string, number>,
  categoryOf: (trackId: string) => string | undefined,
  cfg: EcosonicConfig,
): TemplateRegion[] {
  const { longSampleSec, alwaysLoopCategories } = cfg.audio.remix;
  const loops = new Set(alwaysLoopCategories);

  return regions.map((r) => {
    const sample = trackDurations[r.trackId];
    if (!sample || sample <= longSampleSec) return r;
    const category = categoryOf(r.trackId);
    if (category && loops.has(category)) return r;

    // One pass, or the authored interval if that is already shorter than a pass.
    const exitSec = Math.min(r.exitSec, r.enterSec + sample);
    if (exitSec >= r.exitSec) return r;
    const width = exitSec - r.enterSec;
    return {
      ...r,
      exitSec,
      fadeInSec: Math.min(r.fadeInSec, width),
      fadeOutSec: Math.min(r.fadeOutSec, width),
    };
  });
}

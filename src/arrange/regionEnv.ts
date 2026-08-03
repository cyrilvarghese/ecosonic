import type { RegionTiming, TemplateRegion } from '@/arrange/types';

const cosRamp = (x: number) => 0.5 * (1 - Math.cos(Math.PI * x)); // x in [0,1] → 0..1

/** Per-clip envelope: fade-in → hold at 1 → fade-out; 0 outside [enter, exit]. */
export function regionEnvAt(r: RegionTiming, s: number): number {
  if (s <= r.enterSec || s >= r.exitSec) return 0;
  const fromStart = s - r.enterSec;
  const toEnd = r.exitSec - s;
  if (r.fadeInSec > 0 && fromStart < r.fadeInSec) return cosRamp(fromStart / r.fadeInSec);
  if (r.fadeOutSec > 0 && toEnd < r.fadeOutSec) return cosRamp(toEnd / r.fadeOutSec);
  return 1;
}

/** The region of `trackId` containing `pos`, entrance-inclusive and exit-exclusive.
 *  A multi-phrase rule emits several regions for one track, so a plain find-by-track would only
 *  ever see the first phrase and every later one would stay silent. */
export function regionAt(
  regions: TemplateRegion[],
  trackId: string,
  pos: number,
): TemplateRegion | undefined {
  return regions.find((r) => r.trackId === trackId && pos >= r.enterSec && pos < r.exitSec);
}

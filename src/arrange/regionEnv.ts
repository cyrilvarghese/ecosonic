import type { RegionTiming } from '@/arrange/types';

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

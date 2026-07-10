import type { RegionTiming } from '@/arrange/types';
import { regionEnvAt } from '@/arrange/regionEnv';

/** Sample a region's audible gain (volume envelope × ceiling gain) across [enterSec, exitSec]
 *  for OfflineAudioContext setValueCurveAtTime. The first sample sits exactly at enterSec where
 *  regionEnvAt is 0, so even a zero-fade (BASS) entry gets a one-step anti-click ramp — the same
 *  behavior as live playback's short trigger ramp. */
export function envelopeCurve(region: RegionTiming, ceilingGain: number, stepSec = 0.05): Float32Array {
  const dur = region.exitSec - region.enterSec;
  const n = Math.max(2, Math.ceil(dur / stepSec) + 1);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const s = region.enterSec + (i / (n - 1)) * dur;
    out[i] = regionEnvAt(region, Math.min(s, region.exitSec - 1e-6)) * ceilingGain;
  }
  return out;
}

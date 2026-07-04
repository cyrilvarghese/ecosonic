import type { ArrTrack, Composition } from '@/arrange/types';
import { isBed } from '@/arrange/types';
import { regionEnvAt } from '@/arrange/regionEnv';
import { crossfade } from '@/arrange/bridges';

/** Gain scalar (0..1) for one track at absolute session time `s`. Combines covering
 *  module instances by max (never > 1); bed tracks carry through bridges, drivers crossfade. */
export function trackScalarAt(
  comp: Composition,
  track: Pick<ArrTrack, 'id' | 'category'>,
  s: number,
): number {
  const bed = isBed(track.category);
  let best = 0;

  comp.sequence.forEach((inst, k) => {
    const end = inst.startSec + inst.durationSec;
    if (s < inst.startSec || s >= end) return;
    const region = comp.templates[inst.mode].regions.find((r) => r.trackId === track.id);
    if (!region) return;

    let env = regionEnvAt(region, s - inst.startSec);
    if (env <= 0) return;

    if (!bed) {
      // Outgoing side of the bridge to the next instance.
      const asFrom = comp.bridges.find((b) => b.fromInstanceId === inst.id);
      const next = comp.sequence[k + 1];
      if (asFrom && next && s >= next.startSec) {
        env *= crossfade(s - next.startSec, asFrom.overlapSec).out;
      }
      // Incoming side of the bridge from the previous instance.
      const asTo = comp.bridges.find((b) => b.toInstanceId === inst.id);
      const prev = comp.sequence[k - 1];
      if (asTo && prev && s < prev.startSec + prev.durationSec) {
        env *= crossfade(s - inst.startSec, asTo.overlapSec).in;
      }
    }
    best = Math.max(best, env);
  });

  return Math.min(1, best);
}

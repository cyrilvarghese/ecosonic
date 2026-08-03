import type { TemplateRegion } from '@/arrange/types';

/** Resize every interval to a whole number of loops of its track's sample, so no interval ends
 *  part-way through a pass and cuts the sample mid-phrase.
 *
 *  The count is the nearest whole number of loops — 1.7× becomes 2, 1.49× becomes 1 — with a floor
 *  of one, so rounding never deletes a track. Two cases round *down* instead, because extending
 *  would create a worse seam than the one being removed:
 *   - rounding up would run past `totalSec`, or past the track's next interval;
 *   - if not even one whole loop fits in that space, the interval is left exactly as authored.
 *
 *  A track whose sample length isn't known yet (the engine fills these in after loading) is left
 *  alone. Pure: the input regions are not mutated, and their order is preserved. */
export function adjustToWholeLoops(
  regions: TemplateRegion[],
  trackDurations: Record<string, number>,
  totalSec: number,
): TemplateRegion[] {
  const out = regions.map((r) => ({ ...r }));

  // Per track, in time order, so each interval knows where the following one begins.
  const byTrack = new Map<string, number[]>();
  out.forEach((r, i) => {
    const list = byTrack.get(r.trackId);
    if (list) list.push(i); else byTrack.set(r.trackId, [i]);
  });

  for (const [trackId, indices] of byTrack) {
    const sample = trackDurations[trackId];
    if (!sample || sample <= 0) continue;

    indices.sort((a, b) => out[a].enterSec - out[b].enterSec);

    indices.forEach((idx, n) => {
      const r = out[idx];
      const next = indices[n + 1];
      const limit = Math.min(totalSec, next === undefined ? totalSec : out[next].enterSec);

      const fits = Math.floor((limit - r.enterSec) / sample);
      if (fits < 1) return; // not even one whole loop — leave it as authored

      const wanted = Math.max(1, Math.round((r.exitSec - r.enterSec) / sample));
      const loops = Math.min(wanted, fits);

      r.exitSec = r.enterSec + loops * sample;
      const width = r.exitSec - r.enterSec;
      r.fadeInSec = Math.min(r.fadeInSec, width);
      r.fadeOutSec = Math.min(r.fadeOutSec, width);
    });
  }

  return out;
}

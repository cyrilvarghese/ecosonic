import type { Category } from '@/types';
import type { ArrTrack, TemplateRegion } from '@/arrange/types';
import { makeRng } from '@/arrange/prng';
import type { AuthoredRule } from './sessionRules';

export interface Pick {
  trackId: string;
  rule: AuthoredRule;
  poolSize: number;
}

/** For each track, draw one authored rule at random from its category pool (empty pool ⇒ the track
 *  is absent and skipped), then emit one absolute TemplateRegion per phrase of the chosen rule.
 *  Pure and seeded: same tracks + pool + seed ⇒ same output. No invariant repair (free mix). */
export function generateFreeMix(
  tracks: ArrTrack[],
  pool: (c: Category) => AuthoredRule[],
  seed: number,
): { regions: TemplateRegion[]; picks: Pick[] } {
  const rng = makeRng(seed);
  const regions: TemplateRegion[] = [];
  const picks: Pick[] = [];
  for (const track of tracks) {
    const cands = pool(track.category);
    if (cands.length === 0) continue; // absent → skip
    const rule = cands[Math.floor(rng.float() * cands.length)];
    picks.push({ trackId: track.id, rule, poolSize: cands.length });
    for (const p of rule.phrases) {
      regions.push({
        trackId: track.id,
        enterSec: p.enterSec,
        exitSec: p.exitSec,
        fadeInSec: p.fadeInSec,
        fadeOutSec: p.fadeOutSec,
      });
    }
  }
  return { regions, picks };
}

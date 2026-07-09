import { config as defaultConfig, type EcosonicConfig, type GenLayerRule, type GenRange } from '@/config';
import type { Category } from '@/types';
import type { ArrTrack, Drift, Mode, ModeTemplate, TemplateRegion } from '@/arrange/types';
import { STACK_ORDER } from '@/arrange/types';
import { makeRng, type RNG } from '@/arrange/prng';

interface DrawnTiming { enter: number; exit: number; fadeIn: number; fadeOut: number }

/** Sample a value from `canon ± half × scale`, clamped to [0, D]. Even at scale 0 it returns canon. */
function sampleRange(r: GenRange, scale: number, rng: RNG, D: number): number {
  const half = r.half * scale;
  const lo = Math.max(0, r.canon - half);
  const hi = Math.min(D, r.canon + half);
  return hi <= lo ? lo : rng.range(lo, hi);
}

/** Generate one mode's timing table from the generation grammar. Pure and seeded.
 *  Draw per-category timings within drift-scaled ranges, enforce bottom-up ordering (R2), then
 *  emit one region per track (shared category timing; a 2nd element staggers; fades capped). */
export function generateModeTemplate(
  tracks: ArrTrack[],
  mode: Mode,
  drift: Drift,
  seed: number,
  cfg: EcosonicConfig = defaultConfig,
): ModeTemplate {
  const rng = makeRng(seed);
  const D = cfg.layerTwo.moduleSeconds;
  const gen = cfg.layerTwo.generation;
  const rule = gen.modeRules[mode];
  const scale = gen.driftScales[drift];
  const minGap = gen.minGapSec;
  const secondEnter = cfg.layerTwo.secondElementEnterSec;

  // 1. Presence + draw, processed bottom-up so `after` targets are already drawn.
  const drawn: Partial<Record<Category, DrawnTiming>> = {};
  for (const cat of STACK_ORDER) {
    const r: GenLayerRule | undefined = rule[cat];
    if (!r) continue; // absent in this mode
    const present = drift === 'STRICT' ? true : r.present >= 1 ? true : rng.chance(r.present);
    if (!present) continue;
    const enter = sampleRange(r.enter, scale, rng, D);
    const exit = r.exit === 'MODULE_END' ? D : sampleRange(r.exit, scale, rng, D);
    const fadeIn = sampleRange(r.fadeIn, scale, rng, D);
    const fadeOut = sampleRange(r.fadeOut, scale, rng, D);
    drawn[cat] = { enter, exit, fadeIn, fadeOut };
  }

  // 2. Enforce bottom-up ordering (R2): clamp enter ≥ enter[after] + minGap; keep within bounds.
  for (const cat of STACK_ORDER) {
    const d = drawn[cat];
    if (!d) continue;
    const after = rule[cat]?.after;
    if (after && drawn[after]) d.enter = Math.max(d.enter, drawn[after]!.enter + minGap);
    d.enter = Math.max(0, Math.min(d.enter, D));
    d.exit = Math.max(d.enter, Math.min(d.exit, D));
  }

  // 3. Emit one region per track. Multiple tracks of a category share its timing, except a
  //    2nd (or later) Element/Sub-Element, which enters no earlier than secondElementEnterSec.
  const seen: Partial<Record<Category, number>> = {};
  const regions: TemplateRegion[] = [];
  for (const track of tracks) {
    const d = drawn[track.category];
    if (!d) continue;
    const idx = seen[track.category] ?? 0;
    seen[track.category] = idx + 1;
    const isElementish = track.category === 'ELEMENT' || track.category === 'ELEMENT_SUB';
    const enterSec = isElementish && idx >= 1 ? Math.max(d.enter, secondEnter) : d.enter;
    const exitSec = Math.max(enterSec, Math.min(d.exit, D));
    const halfWidth = (exitSec - enterSec) / 2;
    regions.push({
      trackId: track.id,
      enterSec,
      exitSec,
      fadeInSec: Math.min(d.fadeIn, halfWidth),
      fadeOutSec: Math.min(d.fadeOut, halfWidth),
    });
  }

  return { mode, regions };
}

import type { Category, ElementName, Manifest } from '@/types';
import { STACK_ORDER, type ArrTrack, type TemplateRegion } from '@/arrange/types';
import { makeRng } from '@/arrange/prng';
import { config } from '@/config';
import type { AuthoredRule } from './sessionRules';

export interface RemixPick {
  track: ArrTrack;
  rule: AuthoredRule;
  /** How many candidates the draw chose from — the filtered pool, so it differs by mode. */
  poolSize: number;
}

export interface RemixDraw {
  tracks: ArrTrack[];
  regions: TemplateRegion[];
  picks: RemixPick[];
  warnings: string[];
}

/** Draw a free mix straight from the authored-rule pool: one rule per category that the pool covers,
 *  one derived track per pick, one absolute region per phrase. Tracks are *derived*, not supplied —
 *  `/remix` owns them rather than borrowing an Arrange setup.
 *
 *  `opts.element` set ⇒ Scoped: only that element's rules are candidates. Omitted ⇒ Cross-element:
 *  the whole pool is. Either way a track's audio follows the picked rule's own element, so the two
 *  modes differ only in the filter above.
 *
 *  Pure and seeded: same pool + manifest + seed + element ⇒ same draw. No invariant repair — a
 *  category the pool doesn't cover is simply absent, and sparsity is accepted. */
export function generateRemix(
  pool: AuthoredRule[],
  manifest: Manifest,
  opts: { seed: number; element?: ElementName },
): RemixDraw {
  const rng = makeRng(opts.seed);
  const candidates = opts.element ? pool.filter((r) => r.source.element === opts.element) : pool;
  // STACK_ORDER covers every Category, so this both filters to covered categories and orders the
  // tracks bottom → top of the vertical grammar.
  const categories = STACK_ORDER.filter((c) => candidates.some((r) => r.category === c));

  const tracks: ArrTrack[] = [];
  const regions: TemplateRegion[] = [];
  const picks: RemixPick[] = [];
  const warnings: string[] = [];

  for (const category of categories) {
    const cands = candidates.filter((r) => r.category === category);
    const rule = cands[Math.floor(rng.float() * cands.length)];
    const samples = sampleList(manifest, rule.source.element, category);
    if (samples.length === 0) {
      warnings.push(`${category}: no ${rule.source.element} sample for the picked rule — track skipped`);
      continue;
    }
    const sample = samples[Math.floor(rng.float() * samples.length)];
    const track: ArrTrack = {
      id: category, // one track per category ⇒ unique; melody variants collapse, variant shows as label
      category,
      label: rule.variant ?? category,
      sample: { name: sample.name, path: sample.path, bytes: sample.bytes },
      ceilingDb: config.audio.volume.defaultTrackDb,
      locked: false,
    };
    tracks.push(track);
    picks.push({ track, rule, poolSize: cands.length });
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
  return { tracks, regions, picks, warnings };
}

/** The sample follows the picked rule's element. Tolerates a manifest missing the slot entirely. */
function sampleList(manifest: Manifest, element: ElementName, category: Category) {
  return manifest[element]?.[category] ?? [];
}

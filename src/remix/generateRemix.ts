import type { ElementName, Manifest } from '@/types';
import { STACK_ORDER, type ArrTrack, type Mode, type TemplateRegion } from '@/arrange/types';
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
  /** Length of the timeline this draw lays out on. */
  totalSec: number;
}

/** Draw a free mix straight from the authored-rule pool: one rule per category the pool covers, one
 *  derived track per pick, one region per phrase. Tracks are *derived*, not supplied — `/remix` owns
 *  them rather than borrowing an Arrange setup.
 *
 *  Three independent filters, each just narrowing the candidate pool:
 *   - `element` set ⇒ Scoped to that element's rules; omitted ⇒ Cross-element, the whole pool.
 *   - `section` set ⇒ one fixed-length module of that section; omitted ⇒ the whole session.
 *  Either way a track's audio follows the picked rule's own element.
 *
 *  Pure and seeded: same pool + manifest + opts ⇒ same draw. No invariant repair — a category the
 *  pool doesn't cover is simply absent, and sparsity is accepted. */
export function generateRemix(
  pool: AuthoredRule[],
  manifest: Manifest,
  opts: { seed: number; element?: ElementName; section?: Mode; sessionSec: number },
): RemixDraw {
  const totalSec = opts.section ? config.layerTwo.moduleSeconds : opts.sessionSec;
  const rng = makeRng(opts.seed);

  let candidates = pool;
  if (opts.element) candidates = candidates.filter((r) => r.source.element === opts.element);
  if (opts.section) candidates = candidates.filter((r) => r.section === opts.section);

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

    const samples = manifest[rule.source.element]?.[category] ?? [];
    if (samples.length === 0) {
      warnings.push(`${category}: no ${rule.source.element} sample for the picked rule — track skipped`);
      continue;
    }

    // A section draw rebases by the rule's OWN window start, so rules authored against different
    // windows (AIR opens Deep Relaxation at 9:30, everyone else at 10:00) land on one 0..totalSec module.
    const ruleRegions = rebase(rule, opts.section ? rule.sectionStartSec : 0, totalSec);
    if (ruleRegions.length === 0) {
      warnings.push(`${category}: the ${rule.source.element} rule falls outside the module — track skipped`);
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
    for (const r of ruleRegions) regions.push({ ...r, trackId: track.id });
  }

  return { tracks, regions, picks, warnings, totalSec };
}

/** Shift a rule's phrases onto a 0..totalSec timeline, clipping the tail and dropping anything that
 *  starts at or past the end. Fades are capped at the surviving width so a clipped clip still fades
 *  fully rather than being cut off mid-ramp. */
function rebase(rule: AuthoredRule, origin: number, totalSec: number): Omit<TemplateRegion, 'trackId'>[] {
  const out: Omit<TemplateRegion, 'trackId'>[] = [];
  for (const p of rule.phrases) {
    const enterSec = p.enterSec - origin;
    const exitSec = Math.min(p.exitSec - origin, totalSec);
    if (enterSec < 0 || enterSec >= totalSec || exitSec <= enterSec) continue;
    const width = exitSec - enterSec;
    out.push({
      enterSec,
      exitSec,
      fadeInSec: Math.min(p.fadeInSec, width),
      fadeOutSec: Math.min(p.fadeOutSec, width),
    });
  }
  return out;
}

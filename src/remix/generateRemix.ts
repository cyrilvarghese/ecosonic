import type { ElementName, Manifest } from '@/types';
import { STACK_ORDER, type ArrTrack, type Mode, type TemplateRegion } from '@/arrange/types';

/** Draw order for a full session — one rule per section, so a track spans the whole timeline. */
const SECTION_ORDER: Mode[] = ['INTRODUCTION', 'DEEP_RELAXATION', 'RETURN'];
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

/** Draw a free mix straight from the authored-rule pool. One derived track per category the pool
 *  covers; tracks are *derived*, not supplied, so `/remix` owns them rather than borrowing an
 *  Arrange setup.
 *
 *  Two independent choices:
 *   - `element` set ⇒ Scoped to that element's rules; omitted ⇒ Cross-element, the whole pool.
 *     Either way a track's audio follows the element its lead draw landed on.
 *   - `section` set ⇒ one fixed-length module, one rule, rebased to the section start.
 *     Omitted ⇒ the whole session: **one rule per section**, so a bed sounds across all thirty
 *     minutes rather than only the third its lead happened to come from.
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

    // One element per track: a track is a single sample, so its windows come from one element's
    // authored timeline. The lead draw fixes that element (and therefore the audio).
    const lead = cands[Math.floor(rng.float() * cands.length)];
    const element = lead.source.element;

    const samples = manifest[element]?.[category] ?? [];
    if (samples.length === 0) {
      warnings.push(`${category}: no ${element} sample for the picked rule — track skipped`);
      continue;
    }

    // A section draw is exactly one rule. A full session takes one rule per section that element
    // authored, so the track sounds across the whole timeline instead of only its lead's third.
    const ofElement = cands.filter((r) => r.source.element === element);
    const chosen: { rule: AuthoredRule; poolSize: number }[] = [];
    if (opts.section) {
      chosen.push({ rule: lead, poolSize: cands.length });
    } else {
      for (const mode of SECTION_ORDER) {
        const inSection = ofElement.filter((r) => r.section === mode);
        if (inSection.length === 0) continue; // absence is allowed — no repair
        chosen.push({
          rule: inSection[Math.floor(rng.float() * inSection.length)],
          poolSize: inSection.length,
        });
      }
    }

    // A section draw rebases by the rule's OWN window start, so rules authored against different
    // windows (AIR opens Deep Relaxation at 9:30, everyone else at 10:00) land on one 0..totalSec module.
    const drawn = chosen
      .map((c) => ({ ...c, regions: rebase(c.rule, opts.section ? c.rule.sectionStartSec : 0, totalSec) }))
      .filter((c) => c.regions.length > 0);
    if (drawn.length === 0) {
      warnings.push(`${category}: the ${element} rule falls outside the module — track skipped`);
      continue;
    }

    const sample = samples[Math.floor(rng.float() * samples.length)];
    const track: ArrTrack = {
      id: category, // one track per category ⇒ unique; melody variants collapse, variant shows as label
      category,
      label: drawn[0].rule.variant ?? category,
      sample: { name: sample.name, path: sample.path, bytes: sample.bytes },
      ceilingDb: config.audio.volume.defaultTrackDb,
      locked: false,
    };
    tracks.push(track);
    for (const c of drawn) {
      picks.push({ track, rule: c.rule, poolSize: c.poolSize });
      for (const r of c.regions) regions.push({ ...r, trackId: track.id });
    }
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

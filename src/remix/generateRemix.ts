import { ELEMENTS, type ElementName, type Manifest } from '@/types';
import { STACK_ORDER, type ArrTrack, type Mode, type TemplateRegion } from '@/arrange/types';
import { makeRng, type RNG } from '@/arrange/prng';
import { config } from '@/config';
import type { AuthoredRule } from './sessionRules';

/** Draw order for a full session — one rule per section, so a track spans the whole timeline. */
const SECTION_ORDER: Mode[] = ['INTRODUCTION', 'DEEP_RELAXATION', 'RETURN'];

/** "WATER" → "Water" — a lane label reads `MELODY 2 · Water`, not `MELODY 2 · WATER`. */
const titleCase = (el: string): string => el[0] + el.slice(1).toLowerCase();

/** One derived lane: category × element. Rules and audio are the same element everywhere except
 *  Borrowed, where the audio is fixed by hand and the rules stay wide open (§3.4). */
interface Lane {
  ruleElement: ElementName | null;
  audioElement: ElementName;
  lead: AuthoredRule;
}

/** Lead rules for a category, one per lane, drawn WITHOUT replacement of the element: each draw is
 *  uniform over the rules still in play, so an element with more authored variants stays likelier to
 *  win a lane (§3.7), and no element wins two. */
function drawLeads(cands: AuthoredRule[], rng: RNG, count: number): AuthoredRule[] {
  const out: AuthoredRule[] = [];
  let remaining = cands;
  while (out.length < count && remaining.length > 0) {
    const lead = remaining[Math.floor(rng.float() * remaining.length)];
    out.push(lead);
    remaining = remaining.filter((r) => r.source.element !== lead.source.element);
  }
  return out;
}

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

/** Draw a free mix straight from the authored-rule pool. One derived LANE per category × element the
 *  pool covers; lanes are *derived*, not supplied, so `/remix` owns them rather than borrowing an
 *  Arrange setup. Two lanes are two trackIds, so overlapping timings layer rather than cutting each
 *  other off — a lane is a voice.
 *
 *  Four independent choices:
 *   - `element` set ⇒ Scoped to that element's rules; omitted ⇒ Cross-element, the whole pool.
 *     Either way a track's audio follows the element its lead draw landed on.
 *   - `sampleElement` set ⇒ Borrowed timings: every track plays THAT element's audio while its
 *     rules are drawn from every element. A rule then carries pure timing, which is all it ever
 *     held — it is "the sample follows the pick" that made a rule's element mean anything.
 *   - `section` set ⇒ one fixed-length module, one rule, rebased to the section start.
 *     Omitted ⇒ the whole session: **one rule per section**, so a bed sounds across all thirty
 *     minutes rather than only the third its lead happened to come from.
 *   - `lanesPerTrack` > 1 ⇒ Layered: a category takes several elements, each its own lane, drawn
 *     without replacement. Capped to 1 under `sampleElement`, where the extra lanes would be the
 *     same file staggered in time rather than several elements sounding.
 *
 *  Pure and seeded: same pool + manifest + opts ⇒ same draw. No invariant repair — a category the
 *  pool doesn't cover is simply absent, and sparsity is accepted. */
export function generateRemix(
  pool: AuthoredRule[],
  manifest: Manifest,
  opts: {
    seed: number;
    element?: ElementName;
    /** Borrowed timings: take ALL audio from this element, whatever rule wins. */
    sampleElement?: ElementName;
    section?: Mode;
    sessionSec: number;
    /** Layered: how many elements the draw may take per category. 1 (and omitted) = one lane. */
    lanesPerTrack?: number;
  },
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

  // Borrowed fixes every lane's audio to one element, so a second lane of a one-sample category
  // would be byte-identical audio staggered in time — a different feature (§6.1). One lane, always.
  const laneCount = opts.sampleElement ? 1 : Math.max(1, opts.lanesPerTrack ?? 1);

  for (const category of categories) {
    const cands = candidates.filter((r) => r.category === category);

    // Every lead is drawn before any lane is filled, which is what lets the draw be without
    // replacement. At laneCount 1 this is one rng call followed by the same per-section and sample
    // calls as before, so a one-lane draw is bit-for-bit today's draw.
    const leads = drawLeads(cands, rng, laneCount);
    const lanes: Lane[] = opts.sampleElement
      ? [{ ruleElement: null, audioElement: opts.sampleElement, lead: leads[0] }]
      : ELEMENTS.filter((e) => leads.some((l) => l.source.element === e)).map((e) => ({
        ruleElement: e,
        audioElement: e,
        lead: leads.find((l) => l.source.element === e)!,
      }));

    for (const lane of lanes) {
      // One SAMPLE per lane: a lane is a single file. Which element that file comes from is either
      // fixed by the caller (borrowed timings) or follows the lead rule — and only in the latter
      // case does a rule's element decide anything, so only then are the section rules filtered.
      const samples = manifest[lane.audioElement]?.[category] ?? [];
      if (samples.length === 0) {
        warnings.push(`${category}: no ${lane.audioElement} sample for the picked rule — track skipped`);
        continue;
      }

      // A lane is one element's rules — §3.4, scoped from a category down to a lane. Borrowed is the
      // exception it always was: the sample is fixed by hand, so the rules need no element at all.
      const forSections = lane.ruleElement
        ? cands.filter((r) => r.source.element === lane.ruleElement)
        : cands;

      // A section draw is exactly one rule. A full session takes one rule per section, so the lane
      // sounds across the whole timeline instead of only its lead's third.
      const chosen: { rule: AuthoredRule; poolSize: number }[] = [];
      if (opts.section) {
        chosen.push({ rule: lane.lead, poolSize: cands.length });
      } else {
        for (const mode of SECTION_ORDER) {
          const inSection = forSections.filter((r) => r.section === mode);
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
        // The rules' OWN elements, which borrowing lets differ from the element being heard.
        const from = [...new Set(chosen.map((c) => c.rule.source.element))].join('/');
        warnings.push(`${category}: the ${from} rule falls outside the module — that lane skipped`);
        continue;
      }

      const sample = samples[Math.floor(rng.float() * samples.length)];
      const track: ArrTrack = {
        // A lane is category × element, so the id carries both — and carries them even when there is
        // only one lane, because an id that changed shape when a sibling appeared would lose this
        // lane's mute state and make the engine reload it mid-session.
        id: `${category}·${lane.audioElement}`,
        category,
        label: `${drawn[0].rule.variant ?? category} · ${titleCase(lane.audioElement)}`,
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

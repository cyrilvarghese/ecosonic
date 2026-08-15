import { ELEMENTS, type Category, type ElementName, type Manifest } from '@/types';
import { STACK_ORDER, type ArrTrack, type Mode, type TemplateRegion } from '@/arrange/types';
import { makeRng, seedFrom, type RNG } from '@/arrange/prng';
import { config } from '@/config';
import { ruleKey, slotKey, type Manual } from './pins';
import type { AuthoredRule } from './sessionRules';

/** Draw order for a full session — one rule per section, so a track spans the whole timeline. */
const SECTION_ORDER: Mode[] = ['INTRODUCTION', 'DEEP_RELAXATION', 'RETURN'];

/** "WATER" → "Water" — a lane label reads `MELODY 2 · Water`, not `MELODY 2 · WATER`. */
const titleCase = (el: string): string => el[0] + el.slice(1).toLowerCase();

/** Categories that sound EVERY sample their element ships, side by side on one timing, rather than
 *  drawing one and dropping the rest.
 *
 *  PLANET alone. Its files are distinct celestial bodies — EARTH ships MERCURY and SUN, ETHER ships
 *  NEPTUNE and PLUTO — authored to be heard together, so drawing one silently silenced the other
 *  half of the library. Every other multi-sample category (ISO's four, ELEMENT's three to seven) is
 *  a set of ALTERNATES to choose between; fanning those out would double the voice count and thicken
 *  the bed well past what the grammar asks for. */
const FANS_OUT: ReadonlySet<Category> = new Set<Category>(['PLANET']);

/** How many voices a fanning category takes. Two: a lane is a voice, and every element ships exactly
 *  two planets — the cap only bites if a third file is ever added. */
const FAN_OUT_MAX = 2;

/** One derived lane: category × element. Rules and audio are the same element everywhere except
 *  Borrowed, where the audio is fixed by hand and the rules stay wide open (§3.4). */
interface Lane {
  ruleElement: ElementName | null;
  audioElement: ElementName;
  lead: AuthoredRule;
}

/** The lead rule for a category: a uniform draw over its candidates, so an element with more
 *  authored variants is likelier to win the category (§3.7). The element it lands on is the one
 *  the category sounds. */
function drawLead(cands: AuthoredRule[], rng: RNG): AuthoredRule {
  return cands[Math.floor(rng.float() * cands.length)];
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
 *
 *  A generated category is ONE lane, on the element its lead landed on. Several lanes happen only
 *  where you make them: taking a category over (`manual`) gives one lane per element you light.
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
    /** category → slotKey → ruleKey. A category listed here is **manual**: the user took it over, so
     *  it is not drawn and its rules no longer apply to it. Absent ⇒ generated as usual. */
    manual?: Manual;
  },
): RemixDraw {
  const totalSec = opts.section ? config.layerTwo.moduleSeconds : opts.sessionSec;

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

    /** Lane elements this category could not sound. Collected rather than warned per lane: a taken
     *  category can hold several, and the same §3.6 gap would otherwise be reported once each. */
    const noSample: ElementName[] = [];

    // A category the user has taken over. Its rules do not apply to it any more — not
    // one-lane-per-category, not one-element-per-lane. What was chosen is what sounds, and nothing
    // here consults the draw.
    const manual = opts.manual?.[category];
    const taken = manual ? cands.filter((r) => manual[slotKey(r)] === ruleKey(r)) : [];

    // One stream per category, so what one category draws can never shift another. Drawn even for a
    // manual category, so the streams below it do not shift when a row is taken over or handed back.
    const catRng = makeRng(seedFrom(opts.seed, category));
    const lead = drawLead(cands, catRng);

    let lanes: Lane[];
    if (manual) {
      // One lane per element chosen — a lane is still one file, which is the one rule that survives
      // going manual because it is a fact about audio rather than a rule about composition.
      // Borrowing already fixed the sample, so there every timing joins the single lane.
      lanes = opts.sampleElement
        ? (taken.length > 0
          ? [{ ruleElement: null, audioElement: opts.sampleElement, lead: taken[0] }]
          : [])
        : ELEMENTS.filter((e) => taken.some((r) => r.source.element === e)).map((e) => ({
          ruleElement: e,
          audioElement: e,
          lead: taken.find((r) => r.source.element === e)!,
        }));
    } else {
      // A generated category is one lane, on the element its lead landed on.
      lanes = [{
        ruleElement: opts.sampleElement ? null : lead.source.element,
        audioElement: opts.sampleElement ?? lead.source.element,
        lead,
      }];
    }

    for (const lane of lanes) {
      // One stream per LANE, keyed by its identity rather than by its position in a shared stream.
      // This is what makes a click local: pinning a slot, swapping a lane's element or adding a
      // second lane cannot disturb what any other lane already chose.
      const laneRng = makeRng(seedFrom(opts.seed, category, lane.audioElement));

      // One SAMPLE per lane: a lane is a single file. Which element that file comes from is either
      // fixed by the caller (borrowed timings) or follows the lead rule — and only in the latter
      // case does a rule's element decide anything, so only then are the section rules filtered.
      const samples = manifest[lane.audioElement]?.[category] ?? [];
      if (samples.length === 0) {
        noSample.push(lane.audioElement);
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
      if (manual) {
        // Taken over: exactly the timings chosen for this lane, in timeline order, and no others.
        // A section nobody chose is simply silent — going manual means what you see is what sounds.
        const mine = taken.filter((r) => !lane.ruleElement || r.source.element === lane.ruleElement);
        for (const mode of SECTION_ORDER) {
          for (const r of mine.filter((x) => x.section === mode)) {
            chosen.push({ rule: r, poolSize: forSections.filter((x) => x.section === mode).length });
          }
        }
      } else if (opts.section) {
        chosen.push({ rule: lane.lead, poolSize: cands.length });
      } else {
        for (const mode of SECTION_ORDER) {
          const inSection = forSections.filter((r) => r.section === mode);
          if (inSection.length === 0) continue; // absence is allowed — no repair
          chosen.push({
            rule: inSection[Math.floor(laneRng.float() * inSection.length)],
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

      // A fanning category sounds its element's samples TOGETHER; every other draws one of them.
      const fans = FANS_OUT.has(category);
      const voices = fans
        ? samples.slice(0, FAN_OUT_MAX)
        : [samples[Math.floor(laneRng.float() * samples.length)]];

      for (const sample of voices) {
        const track: ArrTrack = {
          // A lane is category × element, so the id carries both — and carries them even when there
          // is only one lane, because an id that changed shape when a sibling appeared would lose
          // this lane's mute state and make the engine reload it mid-session. A fanning category
          // carries the sample too, for the same reason and one more: keyed on the body rather than
          // on a slot, your mute and level follow THAT planet across a redraw. It carries it even
          // where the element ships a single sample, so the shape never depends on the count.
          id: fans
            ? `${category}·${lane.audioElement}·${sample.name}`
            : `${category}·${lane.audioElement}`,
          category,
          label: `${drawn[0].rule.variant ?? category} · ${titleCase(lane.audioElement)}`
            + (fans ? ` · ${titleCase(sample.name)}` : ''),
          sample: { name: sample.name, path: sample.path, bytes: sample.bytes },
          ceilingDb: config.audio.volume.defaultTrackDb,
          locked: false,
        };
        tracks.push(track);
        // Every voice takes the SAME timings — one rule, laid on each of them, so the pair sounds
        // as one gesture and a single chip lights for both.
        for (const c of drawn) {
          picks.push({ track, rule: c.rule, poolSize: c.poolSize });
          for (const r of c.regions) regions.push({ ...r, trackId: track.id });
        }
      }
    }

    // Kept even when other lanes of the category survived: it is the only thing explaining why a
    // chip you can see never produces a lane.
    if (noSample.length > 0) {
      warnings.push(`${category}: no ${noSample.join(', ')} sample — those lanes skipped`);
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

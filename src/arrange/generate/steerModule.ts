import { config as defaultConfig, type EcosonicConfig } from '@/config';
import type { Category } from '@/types';
import type { ArrTrack, Drift, Mode, TemplateRegion } from '@/arrange/types';
import { STACK_ORDER, BED_CATEGORIES } from '@/arrange/types';
import { makeRng } from '@/arrange/prng';
import { sampleRange } from '@/arrange/generate/generateModeTemplate';

/** Steering verbs (spec §3): bring an eligible layer in ~now, or push a pending one later. */
export type SteerNudge =
  | { kind: 'IN_NEXT'; trackId: string }
  | { kind: 'HOLD_BACK'; trackId: string };

/** How soon an IN_NEXT entrance lands after the nudge (sec). */
export const IN_NEXT_DELAY_SEC = 1;
/** How far a HOLD_BACK pushes a pending entrance (sec) — the brief's minute-scale cadence. */
export const HOLD_BACK_STEP_SEC = 60;
/** A pending layer needs at least this much room left, or it is dropped for the pass (non-bed). */
export const SQUEEZE_MIN_WIDTH_SEC = 30;

/** Splice a live steer into the module at the playhead. Pure and seeded.
 *  Past regions are verbatim; active regions keep their entrance and redraw exit/fadeOut;
 *  pending layers redraw fully at the current drift (ordering enforced against the actual,
 *  possibly historical, entrances). A plain steer never adds a layer; IN_NEXT can. */
export function steerModule(
  regions: TemplateRegion[],
  playheadSec: number,
  tracks: ArrTrack[],
  mode: Mode,
  drift: Drift,
  seed: number,
  nudge?: SteerNudge,
  cfg: EcosonicConfig = defaultConfig,
): TemplateRegion[] {
  const rng = makeRng(seed);
  const D = cfg.layerTwo.moduleSeconds;
  const t = Math.max(0, Math.min(playheadSec, D));
  const gen = cfg.layerTwo.generation;
  const rule = gen.modeRules[mode];
  const scale = gen.driftScales[drift];
  const minGap = gen.minGapSec;
  const secondEnter = cfg.layerTwo.secondElementEnterSec;

  const byTrack = new Map(regions.map((r) => [r.trackId, r]));
  const out = new Map<string, TemplateRegion>();

  // Earliest committed entrance per category — the history redraws must respect (R2).
  const earliestEnter = new Map<Category, number>();
  const note = (cat: Category, enter: number) =>
    earliestEnter.set(cat, Math.min(earliestEnter.get(cat) ?? Infinity, enter));

  // 1. Keep the past verbatim; keep active regions' entrances (their exits redraw below).
  for (const tr of tracks) {
    const r = byTrack.get(tr.id);
    if (!r || r.enterSec > t) continue;
    out.set(tr.id, { ...r });
    note(tr.category, r.enterSec);
  }

  // 2. Redraw active regions' future events (exit + fadeOut) within the grammar, clamped ≥ t.
  for (const tr of tracks) {
    const r = out.get(tr.id);
    const lr = rule[tr.category];
    if (!r || !lr || r.exitSec <= t) continue; // past stays byte-for-byte
    const exit = lr.exit === 'MODULE_END' ? D : Math.min(D, Math.max(t, sampleRange(lr.exit, scale, rng, D)));
    const fadeOut = sampleRange(lr.fadeOut, scale, rng, D);
    const half = (exit - r.enterSec) / 2;
    out.set(tr.id, { ...r, exitSec: Math.max(r.enterSec, exit), fadeOutSec: Math.min(fadeOut, half) });
  }

  // 3. Redraw pending layers bottom-up so `after` references (historical or freshly drawn) exist.
  const seenElementish: Partial<Record<Category, number>> = {};
  for (const tr of tracks) {
    if ((tr.category === 'ELEMENT' || tr.category === 'ELEMENT_SUB') && out.has(tr.id)) {
      seenElementish[tr.category] = (seenElementish[tr.category] ?? 0) + 1;
    }
  }
  for (const cat of STACK_ORDER) {
    for (const tr of tracks) {
      if (tr.category !== cat || out.has(tr.id)) continue;
      const lr = rule[cat];
      if (!lr) continue;
      const isInNext = nudge?.kind === 'IN_NEXT' && nudge.trackId === tr.id;
      if (!byTrack.has(tr.id) && !isInNext) continue; // plain steers never add layers

      let enter: number;
      if (isInNext) {
        enter = t + IN_NEXT_DELAY_SEC; // pinned — eligibility is nudgeOptions' job
      } else {
        enter = Math.max(t + IN_NEXT_DELAY_SEC, sampleRange(lr.enter, scale, rng, D));
        const ref = lr.after ? earliestEnter.get(lr.after) : undefined;
        if (ref !== undefined) enter = Math.max(enter, ref + minGap);
        if (nudge?.kind === 'HOLD_BACK' && nudge.trackId === tr.id) enter += HOLD_BACK_STEP_SEC;
        const isElementish = cat === 'ELEMENT' || cat === 'ELEMENT_SUB';
        if (isElementish && (seenElementish[cat] ?? 0) >= 1) enter = Math.max(enter, secondEnter);
      }

      const exitDrawn = lr.exit === 'MODULE_END' ? D : Math.min(D, sampleRange(lr.exit, scale, rng, D));
      const exit = Math.max(enter, exitDrawn);
      // Squeeze rule: too little room left → drop (non-bed) or clamp to the minimum window (bed).
      if (exit - enter < SQUEEZE_MIN_WIDTH_SEC) {
        if (!BED_CATEGORIES.includes(cat)) continue;
        enter = Math.max(t, Math.min(enter, D - SQUEEZE_MIN_WIDTH_SEC));
      }
      const fadeIn = sampleRange(lr.fadeIn, scale, rng, D);
      const fadeOut = sampleRange(lr.fadeOut, scale, rng, D);
      const width = Math.max(0, (lr.exit === 'MODULE_END' ? D : exit) - enter);
      if (cat === 'ELEMENT' || cat === 'ELEMENT_SUB') seenElementish[cat] = (seenElementish[cat] ?? 0) + 1;
      note(cat, enter);
      out.set(tr.id, {
        trackId: tr.id,
        enterSec: enter,
        exitSec: Math.max(enter, lr.exit === 'MODULE_END' ? D : exit),
        fadeInSec: Math.min(fadeIn, width / 2),
        fadeOutSec: Math.min(fadeOut, width / 2),
      });
    }
  }

  // Stable output order: keep the input's region order, append newly added layers at the end.
  const order = new Map(regions.map((r, i) => [r.trackId, i]));
  return [...out.values()].sort(
    (a, b) => (order.get(a.trackId) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.trackId) ?? Number.MAX_SAFE_INTEGER),
  );
}

/** Which nudges are legal for a track right now (drives the UI buttons and guards the store). */
export function nudgeOptions(
  track: ArrTrack,
  regions: TemplateRegion[],
  tracks: ArrTrack[],
  mode: Mode,
  playheadSec: number,
  cfg: EcosonicConfig = defaultConfig,
): { inNext: boolean; holdBack: boolean } {
  const lr = cfg.layerTwo.generation.modeRules[mode][track.category];
  if (!lr) return { inNext: false, holdBack: false };
  const r = regions.find((x) => x.trackId === track.id);
  if (r && r.enterSec <= playheadSec) return { inNext: false, holdBack: false }; // already in (or done)
  const room = playheadSec + IN_NEXT_DELAY_SEC <= cfg.layerTwo.moduleSeconds - SQUEEZE_MIN_WIDTH_SEC;
  let afterOk = true;
  if (lr.after) {
    const catOf = new Map(tracks.map((tr) => [tr.id, tr.category]));
    afterOk = regions.some((x) => catOf.get(x.trackId) === lr.after && x.enterSec <= playheadSec);
  }
  return { inNext: room && afterOk, holdBack: room && !!r };
}

/** What the rules are currently DOING, computed from the shipped material.
 *
 *  A rulebook that only says what the rules mean is a document. These functions let the page put
 *  each rule beside the data it governs, which is the difference between reading §3.6 and *seeing*
 *  that ETHER ships no ELEMENT_SUB sample.
 *
 *  Pure: everything comes in as an argument, so the page passes the real manifest and store and the
 *  tests pass fixtures. */
import { ELEMENTS, type Category, type ElementName, type Manifest } from '@/types';
import type { EcosonicConfig } from '@/config';
import type { RuleStore } from '@/remix/sessionRules';
import { STACK_ORDER, type Mode } from '@/arrange/types';

export const flattenRules = (store: RuleStore) =>
  Object.values(store).flatMap((docs) => docs.flatMap((d) => d.rules));

/** One category × element cell: what is authored, what is shipped, and whether it can sound. */
export interface CoverageCell {
  element: ElementName;
  rules: number;
  samples: number;
  /** Authored and playable. */
  sounds: boolean;
  /** Authored but unplayable — the §3.6 gap. The draw skips these; they are the ones to fix. */
  dead: boolean;
  /** Shipped but never authored — audio no rule can reach (§2.7). */
  unused: boolean;
}

export interface CoverageRow { category: Category; cells: CoverageCell[]; deadCount: number }

/** The §3.6 table, computed rather than remembered. */
export function coverageMatrix(store: RuleStore, manifest: Manifest): CoverageRow[] {
  const rules = flattenRules(store);
  return STACK_ORDER.map((category) => {
    const cells = ELEMENTS.map((element) => {
      const n = rules.filter((r) => r.category === category && r.source.element === element).length;
      const samples = (manifest[element]?.[category] ?? []).length;
      return {
        element,
        rules: n,
        samples,
        sounds: n > 0 && samples > 0,
        dead: n > 0 && samples === 0,
        unused: n === 0 && samples > 0,
      };
    });
    return { category, cells, deadCount: cells.filter((c) => c.dead).length };
  });
}

/** §3.5a — the bodies each element actually ships, which is what the pair of lanes plays. */
export function planetPairs(manifest: Manifest): { element: ElementName; bodies: string[] }[] {
  return ELEMENTS.map((element) => ({
    element,
    bodies: (manifest[element]?.PLANET ?? []).map((s) => s.name),
  }));
}

const SECTIONS: Mode[] = ['INTRODUCTION', 'DEEP_RELAXATION', 'RETURN'];

/** §2.3 — where each element actually opens each section. AIR disagrees with everyone, and that
 *  disagreement is authored data rather than a section index × 600. */
export function sectionWindows(
  store: RuleStore,
): { element: ElementName; starts: (number | null)[] }[] {
  const rules = flattenRules(store);
  return ELEMENTS.map((element) => ({
    element,
    starts: SECTIONS.map((section) => {
      const mine = rules.filter((r) => r.source.element === element && r.section === section);
      return mine.length > 0 ? Math.min(...mine.map((r) => r.sectionStartSec)) : null;
    }),
  }));
}

/** §5a.1 and the per-category starting level — where a freshly drawn track sits before you touch it. */
export function categoryDefaults(
  cfg: EcosonicConfig,
): { category: Category; db: number; reverb: number; delay: number; notable: boolean }[] {
  const { defaultTrackDb, categoryDb } = cfg.audio.volume;
  const sends = cfg.audio.effects.defaultSends;
  return STACK_ORDER.map((category) => {
    const db = categoryDb[category] ?? defaultTrackDb;
    const s = sends[category] ?? { reverb: 0, delay: 0 };
    return {
      category,
      db,
      reverb: s.reverb,
      delay: s.delay,
      // Anything that does not start dry at unity — the rows worth looking at.
      notable: db !== defaultTrackDb || s.reverb > 0 || s.delay > 0,
    };
  });
}

export const SECTION_LABELS = ['Introduction', 'Deep Relaxation', 'Return'];

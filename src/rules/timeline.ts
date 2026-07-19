import { config as defaultConfig, type EcosonicConfig, type GenLayerRule } from '@/config';
import type { Mode } from '@/arrange/types';
import type { Category } from '@/types';
import { CATEGORIES, type CandidateRule } from '@/rules/analysisSchema';

export interface LaneItem {
  category: Category;
  kind: CandidateRule['kind'];
  startSec: number;
  endSec: number | null;
  mark: 'bar' | 'tick';
  candidate: CandidateRule;
}

/** Place one candidate on the [0,D] axis. null if it has no structured start to anchor to. */
export function laneItem(candidate: CandidateRule, D: number): LaneItem | null {
  const patch = candidate.structured?.patch;
  if (!candidate.structured || !patch || patch.enter === null) return null;
  const startSec = Math.max(0, patch.enter.canon);
  const endSec = patch.exit === 'MODULE_END' ? D : (patch.exit?.canon ?? null);
  const mark: 'bar' | 'tick' = endSec !== null && endSec > startSec ? 'bar' : 'tick';
  return { category: candidate.structured.category, kind: candidate.kind, startSec, endSec, mark, candidate };
}

/** The grammar's expected active window for a layer in a mode. null if the layer is absent there. */
export function ghostBand(rule: GenLayerRule | undefined, D: number): { startSec: number; endSec: number } | null {
  if (!rule) return null;
  return { startSec: rule.enter.canon, endSec: rule.exit === 'MODULE_END' ? D : rule.exit.canon };
}

/** Grammar rule for a mode+category (source for ghost bands). undefined = layer absent in that mode. */
export function ruleFor(mode: Mode, category: Category, cfg: EcosonicConfig = defaultConfig): GenLayerRule | undefined {
  return cfg.layerTwo.generation.modeRules[mode][category];
}

/** Split candidates into per-category lanes (stack order) plus the untimed remainder. */
export function partition(
  candidates: CandidateRule[], D: number,
): { lanes: Array<{ category: Category; items: LaneItem[] }>; untimed: CandidateRule[] } {
  const byCat = new Map<Category, LaneItem[]>();
  const untimed: CandidateRule[] = [];
  for (const c of candidates) {
    const item = laneItem(c, D);
    if (!item) { untimed.push(c); continue; }
    const list = byCat.get(item.category) ?? [];
    list.push(item);
    byCat.set(item.category, list);
  }
  const lanes = CATEGORIES.filter((cat) => byCat.has(cat)).map((category) => ({ category, items: byCat.get(category)! }));
  return { lanes, untimed };
}

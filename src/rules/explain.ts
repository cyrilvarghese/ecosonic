import { config as defaultConfig, type EcosonicConfig, type GenLayerRule, type GenRange } from '@/config';
import type { CandidateRule } from '@/rules/analysisSchema';
import { PRINCIPLES, INVARIANTS } from '@/rules/inventory';

const VERDICT: Record<CandidateRule['kind'], string> = {
  confirms: 'Confirms', contradicts: 'Contradicts', novel: 'New',
};
const MODE_LABEL: Record<string, string> = {
  INTRODUCTION: 'Introduction', DEEP_RELAXATION: 'Deep Relaxation', RETURN: 'Return',
};
// enter/exit read as an absolute clock time; fadeIn/fadeOut read as a duration.
const FIELD_VERB: Record<string, string> = {
  enter: 'enter', exit: 'exit', fadeIn: 'fade in over', fadeOut: 'fade out over',
};
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function grammarPhrase(mode: string, category: string, field: string, cfg: EcosonicConfig): string | null {
  const modeRules = cfg.layerTwo.generation.modeRules as unknown as Record<string, Record<string, GenLayerRule | undefined>>;
  const rule = modeRules[mode]?.[category];
  const label = MODE_LABEL[mode] ?? mode;
  if (!rule) return `${label} has no ${category} rule`;
  if (field === 'present') return `${label} expects ${category} present ~${Math.round(rule.present * 100)}% of the section`;
  if (field === 'after') return rule.after ? `${label} expects ${category} to follow ${rule.after}` : null;
  const verb = FIELD_VERB[field];
  if (!verb) return null;
  const v = (rule as unknown as Record<string, GenRange | 'MODULE_END' | undefined>)[field];
  if (v === undefined) return null;
  if (v === 'MODULE_END') return `${label} expects ${category} to run to the end`;
  const val = field === 'fadeIn' || field === 'fadeOut' ? `${Math.round(v.canon)}s` : `~${clock(v.canon)}`;
  return `${label} expects ${category} to ${verb} ${val} (±${Math.round(v.half)}s)`;
}

/** Turn a `relatedRule` token + verdict into a readable sentence. Pure.
 *  `grammar:MODE.CATEGORY.field` → the grammar's expectation; `R#`/`I#` → the principle's own words. */
export function explainRule(
  relatedRule: string | null, kind: CandidateRule['kind'], cfg: EcosonicConfig = defaultConfig,
): string {
  const verdict = VERDICT[kind];
  if (!relatedRule) return verdict;
  if (relatedRule.startsWith('grammar:')) {
    const [mode, category, field] = relatedRule.slice('grammar:'.length).split('.');
    const phrase = grammarPhrase(mode, category, field, cfg);
    return `${verdict} — ${phrase ?? relatedRule}`;
  }
  const principle = [...PRINCIPLES, ...INVARIANTS].find((r) => r.id === relatedRule);
  if (principle) return `${verdict} — ${principle.id} ${principle.title}: ${principle.text}`;
  return `${verdict} — ${relatedRule}`;
}

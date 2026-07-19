import { config as defaultConfig, type EcosonicConfig, type GenLayerRule, type GenRange } from '@/config';
import type { Mode } from '@/arrange/types';
import { stackIndex } from '@/arrange/types';
import type { Category } from '@/types';
import type { AnalysisResult, CandidateRule, Observation, PatchWireT } from '@/rules/analysisSchema';
import { INVARIANTS, PRINCIPLES } from '@/rules/inventory';

const TIMING_FIELDS = ['enter', 'exit', 'fadeIn', 'fadeOut'] as const;

const toCanon = (v: GenRange | 'MODULE_END', D: number): { canon: number; half: number } =>
  v === 'MODULE_END' ? { canon: D, half: 30 } : v;

/** Per-field grammar comparison. Any out-of-tolerance field → contradicts; else ≥1 in-tolerance
 *  field → confirms; nothing comparable → null (caller falls through to novel). */
function compareToGrammar(
  patch: PatchWireT, rule: GenLayerRule, mode: Mode, category: string, D: number,
): { kind: 'confirms' | 'contradicts'; relatedRule: string } | null {
  let confirmed: string | null = null;
  for (const f of TIMING_FIELDS) {
    const seen = patch[f];
    if (seen === null) continue;
    const o = toCanon(seen, D);
    const r = toCanon(rule[f], D);
    const ref = `grammar:${mode}.${category}.${f}`;
    if (Math.abs(o.canon - r.canon) > Math.max(30, r.half)) return { kind: 'contradicts', relatedRule: ref };
    confirmed ??= ref;
  }
  if (patch.present !== null) {
    const ref = `grammar:${mode}.${category}.present`;
    if (Math.abs(patch.present - rule.present) > 0.25) return { kind: 'contradicts', relatedRule: ref };
    confirmed ??= ref;
  }
  if (patch.after !== null && rule.after) {
    const ref = `grammar:${mode}.${category}.after`;
    if (patch.after !== rule.after) return { kind: 'contradicts', relatedRule: ref };
    confirmed ??= ref;
  }
  return confirmed ? { kind: 'confirms', relatedRule: confirmed } : null;
}

/** Prose can only be topic-LINKED (keyword hit), never confirmed — text cannot prove direction. */
function topicLink(text: string): string | null {
  const lower = text.toLowerCase();
  for (const r of [...PRINCIPLES, ...INVARIANTS]) {
    if (r.keywords.length > 0 && r.keywords.every((k) => lower.includes(k))) return r.id;
  }
  return null;
}

/** Cross-observation R2 check: within each section group, structured enters must not invert the
 *  stack order. One synthesized candidate per offending/confirming group. */
function orderingCheck(
  observations: Observation[], modeFor: (o: Observation) => Mode | null,
): CandidateRule[] {
  const groups = new Map<number | 'none', Array<{ category: Category; enter: number; o: Observation }>>();
  for (const o of observations) {
    const enter = o.structured?.patch.enter;
    if (!o.structured || enter === null || enter === undefined) continue;
    const key = o.sectionIndex ?? 'none';
    const list = groups.get(key) ?? [];
    list.push({ category: o.structured.category, enter: enter.canon, o });
    groups.set(key, list);
  }
  const out: CandidateRule[] = [];
  for (const [, list] of groups) {
    if (list.length < 2) continue;
    const mode = modeFor(list[0].o);
    const sectionIndex = list[0].o.sectionIndex;
    let violation: string | null = null;
    for (const a of list) {
      for (const b of list) {
        if (stackIndex(a.category) < stackIndex(b.category) && a.enter > b.enter + 30) {
          violation = `${b.category} (enters ~${Math.round(b.enter)}s) precedes ${a.category} (~${Math.round(a.enter)}s), inverting the stack order`;
        }
      }
    }
    const base = {
      layer: null, sectionIndex, structured: null, evidence: [], confidence: 1, mode,
      relatedRule: 'R2' as const,
    };
    if (violation) {
      out.push({ ...base, text: violation, kind: 'contradicts' });
    } else if (new Set(list.map((e) => e.category)).size >= 3) {
      out.push({ ...base, text: 'Layers enter bottom-up in stack order', kind: 'confirms' });
    }
  }
  return out;
}

/** If the model sub-sectioned the window, structured `enter`/`exit` are relative to the sub-section
 *  start (per the prompt) — resolve them to absolute window time. `fadeIn`/`fadeOut` are durations,
 *  not positions, so they are left unshifted. No-op when there are no sections or the section starts
 *  at 0. */
function toAbsolute(o: Observation, sections: AnalysisResult['sections']): Observation {
  if (!o.structured || o.sectionIndex === null || !sections
    || o.sectionIndex < 1 || o.sectionIndex > sections.length) return o;
  const start = sections[o.sectionIndex - 1].startSec;
  if (start === 0) return o;
  const p = o.structured.patch;
  return {
    ...o,
    structured: {
      ...o.structured,
      patch: {
        ...p,
        enter: p.enter ? { canon: p.enter.canon + start, half: p.enter.half } : null,
        exit: p.exit && p.exit !== 'MODULE_END' ? { canon: p.exit.canon + start, half: p.exit.half } : p.exit,
      },
    },
  };
}

/** Classify blind observations against ONE known mode's house rules — deterministic, pure. */
export function classifyObservations(
  result: AnalysisResult, mode: Mode, cfg: EcosonicConfig = defaultConfig,
): CandidateRule[] {
  const observations = result.observations.map((o) => toAbsolute(o, result.sections));
  const modeFor = (): Mode => mode;
  const D = cfg.layerTwo.moduleSeconds;

  const out: CandidateRule[] = observations.map((o) => {
    if (o.structured) {
      const rule = cfg.layerTwo.generation.modeRules[mode][o.structured.category];
      const verdict = rule
        ? compareToGrammar(o.structured.patch, rule, mode, o.structured.category, D)
        : null;
      if (verdict) return { ...o, ...verdict, mode };
      return { ...o, kind: 'novel', relatedRule: null, mode };
    }
    return { ...o, kind: 'novel', relatedRule: topicLink(o.text), mode };
  });

  out.push(...orderingCheck(observations, modeFor));
  return out;
}

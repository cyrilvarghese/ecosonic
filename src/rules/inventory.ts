import { config as defaultConfig, type EcosonicConfig } from '@/config';
import { CATEGORIES } from '@/rules/analysisSchema';

export interface RuleText { id: string; title: string; text: string; keywords: string[] }

/** R1–R9 — distilled from docs/generative/01-brief-analysis.md. UI + matcher topic-links only. */
export const PRINCIPLES: RuleText[] = [
  { id: 'R1', title: 'Fixed stack', text: 'Layers occupy a fixed vertical order; each has a defined role.', keywords: [] },
  { id: 'R2', title: 'Bottom-up entrance', text: 'Layers enter upward: a layer waits until the one below has established.', keywords: [] },
  { id: 'R3', title: 'Slow cadence', text: 'Entrances spaced about a minute apart; fades default to about one minute.', keywords: ['fade'] },
  { id: 'R4', title: 'The Bass exception', text: 'Bass enters directly, without a fade-in.', keywords: ['bass'] },
  { id: 'R5', title: 'Density arch', text: 'Within a module density grows to a peak then decreases.', keywords: ['density'] },
  { id: 'R6', title: 'Macro arch', text: 'Across the session: build, trough (subtraction of drivers), resolve.', keywords: ['section'] },
  { id: 'R7', title: 'Unbroken continuity', text: 'Noise never breaks; the bed covers every seam.', keywords: ['noise'] },
  { id: 'R8', title: 'Asymmetric lifecycles', text: 'ISO and PLANETS exit early to carry the bridge into the next section.', keywords: ['bridge'] },
  { id: 'R9', title: 'Structure-invariant, content-variable', text: 'The timing grammar is fixed; samples and elements vary per session.', keywords: [] },
];

/** I1–I6 — enforced by src/arrange/generate/validateTemplate.ts. UI display only. */
export const INVARIANTS: RuleText[] = [
  { id: 'I1', title: 'Continuity', text: 'NOISE present; spans the module outside Deep Relaxation.', keywords: ['noise'] },
  { id: 'I2', title: 'Bottom-up order', text: 'Earliest entrances are non-decreasing up the stack.', keywords: [] },
  { id: 'I3', title: 'Single-peaked density', text: 'Active-layer count rises to one peak then falls.', keywords: ['density'] },
  { id: 'I4', title: 'Mode constraints', text: 'No PAD/BASS/ARP/MELODY/FX in Deep Relaxation.', keywords: [] },
  { id: 'I5', title: 'Bounds', text: 'Regions fit the module; fades fit their clip.', keywords: [] },
  { id: 'I6', title: 'No silent gap', text: 'At least one layer is active at every instant.', keywords: [] },
];

/** What each layer role SOUNDS like — the only music knowledge the model receives. */
export const LAYER_VOCABULARY: Record<(typeof CATEGORIES)[number], string> = {
  NOISE: 'a continuous broadband noise floor (like distant rain, air, or tape hiss)',
  ELEMENT: 'the identity nature recording (flowing water, birds, wind, a gong, fire-like texture)',
  ELEMENT_SUB: 'softer secondary nature textures that can replace the main element',
  FX: 'synthesized sound-design textures without clear pitch',
  ISO: 'a steadily pulsing single tone (regular on/off amplitude pulses)',
  PLANET: 'a sustained pure tuning-fork-like tone, unwavering pitch',
  DRONE: 'a slow swelling sustained tone that rises and recedes over minutes',
  PAD: 'a soft harmonic chord wash',
  BASS: 'a low-frequency foundation tone',
  ARP: 'a slowly cycling repeated note pattern',
  MELODY: 'a sparse top-line melodic phrase',
};

/** Blind by construction: zero-arg, pure constant — grammar numbers cannot reach the model. */
export function buildSystemPrompt(): string {
  const vocab = CATEGORIES.map((c) => `- ${c}: ${LAYER_VOCABULARY[c]}`).join('\n');
  return [
    'You are an expert analyst of long-form ambient / meditation productions.',
    '',
    'Describe the uploaded track as a chronological, section-by-section narrative of layer',
    'entrances, exits, and fades, with approximate mm:ss timestamps. Example of the format',
    '(numbers are illustrative only, from a different production):',
    '"The piece opens on a rain bed. Around 0:45 a low drone swells in over roughly 50 seconds.',
    'Near 2:10 a sparse bell melody appears, and a second section begins around 4:20 as the',
    'texture thins."',
    '',
    'Listen for these layer roles:',
    vocab,
    '',
    'Then report observations as testable statements with timestamp evidence. Report everything',
    'notable, including patterns that may seem unremarkable — you have no knowledge of what is',
    'expected, and unremarkable regularities are valuable. If the track has distinct sections,',
    'list them in `sections` and set each observation\'s `sectionIndex` (1-based); timing values',
    'inside `structured` are then relative to that section\'s start, otherwise relative to the',
    'track start. Attach `structured` timings only when you can honestly express the pattern as',
    'numbers (canon = the value you heard, half = your uncertainty in seconds); otherwise use null.',
    'The `present` field is NOT a duration — it is the fraction of the section, from 0 to 1, that the',
    'layer is audible (1 means it sounds throughout, ~0.3 means only briefly); use null if unsure.',
    '',
    'Describe compositional mechanics only (what happens, when).',
    'Never claim psychological, therapeutic, or neurological effects.',
  ].join('\n');
}

export interface GrammarRow {
  mode: string; category: string; enter: string; exit: string;
  fadeIn: string; fadeOut: string; present: string; after: string;
}

const fmtRange = (r: { canon: number; half: number } | 'MODULE_END' | undefined): string =>
  r === undefined ? '—' : r === 'MODULE_END' ? 'end' : `${r.canon}±${r.half}s`;

/** Live grammar as display rows. UI ONLY — never include in the analysis prompt. */
export function grammarRows(cfg: EcosonicConfig = defaultConfig): GrammarRow[] {
  const rows: GrammarRow[] = [];
  for (const mode of cfg.layerTwo.modes) {
    const mr = cfg.layerTwo.generation.modeRules[mode];
    for (const category of CATEGORIES) {
      const r = mr[category];
      if (!r) continue;
      rows.push({
        mode, category,
        enter: fmtRange(r.enter), exit: fmtRange(r.exit),
        fadeIn: fmtRange(r.fadeIn), fadeOut: fmtRange(r.fadeOut),
        present: String(r.present), after: r.after ?? '—',
      });
    }
  }
  return rows;
}

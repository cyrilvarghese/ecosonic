# Rule Discovery Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `/rules` page where the designer uploads a reference track, gets a brief-style description plus candidate composition rules (classified confirms/contradicts/novel against the house grammar by a **local matcher**, never by the model), and gates each rule through Keep (registry file) and Promote (surgical write into the live grammar).

**Architecture:** The model is **blind** — its prompt contains only the 11-layer sonic vocabulary and a format contract (`buildSystemPrompt()` takes no arguments, so it structurally cannot leak grammar numbers). One `POST /api/analyze` route base64s the upload into an OpenAI `gpt-audio-1.5` chat completion with a strict JSON schema, zod-parses the raw observations, and runs `classifyObservations()` locally. Keep/Promote go through `POST/PATCH /api/rules` onto `config/discovered-rules.json` and (promote only) a zod-validated merge into `config/ecosonic.config.json`.

**Tech Stack:** Next.js 16 App Router route handlers (Web `Request`/`Response`, `runtime = 'nodejs'`), plain `fetch` to OpenAI (no new dependencies), Zod 4, Vitest 4 (`npx vitest run <file>`; route tests use `// @vitest-environment node`), React 19 client components.

**Spec:** [docs/superpowers/specs/2026-07-15-rule-discovery-page-design.md](../specs/2026-07-15-rule-discovery-page-design.md)

## Global Constraints

- **Blind extraction:** `buildSystemPrompt(): string` takes **no parameters**; the prompt never contains grammar numbers, R/I rule texts, or the TRACK INFO exemplar. Classification is local (`src/rules/match.ts`).
- **Keep = registry only; Promote = second gate.** Promote validates the **entire merged config** with `ConfigSchema` before writing; on failure the config file is untouched (byte-equal).
- **Guardrail sentence (verbatim in prompt):** "Describe compositional mechanics only (what happens, when). Never claim psychological, therapeutic, or neurological effects."
- **No new npm dependencies.** OpenAI via `fetch`; ids via `node:crypto` `randomUUID`.
- **`OPENAI_API_KEY`** lives in `.env.local` (untracked). Never commit a key. Routes needing fs/env export `const runtime = 'nodejs'`.
- **Category vocabulary (11, exact):** `NOISE, ELEMENT, ELEMENT_SUB, FX, ISO, PLANET, DRONE, PAD, BASS, ARP, MELODY`.
- **Dirty-file rule:** the working tree has unrelated user edits in `next-env.d.ts`, `next.config.ts`, `package.json`, `src/app/globals.css`, `src/arrange/arrangementStore.ts`, `src/arrange/useLayer2Engine.ts`, `src/components/TrackLane.tsx`, `src/components/layer2/ModuleDesigner.tsx`, `src/components/ui/slider.tsx`. **Never modify or `git add` these files.** Each commit stages only the files listed in its step.
- **AGENTS.md guard:** this Next version's route-handler conventions were verified against `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md` — handlers are plain exported functions over Web `Request`/`Response` (`Response.json(...)`), context `params` is a Promise. Before Task 8 (page/components), skim `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`.

## File Structure

| File | Responsibility |
|---|---|
| `config/ecosonic.config.json` | **Modify:** add top-level `analysis` block |
| `config/discovered-rules.json` | **Create:** seeded `[]` registry |
| `src/config.ts` | **Modify:** `analysis` zod schema |
| `src/config.test.ts` | **Modify:** fixture + 2 tests |
| `src/rules/analysisSchema.ts` | Wire types (zod) + hand-written OpenAI strict JSON schema |
| `src/rules/inventory.ts` | R1–R9/I1–I6 texts (UI+matcher), layer vocabulary, blind prompt, grammar rows (UI only) |
| `src/rules/match.ts` | Local deterministic classifier |
| `src/rules/registry.ts` | Registry file read/append/remove/status (path via `ECOSONIC_RULES_PATH` for tests) |
| `src/rules/promote.ts` | Merge + validate + write config (path via `ECOSONIC_CONFIG_PATH` for tests) |
| `src/app/api/analyze/route.ts` | GET readiness, POST analyze |
| `src/app/api/rules/route.ts` | GET/POST/PATCH registry |
| `src/app/rules/page.tsx` + `src/components/rules/{RuleLibrary,AnalyzePanel,CandidateCard}.tsx` | The page |
| `src/components/layer2/ArrangeScreen.tsx` | **Modify:** header link to `/rules` (file is clean — safe to stage) |
| `docs/PRD.md` | **Modify:** `/rules` row in §4 route table |

---

### Task 1: Config `analysis` block + seeded registry file

**Files:**
- Modify: `config/ecosonic.config.json` (top-level key after `"motion"`)
- Modify: `src/config.ts` (schema)
- Modify: `src/config.test.ts` (fixture + tests)
- Create: `config/discovered-rules.json`

**Interfaces:**
- Produces: `config.analysis.model: string`, `config.analysis.maxUploadBytes: number`; registry file seeded `[]`.

- [ ] **Step 1: Write the failing tests** — in `src/config.test.ts`, add inside `describe('config', …)`:

```ts
  it('parses the analysis block', () => {
    expect(config.analysis.model).toBe('gpt-audio-1.5');
    expect(config.analysis.maxUploadBytes).toBe(26214400);
  });
  it('rejects a non-positive maxUploadBytes', () => {
    const bad = JSON.parse(JSON.stringify(valid));
    bad.analysis.maxUploadBytes = 0;
    expect(ConfigSchema.safeParse(bad).success).toBe(false);
  });
```

And add to the `valid` fixture object (sibling of `motion`, before `layerTwo`):

```ts
  analysis: { model: 'gpt-audio-1.5', maxUploadBytes: 26214400 },
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/config.test.ts`
Expected: FAIL — `config.analysis` undefined; `valid` fixture no longer parses (unknown/missing key handling: ConfigSchema has no `analysis`).

- [ ] **Step 3: Implement** — in `src/config.ts`, inside `ConfigSchema` after the `motion:` entry add:

```ts
  analysis: z.object({
    model: z.string().min(1),
    maxUploadBytes: z.number().int().positive(),
  }),
```

In `config/ecosonic.config.json`, after the `"motion": { … },` line add:

```json
  "analysis": { "model": "gpt-audio-1.5", "maxUploadBytes": 26214400 },
```

Create `config/discovered-rules.json` with exactly:

```json
[]
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/config.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add config/ecosonic.config.json config/discovered-rules.json src/config.ts src/config.test.ts
git commit -m "feat(rules): analysis config block + seeded discovered-rules registry"
```

---

### Task 2: `analysisSchema.ts` — wire types + OpenAI strict schema

**Files:**
- Create: `src/rules/analysisSchema.ts`
- Test: `src/rules/analysisSchema.test.ts`

**Interfaces:**
- Produces (used by Tasks 4–8):
  - `CATEGORIES` (11-tuple const), `MODES` (3-tuple const)
  - `ObservationSchema`/`Observation`, `AnalysisResultSchema`/`AnalysisResult`
  - `CandidateRuleSchema`/`CandidateRule` (= Observation + `kind`, `relatedRule: string|null`, `mode: Mode|null`)
  - `DiscoveredRuleSchema`/`DiscoveredRule` (= CandidateRule + `id`, `source{file,date,model}`, `status: 'kept'|'promoted'`), `RegistrySchema`
  - `OPENAI_ANALYSIS_JSON_SCHEMA` (plain object for `response_format.json_schema.schema`)
  - All optionality on the wire is `null`, never absent (OpenAI strict mode requires every key present).

- [ ] **Step 1: Write the failing test** — `src/rules/analysisSchema.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  AnalysisResultSchema, CandidateRuleSchema, DiscoveredRuleSchema,
  OPENAI_ANALYSIS_JSON_SCHEMA,
} from '@/rules/analysisSchema';

export const observationFixture = {
  text: 'A second nature layer enters around 5:00',
  layer: 'ELEMENT' as const,
  sectionIndex: 1,
  structured: {
    category: 'ELEMENT' as const,
    patch: { present: null, enter: { canon: 300, half: 30 }, exit: null, fadeIn: null, fadeOut: null, after: null },
  },
  evidence: [{ atSec: 305, note: 'second water texture becomes audible' }],
  confidence: 0.8,
};
export const resultFixture = {
  description: 'The track opens with a broadband noise floor…',
  sections: [
    { startSec: 0, label: 'build' }, { startSec: 600, label: 'still' }, { startSec: 1200, label: 'return' },
  ],
  observations: [observationFixture],
};

describe('analysisSchema', () => {
  it('accepts a full AnalysisResult fixture', () => {
    expect(AnalysisResultSchema.parse(resultFixture)).toEqual(resultFixture);
  });
  it('rejects confidence out of range and unknown layer', () => {
    expect(AnalysisResultSchema.safeParse({
      ...resultFixture,
      observations: [{ ...observationFixture, confidence: 1.5 }],
    }).success).toBe(false);
    expect(AnalysisResultSchema.safeParse({
      ...resultFixture,
      observations: [{ ...observationFixture, layer: 'KAZOO' }],
    }).success).toBe(false);
  });
  it('CandidateRule extends Observation with kind/relatedRule/mode', () => {
    const cand = { ...observationFixture, kind: 'novel', relatedRule: null, mode: 'INTRODUCTION' };
    expect(CandidateRuleSchema.parse(cand).kind).toBe('novel');
  });
  it('DiscoveredRule requires id/source/status', () => {
    const cand = { ...observationFixture, kind: 'confirms', relatedRule: 'grammar:INTRODUCTION.ELEMENT.enter', mode: 'INTRODUCTION' };
    const disc = { ...cand, id: 'x-1', source: { file: 'a.mp3', date: '2026-07-15T00:00:00.000Z', model: 'gpt-audio-1.5' }, status: 'kept' };
    expect(DiscoveredRuleSchema.parse(disc).status).toBe('kept');
    expect(DiscoveredRuleSchema.safeParse({ ...disc, status: 'archived' }).success).toBe(false);
  });
  it('OpenAI schema is strict-compatible: every object requires all its properties', () => {
    const check = (node: unknown): void => {
      if (typeof node !== 'object' || node === null) return;
      const o = node as Record<string, unknown>;
      if (o.type === 'object') {
        expect(o.additionalProperties).toBe(false);
        expect((o.required as string[]).sort()).toEqual(Object.keys(o.properties as object).sort());
      }
      for (const v of Object.values(o)) {
        if (Array.isArray(v)) v.forEach(check);
        else check(v);
      }
    };
    check(OPENAI_ANALYSIS_JSON_SCHEMA);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/rules/analysisSchema.test.ts`
Expected: FAIL — cannot find module `@/rules/analysisSchema`.

- [ ] **Step 3: Implement** — `src/rules/analysisSchema.ts`:

```ts
import { z } from 'zod';

/** The 11 layer roles, bottom→top of the stack. Single source for the wire vocabulary. */
export const CATEGORIES = [
  'NOISE', 'ELEMENT', 'ELEMENT_SUB', 'FX', 'ISO', 'PLANET', 'DRONE', 'PAD', 'BASS', 'ARP', 'MELODY',
] as const;
export const MODES = ['INTRODUCTION', 'DEEP_RELAXATION', 'RETURN'] as const;

const CategoryEnum = z.enum(CATEGORIES);
const GenRangeWire = z.object({ canon: z.number().nonnegative(), half: z.number().nonnegative() });
const ExitWire = z.union([GenRangeWire, z.literal('MODULE_END')]);

// Wire optionality is `null`, never absent — OpenAI strict structured outputs require every key.
const PatchWire = z.object({
  present: z.number().min(0).max(1).nullable(),
  enter: GenRangeWire.nullable(),
  exit: ExitWire.nullable(),
  fadeIn: GenRangeWire.nullable(),
  fadeOut: GenRangeWire.nullable(),
  after: CategoryEnum.nullable(),
});
export type PatchWireT = z.infer<typeof PatchWire>;

/** What the MODEL returns — raw, blind observation. No rule references, no classification. */
export const ObservationSchema = z.object({
  text: z.string().min(1),
  layer: CategoryEnum.nullable(),
  sectionIndex: z.number().int().min(1).nullable(), // 1-based; timings in `structured` are section-relative when set
  structured: z.object({ category: CategoryEnum, patch: PatchWire }).nullable(),
  evidence: z.array(z.object({ atSec: z.number().nonnegative(), note: z.string() })),
  confidence: z.number().min(0).max(1),
});
export type Observation = z.infer<typeof ObservationSchema>;

export const AnalysisResultSchema = z.object({
  description: z.string().min(1),
  sections: z.array(z.object({ startSec: z.number().nonnegative(), label: z.string() })).nullable(),
  observations: z.array(ObservationSchema),
});
export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;

/** Observation + LOCAL classification (src/rules/match.ts) — what the UI shows. */
export const CandidateRuleSchema = ObservationSchema.extend({
  kind: z.enum(['confirms', 'contradicts', 'novel']),
  relatedRule: z.string().nullable(), // 'R2' | 'I1' | 'grammar:INTRODUCTION.ISO.enter' | null
  mode: z.enum(MODES).nullable(),
});
export type CandidateRule = z.infer<typeof CandidateRuleSchema>;

/** A kept rule in config/discovered-rules.json. */
export const DiscoveredRuleSchema = CandidateRuleSchema.extend({
  id: z.string().min(1),
  source: z.object({ file: z.string(), date: z.string(), model: z.string() }),
  status: z.enum(['kept', 'promoted']),
});
export type DiscoveredRule = z.infer<typeof DiscoveredRuleSchema>;
export const RegistrySchema = z.array(DiscoveredRuleSchema);

// ---- OpenAI strict response schema (hand-written: strict mode needs additionalProperties:false
// and every property required; zod→JSONSchema emission isn't guaranteed to satisfy that). ----
const jRange = {
  type: 'object', additionalProperties: false,
  properties: { canon: { type: 'number' }, half: { type: 'number' } },
  required: ['canon', 'half'],
} as const;
const jRangeOrNull = { anyOf: [jRange, { type: 'null' }] } as const;
const jCategory = { type: 'string', enum: [...CATEGORIES] } as const;

export const OPENAI_ANALYSIS_JSON_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['description', 'sections', 'observations'],
  properties: {
    description: { type: 'string' },
    sections: {
      anyOf: [
        {
          type: 'array',
          items: {
            type: 'object', additionalProperties: false,
            properties: { startSec: { type: 'number' }, label: { type: 'string' } },
            required: ['startSec', 'label'],
          },
        },
        { type: 'null' },
      ],
    },
    observations: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['text', 'layer', 'sectionIndex', 'structured', 'evidence', 'confidence'],
        properties: {
          text: { type: 'string' },
          layer: { anyOf: [jCategory, { type: 'null' }] },
          sectionIndex: { anyOf: [{ type: 'integer' }, { type: 'null' }] },
          structured: {
            anyOf: [
              {
                type: 'object', additionalProperties: false,
                required: ['category', 'patch'],
                properties: {
                  category: jCategory,
                  patch: {
                    type: 'object', additionalProperties: false,
                    required: ['present', 'enter', 'exit', 'fadeIn', 'fadeOut', 'after'],
                    properties: {
                      present: { anyOf: [{ type: 'number' }, { type: 'null' }] },
                      enter: jRangeOrNull,
                      exit: { anyOf: [jRange, { type: 'string', enum: ['MODULE_END'] }, { type: 'null' }] },
                      fadeIn: jRangeOrNull,
                      fadeOut: jRangeOrNull,
                      after: { anyOf: [jCategory, { type: 'null' }] },
                    },
                  },
                },
              },
              { type: 'null' },
            ],
          },
          evidence: {
            type: 'array',
            items: {
              type: 'object', additionalProperties: false,
              properties: { atSec: { type: 'number' }, note: { type: 'string' } },
              required: ['atSec', 'note'],
            },
          },
          confidence: { type: 'number' },
        },
      },
    },
  },
} as const;
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/rules/analysisSchema.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/rules/analysisSchema.ts src/rules/analysisSchema.test.ts
git commit -m "feat(rules): analysis wire schemas + strict OpenAI response schema"
```

---

### Task 3: `inventory.ts` — rule texts, vocabulary, blind prompt

**Files:**
- Create: `src/rules/inventory.ts`
- Test: `src/rules/inventory.test.ts`

**Interfaces:**
- Produces:
  - `PRINCIPLES: RuleText[]` (R1–R9), `INVARIANTS: RuleText[]` (I1–I6), `interface RuleText { id: string; title: string; text: string; keywords: string[] }`
  - `LAYER_VOCABULARY: Record<(typeof CATEGORIES)[number], string>`
  - `buildSystemPrompt(): string` — **no parameters** (blindness is structural)
  - `grammarRows(cfg?: EcosonicConfig): GrammarRow[]` with `interface GrammarRow { mode: string; category: string; enter: string; exit: string; fadeIn: string; fadeOut: string; present: string; after: string }` — **UI only, never fed to the prompt**

- [ ] **Step 1: Write the failing test** — `src/rules/inventory.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { PRINCIPLES, INVARIANTS, LAYER_VOCABULARY, buildSystemPrompt, grammarRows } from '@/rules/inventory';
import { CATEGORIES } from '@/rules/analysisSchema';

describe('inventory', () => {
  it('has 9 principles and 6 invariants with ids', () => {
    expect(PRINCIPLES.map((r) => r.id)).toEqual(['R1','R2','R3','R4','R5','R6','R7','R8','R9']);
    expect(INVARIANTS.map((r) => r.id)).toEqual(['I1','I2','I3','I4','I5','I6']);
  });
  it('defines a sonic description for every category', () => {
    for (const c of CATEGORIES) expect(LAYER_VOCABULARY[c].length).toBeGreaterThan(10);
  });
  it('prompt teaches every layer and the guardrail, and takes no arguments (blind)', () => {
    expect(buildSystemPrompt.length).toBe(0); // zero-arg — cannot receive config
    const p = buildSystemPrompt();
    for (const c of CATEGORIES) expect(p).toContain(c);
    expect(p).toContain('Never claim psychological, therapeutic, or neurological effects');
    expect(p).toContain('sectionIndex');
  });
  it('prompt contains no house grammar values or rule texts', () => {
    const p = buildSystemPrompt();
    // Distinctive canonical numbers from the grammar tables must be absent.
    for (const n of ['540', '270', '390', '480', '570']) expect(p).not.toContain(n);
    expect(p).not.toContain('canonical');
    for (const r of [...PRINCIPLES, ...INVARIANTS]) expect(p).not.toContain(r.text.slice(0, 40));
  });
  it('grammarRows serializes the live grammar for the UI', () => {
    const rows = grammarRows();
    expect(rows.some((r) => r.mode === 'INTRODUCTION' && r.category === 'ISO')).toBe(true);
    expect(rows.some((r) => r.category === 'DRONE')).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/rules/inventory.test.ts`
Expected: FAIL — cannot find module `@/rules/inventory`.

- [ ] **Step 3: Implement** — `src/rules/inventory.ts`:

```ts
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
    '',
    'Describe compositional mechanics only (what happens, when). Never claim psychological,',
    'therapeutic, or neurological effects.',
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/rules/inventory.test.ts`
Expected: PASS (5 tests). If the no-grammar-numbers test fails, a forbidden number leaked into the prompt text — fix the prompt, not the test.

- [ ] **Step 5: Commit**

```bash
git add src/rules/inventory.ts src/rules/inventory.test.ts
git commit -m "feat(rules): rule inventory, layer vocabulary, structurally blind analysis prompt"
```

---

### Task 4: `match.ts` — local deterministic classifier

**Files:**
- Create: `src/rules/match.ts`
- Test: `src/rules/match.test.ts`

**Interfaces:**
- Consumes: `AnalysisResult`, `Observation`, `CandidateRule` (Task 2); `PRINCIPLES`, `INVARIANTS` (Task 3); `config`, `GenLayerRule`, `GenRange` (`@/config`); `stackIndex` (`@/arrange/types`).
- Produces: `classifyObservations(result: AnalysisResult, cfg?: EcosonicConfig): CandidateRule[]`.
- Behavior (from spec §6b): exactly-3 perceived sections map in order to modes; structured observations compare per-field against the grammar with tolerance `max(30, rule.half)` seconds (presence ±0.25; `after` equality) → confirms/contradicts with `relatedRule 'grammar:MODE.CAT.field'`; a cross-observation R2 ordering check per section group; everything else **novel** (prose gets a topic `relatedRule` link but stays novel — text cannot verify agreement direction).

- [ ] **Step 1: Write the failing test** — `src/rules/match.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { classifyObservations } from '@/rules/match';
import type { AnalysisResult, Observation } from '@/rules/analysisSchema';

const patch = (over: Partial<Observation['structured'] extends infer S ? S extends null ? never : S['patch'] : never>) => ({
  present: null, enter: null, exit: null, fadeIn: null, fadeOut: null, after: null, ...over,
});
const obs = (over: Partial<Observation>): Observation => ({
  text: 'x', layer: null, sectionIndex: 1, structured: null,
  evidence: [], confidence: 0.7, ...over,
});
const threeSections = [
  { startSec: 0, label: 'a' }, { startSec: 600, label: 'b' }, { startSec: 1200, label: 'c' },
];
const result = (observations: Observation[], sections: AnalysisResult['sections'] = threeSections): AnalysisResult =>
  ({ description: 'd', sections, observations });

describe('classifyObservations', () => {
  it('confirms a timing within tolerance of the grammar canon', () => {
    // Grammar: INTRODUCTION.ISO.enter = {canon:60, half:20} → tolerance max(30,20)=30.
    const [c] = classifyObservations(result([
      obs({ structured: { category: 'ISO', patch: patch({ enter: { canon: 75, half: 10 } }) } }),
    ]));
    expect(c.kind).toBe('confirms');
    expect(c.relatedRule).toBe('grammar:INTRODUCTION.ISO.enter');
    expect(c.mode).toBe('INTRODUCTION');
  });
  it('contradicts a timing outside tolerance', () => {
    const [c] = classifyObservations(result([
      obs({ structured: { category: 'ISO', patch: patch({ enter: { canon: 200, half: 10 } }) } }),
    ]));
    expect(c.kind).toBe('contradicts');
    expect(c.relatedRule).toBe('grammar:INTRODUCTION.ISO.enter');
  });
  it('is novel when the grammar has no entry for that layer in that mode', () => {
    // DEEP_RELAXATION has no BASS entry (section 2 → DEEP_RELAXATION).
    const [c] = classifyObservations(result([
      obs({ sectionIndex: 2, structured: { category: 'BASS', patch: patch({ enter: { canon: 100, half: 5 } }) } }),
    ]));
    expect(c.kind).toBe('novel');
    expect(c.mode).toBe('DEEP_RELAXATION');
  });
  it('without exactly 3 sections, timing observations are novel with no mode', () => {
    const [c] = classifyObservations(result([
      obs({ structured: { category: 'ISO', patch: patch({ enter: { canon: 60, half: 5 } }) } }),
    ], null));
    expect(c.kind).toBe('novel');
    expect(c.mode).toBeNull();
  });
  it('prose stays novel but gets a topic link', () => {
    const [c] = classifyObservations(result([obs({ text: 'The noise bed never stops' })]));
    expect(c.kind).toBe('novel');
    expect(c.relatedRule).toBe('R7');
  });
  it('synthesizes an R2 contradiction when a higher layer enters before a lower one', () => {
    const cands = classifyObservations(result([
      obs({ structured: { category: 'MELODY', patch: patch({ enter: { canon: 30, half: 5 } }) } }),
      obs({ structured: { category: 'ISO', patch: patch({ enter: { canon: 300, half: 5 } }) } }),
    ]));
    const r2 = cands.find((c) => c.relatedRule === 'R2');
    expect(r2?.kind).toBe('contradicts');
  });
  it('synthesizes an R2 confirmation for >=3 categories entering in stack order', () => {
    const cands = classifyObservations(result([
      obs({ structured: { category: 'ISO', patch: patch({ enter: { canon: 60, half: 5 } }) } }),
      obs({ structured: { category: 'PAD', patch: patch({ enter: { canon: 180, half: 5 } }) } }),
      obs({ structured: { category: 'MELODY', patch: patch({ enter: { canon: 400, half: 5 } }) } }),
    ]));
    const r2 = cands.find((c) => c.relatedRule === 'R2' && c.kind === 'confirms');
    expect(r2).toBeDefined();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/rules/match.test.ts`
Expected: FAIL — cannot find module `@/rules/match`.

- [ ] **Step 3: Implement** — `src/rules/match.ts`:

```ts
import { config as defaultConfig, type EcosonicConfig, type GenLayerRule, type GenRange } from '@/config';
import type { Mode } from '@/arrange/types';
import { stackIndex } from '@/arrange/types';
import type { AnalysisResult, CandidateRule, Observation, PatchWireT } from '@/rules/analysisSchema';
import { MODES } from '@/rules/analysisSchema';
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
  const groups = new Map<number | 'none', Array<{ category: string; enter: number; o: Observation }>>();
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
        if (stackIndex(a.category as never) < stackIndex(b.category as never) && a.enter > b.enter + 30) {
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

/** Classify blind observations against the house rules — deterministic, pure. */
export function classifyObservations(
  result: AnalysisResult, cfg: EcosonicConfig = defaultConfig,
): CandidateRule[] {
  const threeSections = (result.sections?.length ?? 0) === 3;
  const modeFor = (o: Observation): Mode | null =>
    threeSections && o.sectionIndex !== null && o.sectionIndex >= 1 && o.sectionIndex <= 3
      ? (MODES[o.sectionIndex - 1] as Mode)
      : null;
  const D = cfg.layerTwo.moduleSeconds;

  const out: CandidateRule[] = result.observations.map((o) => {
    const mode = modeFor(o);
    if (o.structured && mode) {
      const rule = cfg.layerTwo.generation.modeRules[mode][o.structured.category];
      const verdict = rule
        ? compareToGrammar(o.structured.patch, rule, mode, o.structured.category, D)
        : null;
      if (verdict) return { ...o, ...verdict, mode };
      return { ...o, kind: 'novel', relatedRule: null, mode };
    }
    return { ...o, kind: 'novel', relatedRule: o.structured ? null : topicLink(o.text), mode };
  });

  out.push(...orderingCheck(result.observations, modeFor));
  return out;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/rules/match.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/rules/match.ts src/rules/match.test.ts
git commit -m "feat(rules): local deterministic classifier — grammar comparison, R2 ordering, topic links"
```

---

### Task 5: `registry.ts` — the discovered-rules file

**Files:**
- Create: `src/rules/registry.ts`
- Test: `src/rules/registry.test.ts`

**Interfaces:**
- Consumes: `CandidateRule`, `DiscoveredRule`, `RegistrySchema` (Task 2).
- Produces (all take optional trailing `filePath` — default `process.env.ECOSONIC_RULES_PATH ?? <cwd>/config/discovered-rules.json`):
  - `readRegistry(filePath?): DiscoveredRule[]`
  - `keepRule(candidate: CandidateRule, source: { file: string; model: string }, filePath?): DiscoveredRule`
  - `removeRule(id: string, filePath?): boolean`
  - `setStatus(id: string, status: 'kept' | 'promoted', filePath?): boolean`

- [ ] **Step 1: Write the failing test** — `src/rules/registry.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readRegistry, keepRule, removeRule, setStatus } from '@/rules/registry';
import type { CandidateRule } from '@/rules/analysisSchema';

const candidate: CandidateRule = {
  text: 'A second nature layer enters ~5:00', layer: 'ELEMENT', sectionIndex: 1,
  structured: null, evidence: [{ atSec: 300, note: 'audible' }], confidence: 0.8,
  kind: 'novel', relatedRule: null, mode: 'INTRODUCTION',
};

let file: string;
beforeEach(() => {
  file = path.join(mkdtempSync(path.join(tmpdir(), 'eco-rules-')), 'discovered-rules.json');
  writeFileSync(file, '[]');
});

describe('registry', () => {
  it('keep → read round-trips with id, ISO date, and kept status', () => {
    const kept = keepRule(candidate, { file: 'track.mp3', model: 'gpt-audio-1.5' }, file);
    expect(kept.id.length).toBeGreaterThan(8);
    expect(kept.status).toBe('kept');
    expect(new Date(kept.source.date).getTime()).toBeGreaterThan(0);
    expect(readRegistry(file)).toEqual([kept]);
  });
  it('removeRule deletes by id; false when missing', () => {
    const kept = keepRule(candidate, { file: 't.mp3', model: 'm' }, file);
    expect(removeRule('nope', file)).toBe(false);
    expect(removeRule(kept.id, file)).toBe(true);
    expect(readRegistry(file)).toEqual([]);
  });
  it('setStatus promotes in place', () => {
    const kept = keepRule(candidate, { file: 't.mp3', model: 'm' }, file);
    expect(setStatus(kept.id, 'promoted', file)).toBe(true);
    expect(readRegistry(file)[0].status).toBe('promoted');
  });
  it('malformed registry file throws a clear error', () => {
    writeFileSync(file, '{"not":"an array"}');
    expect(() => readRegistry(file)).toThrow(/discovered-rules/);
  });
  it('writes pretty JSON (git-diff friendly)', () => {
    keepRule(candidate, { file: 't.mp3', model: 'm' }, file);
    expect(readFileSync(file, 'utf8')).toContain('\n  ');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/rules/registry.test.ts`
Expected: FAIL — cannot find module `@/rules/registry`.

- [ ] **Step 3: Implement** — `src/rules/registry.ts`:

```ts
import { readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { RegistrySchema, type CandidateRule, type DiscoveredRule } from '@/rules/analysisSchema';

const defaultPath = (): string =>
  process.env.ECOSONIC_RULES_PATH ?? path.join(process.cwd(), 'config', 'discovered-rules.json');

export function readRegistry(filePath: string = defaultPath()): DiscoveredRule[] {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (e) {
    throw new Error(`discovered-rules registry unreadable at ${filePath}: ${(e as Error).message}`);
  }
  const parsed = RegistrySchema.safeParse(raw);
  if (!parsed.success) throw new Error(`discovered-rules registry invalid at ${filePath}`);
  return parsed.data;
}

function write(all: DiscoveredRule[], filePath: string): void {
  writeFileSync(filePath, JSON.stringify(all, null, 2) + '\n');
}

export function keepRule(
  candidate: CandidateRule,
  source: { file: string; model: string },
  filePath: string = defaultPath(),
): DiscoveredRule {
  const entry: DiscoveredRule = {
    ...candidate,
    id: randomUUID(),
    source: { ...source, date: new Date().toISOString() },
    status: 'kept',
  };
  const all = readRegistry(filePath);
  all.push(entry);
  write(all, filePath);
  return entry;
}

export function removeRule(id: string, filePath: string = defaultPath()): boolean {
  const all = readRegistry(filePath);
  const next = all.filter((r) => r.id !== id);
  if (next.length === all.length) return false;
  write(next, filePath);
  return true;
}

export function setStatus(
  id: string, status: 'kept' | 'promoted', filePath: string = defaultPath(),
): boolean {
  const all = readRegistry(filePath);
  const entry = all.find((r) => r.id === id);
  if (!entry) return false;
  entry.status = status;
  write(all, filePath);
  return true;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/rules/registry.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/rules/registry.ts src/rules/registry.test.ts
git commit -m "feat(rules): file-backed discovered-rules registry (keep/remove/status)"
```

---

### Task 6: `promote.ts` — the only write into the grammar

**Files:**
- Create: `src/rules/promote.ts`
- Test: `src/rules/promote.test.ts`

**Interfaces:**
- Consumes: `ConfigSchema` (`@/config`), `PatchWireT` (Task 2), `Mode` (`@/arrange/types`).
- Produces: `promoteRule(input: { mode: Mode; category: string; patch: PatchWireT }, configPath?): { ok: true } | { ok: false; reason: string }` — default path `process.env.ECOSONIC_CONFIG_PATH ?? <cwd>/config/ecosonic.config.json`. Null patch fields are stripped; merge into existing entry or insert complete entry; whole merged config must pass `ConfigSchema` or **nothing is written**.

- [ ] **Step 1: Write the failing test** — `src/rules/promote.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promoteRule } from '@/rules/promote';

const realConfig = path.join(process.cwd(), 'config', 'ecosonic.config.json');
let file: string;
beforeEach(() => {
  file = path.join(mkdtempSync(path.join(tmpdir(), 'eco-cfg-')), 'ecosonic.config.json');
  copyFileSync(realConfig, file);
});
const nullPatch = { present: null, enter: null, exit: null, fadeIn: null, fadeOut: null, after: null };

describe('promoteRule', () => {
  it('merges a partial patch into an existing layer entry', () => {
    const res = promoteRule(
      { mode: 'INTRODUCTION', category: 'ISO', patch: { ...nullPatch, enter: { canon: 90, half: 25 } } },
      file,
    );
    expect(res.ok).toBe(true);
    const cfg = JSON.parse(readFileSync(file, 'utf8'));
    expect(cfg.layerTwo.generation.modeRules.INTRODUCTION.ISO.enter).toEqual({ canon: 90, half: 25 });
    // untouched sibling field survives the merge
    expect(cfg.layerTwo.generation.modeRules.INTRODUCTION.ISO.fadeOut.canon).toBe(120);
  });
  it('inserts a COMPLETE entry into a mode where the layer is absent', () => {
    const res = promoteRule({
      mode: 'DEEP_RELAXATION', category: 'PAD',
      patch: {
        present: 0.5, enter: { canon: 120, half: 30 }, exit: { canon: 480, half: 30 },
        fadeIn: { canon: 60, half: 15 }, fadeOut: { canon: 60, half: 15 }, after: null,
      },
    }, file);
    expect(res.ok).toBe(true);
    const cfg = JSON.parse(readFileSync(file, 'utf8'));
    expect(cfg.layerTwo.generation.modeRules.DEEP_RELAXATION.PAD.present).toBe(0.5);
  });
  it('rejects a partial patch into an absent layer — config byte-identical', () => {
    const before = readFileSync(file, 'utf8');
    const res = promoteRule(
      { mode: 'DEEP_RELAXATION', category: 'PAD', patch: { ...nullPatch, enter: { canon: 120, half: 30 } } },
      file,
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/invalid/i);
    expect(readFileSync(file, 'utf8')).toBe(before);
  });
  it('rejects a patch that fails schema validation — config byte-identical', () => {
    const before = readFileSync(file, 'utf8');
    const res = promoteRule(
      { mode: 'INTRODUCTION', category: 'ISO', patch: { ...nullPatch, present: 2 as never } },
      file,
    );
    expect(res.ok).toBe(false);
    expect(readFileSync(file, 'utf8')).toBe(before);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/rules/promote.test.ts`
Expected: FAIL — cannot find module `@/rules/promote`.

- [ ] **Step 3: Implement** — `src/rules/promote.ts`:

```ts
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ConfigSchema } from '@/config';
import type { Mode } from '@/arrange/types';
import type { PatchWireT } from '@/rules/analysisSchema';

const defaultPath = (): string =>
  process.env.ECOSONIC_CONFIG_PATH ?? path.join(process.cwd(), 'config', 'ecosonic.config.json');

/** Drop null wire fields — what remains is the actual grammar patch. */
function stripNulls(patch: PatchWireT): Record<string, unknown> {
  return Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== null));
}

/** The ONLY code path that writes into the live grammar. All-or-nothing:
 *  merge → validate the ENTIRE config → write; any failure leaves the file untouched. */
export function promoteRule(
  input: { mode: Mode; category: string; patch: PatchWireT },
  configPath: string = defaultPath(),
): { ok: true } | { ok: false; reason: string } {
  let cfg: Record<string, never>;
  try {
    cfg = JSON.parse(readFileSync(configPath, 'utf8'));
  } catch (e) {
    return { ok: false, reason: `config unreadable: ${(e as Error).message}` };
  }
  const modeRules = (cfg as never as {
    layerTwo?: { generation?: { modeRules?: Record<string, Record<string, unknown>> } };
  }).layerTwo?.generation?.modeRules?.[input.mode];
  if (!modeRules) return { ok: false, reason: `no generation rules for mode ${input.mode}` };

  const clean = stripNulls(input.patch);
  if (Object.keys(clean).length === 0) return { ok: false, reason: 'patch is empty' };
  const existing = modeRules[input.category] as Record<string, unknown> | undefined;
  modeRules[input.category] = existing ? { ...existing, ...clean } : clean;

  const parsed = ConfigSchema.safeParse(cfg);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      ok: false,
      reason: `merged config invalid at ${first.path.join('.')}: ${first.message}` +
        (existing ? '' : ' — promoting into a mode where the layer is absent needs full timings'),
    };
  }
  writeFileSync(configPath, JSON.stringify(cfg, null, 2) + '\n');
  return { ok: true };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/rules/promote.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/rules/promote.ts src/rules/promote.test.ts
git commit -m "feat(rules): promote — all-or-nothing zod-validated merge into the live grammar"
```

---

### Task 7: API routes — `/api/analyze` and `/api/rules`

**Files:**
- Create: `src/app/api/analyze/route.ts`
- Create: `src/app/api/rules/route.ts`
- Test: `src/app/api/analyze/route.test.ts`, `src/app/api/rules/route.test.ts`

**Interfaces:**
- Consumes: `buildSystemPrompt` (T3), `OPENAI_ANALYSIS_JSON_SCHEMA`, `AnalysisResultSchema`, `CandidateRuleSchema` (T2), `classifyObservations` (T4), `readRegistry/keepRule/removeRule/setStatus` (T5), `promoteRule` (T6), `config` (`@/config`).
- Produces:
  - `GET /api/analyze` → `{ ready: boolean }`; `POST /api/analyze` (FormData `file`) → `{ description, sections, candidates }` | 400 (type/size) | 503 (no key) | 502 (upstream/malformed)
  - `GET /api/rules` → `DiscoveredRule[]`; `POST /api/rules` `{ candidate, source:{file,model} }` → 201 entry; `PATCH /api/rules` `{ id, action:'promote'|'discard' }` → 200 | 404 | 422
- Route handlers are plain exported async functions over Web `Request`/`Response` (verified against this Next version's `route.md`); both files `export const runtime = 'nodejs'`.
- Tests run in node environment: first line `// @vitest-environment node`; use `vi.stubEnv` for `OPENAI_API_KEY`/`ECOSONIC_RULES_PATH`/`ECOSONIC_CONFIG_PATH` and `vi.stubGlobal('fetch', …)`.

- [ ] **Step 1: Write the failing tests** — `src/app/api/rules/route.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mkdtempSync, writeFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { GET, POST, PATCH } from '@/app/api/rules/route';

const candidate = {
  text: 'DRONE swells in around 3:00', layer: 'DRONE', sectionIndex: 1,
  structured: {
    category: 'DRONE',
    patch: { present: null, enter: { canon: 180, half: 30 }, exit: null, fadeIn: null, fadeOut: null, after: null },
  },
  evidence: [{ atSec: 180, note: 'swell' }], confidence: 0.9,
  kind: 'confirms', relatedRule: 'grammar:INTRODUCTION.DRONE.enter', mode: 'INTRODUCTION',
};
const jsonReq = (method: string, body: unknown) =>
  new Request('http://test/api/rules', {
    method, body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' },
  });

beforeEach(() => {
  const dir = mkdtempSync(path.join(tmpdir(), 'eco-api-'));
  const reg = path.join(dir, 'discovered-rules.json');
  const cfg = path.join(dir, 'ecosonic.config.json');
  writeFileSync(reg, '[]');
  copyFileSync(path.join(process.cwd(), 'config', 'ecosonic.config.json'), cfg);
  vi.stubEnv('ECOSONIC_RULES_PATH', reg);
  vi.stubEnv('ECOSONIC_CONFIG_PATH', cfg);
});

describe('/api/rules', () => {
  it('POST keeps a candidate; GET lists it', async () => {
    const post = await POST(jsonReq('POST', { candidate, source: { file: 't.mp3', model: 'm' } }));
    expect(post.status).toBe(201);
    const kept = await post.json();
    const list = await (await GET()).json();
    expect(list).toEqual([kept]);
  });
  it('POST rejects a malformed body', async () => {
    expect((await POST(jsonReq('POST', { nope: true }))).status).toBe(400);
  });
  it('PATCH discard removes; 404 when unknown id', async () => {
    const kept = await (await POST(jsonReq('POST', { candidate, source: { file: 't', model: 'm' } }))).json();
    expect((await PATCH(jsonReq('PATCH', { id: 'nope', action: 'discard' }))).status).toBe(404);
    expect((await PATCH(jsonReq('PATCH', { id: kept.id, action: 'discard' }))).status).toBe(200);
    expect(await (await GET()).json()).toEqual([]);
  });
  it('PATCH promote writes the grammar and flips status', async () => {
    const kept = await (await POST(jsonReq('POST', { candidate, source: { file: 't', model: 'm' } }))).json();
    const res = await PATCH(jsonReq('PATCH', { id: kept.id, action: 'promote' }));
    expect(res.status).toBe(200);
    const list = await (await GET()).json();
    expect(list[0].status).toBe('promoted');
  });
  it('PATCH promote 422s for a prose-only rule', async () => {
    const prose = { ...candidate, structured: null, kind: 'novel', relatedRule: null };
    const kept = await (await POST(jsonReq('POST', { candidate: prose, source: { file: 't', model: 'm' } }))).json();
    expect((await PATCH(jsonReq('PATCH', { id: kept.id, action: 'promote' }))).status).toBe(422);
  });
});
```

And `src/app/api/analyze/route.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GET, POST } from '@/app/api/analyze/route';

const analysisBody = {
  description: 'Opens on a noise floor…',
  sections: [{ startSec: 0, label: 'a' }, { startSec: 600, label: 'b' }, { startSec: 1200, label: 'c' }],
  observations: [{
    text: 'Pulsed tone enters ~1:15', layer: 'ISO', sectionIndex: 1,
    structured: {
      category: 'ISO',
      patch: { present: null, enter: { canon: 75, half: 15 }, exit: null, fadeIn: null, fadeOut: null, after: null },
    },
    evidence: [{ atSec: 75, note: 'pulse onset' }], confidence: 0.85,
  }],
};
const openAiOk = () => Promise.resolve(new Response(JSON.stringify({
  choices: [{ message: { content: JSON.stringify(analysisBody) } }],
}), { status: 200 }));

const upload = (name: string, type: string, bytes = 4) => {
  const form = new FormData();
  form.set('file', new File([new Uint8Array(bytes)], name, { type }));
  return new Request('http://test/api/analyze', { method: 'POST', body: form });
};

beforeEach(() => vi.unstubAllGlobals());

describe('/api/analyze', () => {
  it('GET reports readiness from the env', async () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    expect((await (await GET()).json()).ready).toBe(false);
    vi.stubEnv('OPENAI_API_KEY', 'k');
    expect((await (await GET()).json()).ready).toBe(true);
  });
  it('503 when the key is missing', async () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    expect((await POST(upload('t.mp3', 'audio/mpeg'))).status).toBe(503);
  });
  it('400 on wrong type and on oversize', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'k');
    expect((await POST(upload('t.ogg', 'audio/ogg'))).status).toBe(400);
    expect((await POST(upload('t.mp3', 'audio/mpeg', 26214401))).status).toBe(400);
  });
  it('happy path: classifies observations locally (ISO enter 75 confirms)', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'k');
    vi.stubGlobal('fetch', vi.fn(openAiOk));
    const res = await POST(upload('t.mp3', 'audio/mpeg'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.description).toContain('noise floor');
    const iso = body.candidates.find((c: { layer: string }) => c.layer === 'ISO');
    expect(iso.kind).toBe('confirms');
    expect(iso.relatedRule).toBe('grammar:INTRODUCTION.ISO.enter');
    // and the prompt sent to OpenAI stayed blind
    const sent = JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string);
    expect(sent.messages[0].content).not.toContain('540');
  });
  it('502 on upstream error and on malformed model output', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'k');
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('boom', { status: 500 }))));
    expect((await POST(upload('t.mp3', 'audio/mpeg'))).status).toBe(502);
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify({
      choices: [{ message: { content: '{"not":"analysis"}' } }],
    }), { status: 200 }))));
    expect((await POST(upload('t.mp3', 'audio/mpeg'))).status).toBe(502);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/app/api/rules/route.test.ts src/app/api/analyze/route.test.ts`
Expected: FAIL — cannot find the route modules.

- [ ] **Step 3: Implement** — `src/app/api/rules/route.ts`:

```ts
import { z } from 'zod';
import { CandidateRuleSchema } from '@/rules/analysisSchema';
import { keepRule, readRegistry, removeRule, setStatus } from '@/rules/registry';
import { promoteRule } from '@/rules/promote';

export const runtime = 'nodejs';

const KeepBody = z.object({
  candidate: CandidateRuleSchema,
  source: z.object({ file: z.string().min(1), model: z.string().min(1) }),
});
const PatchBody = z.object({ id: z.string().min(1), action: z.enum(['promote', 'discard']) });

export async function GET() {
  return Response.json(readRegistry());
}

export async function POST(req: Request) {
  const parsed = KeepBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'bad request' }, { status: 400 });
  return Response.json(keepRule(parsed.data.candidate, parsed.data.source), { status: 201 });
}

export async function PATCH(req: Request) {
  const parsed = PatchBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'bad request' }, { status: 400 });
  const { id, action } = parsed.data;

  if (action === 'discard') {
    return removeRule(id)
      ? Response.json({ ok: true })
      : Response.json({ error: 'not found' }, { status: 404 });
  }

  const entry = readRegistry().find((r) => r.id === id);
  if (!entry) return Response.json({ error: 'not found' }, { status: 404 });
  if (!entry.structured || !entry.mode) {
    return Response.json(
      { error: 'rule has no structured form / section mapping — cannot promote' },
      { status: 422 },
    );
  }
  const res = promoteRule({ mode: entry.mode, category: entry.structured.category, patch: entry.structured.patch });
  if (!res.ok) return Response.json({ error: res.reason }, { status: 422 });
  setStatus(id, 'promoted');
  return Response.json({ ok: true });
}
```

And `src/app/api/analyze/route.ts`:

```ts
import { config } from '@/config';
import { AnalysisResultSchema, OPENAI_ANALYSIS_JSON_SCHEMA } from '@/rules/analysisSchema';
import { buildSystemPrompt } from '@/rules/inventory';
import { classifyObservations } from '@/rules/match';

export const runtime = 'nodejs';

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

export async function GET() {
  return Response.json({ ready: Boolean(process.env.OPENAI_API_KEY) });
}

export async function POST(req: Request) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return Response.json({ error: 'OPENAI_API_KEY is not set — add it to .env.local' }, { status: 503 });
  }
  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) return Response.json({ error: 'file field required' }, { status: 400 });

  const name = file.name.toLowerCase();
  const format = file.type === 'audio/mpeg' || name.endsWith('.mp3') ? 'mp3'
    : file.type === 'audio/wav' || file.type === 'audio/x-wav' || name.endsWith('.wav') ? 'wav'
    : null;
  if (!format) return Response.json({ error: 'MP3 or WAV only' }, { status: 400 });
  if (file.size > config.analysis.maxUploadBytes) {
    const mb = Math.round(config.analysis.maxUploadBytes / 1048576);
    return Response.json(
      { error: `File exceeds ${mb} MB — re-encode around 128 kbps mono and retry` },
      { status: 400 },
    );
  }

  const data = Buffer.from(await file.arrayBuffer()).toString('base64');
  const res = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.analysis.model,
      messages: [
        { role: 'system', content: buildSystemPrompt() }, // blind: vocabulary + format only
        {
          role: 'user',
          content: [
            { type: 'input_audio', input_audio: { data, format } },
            { type: 'text', text: 'Analyze this track and return JSON exactly per the schema.' },
          ],
        },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'track_analysis', strict: true, schema: OPENAI_ANALYSIS_JSON_SCHEMA },
      },
    }),
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 300);
    return Response.json({ error: `OpenAI ${res.status}: ${detail}` }, { status: 502 });
  }

  const payload = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  let result;
  try {
    result = AnalysisResultSchema.parse(JSON.parse(payload.choices?.[0]?.message?.content ?? ''));
  } catch {
    return Response.json({ error: 'model returned a malformed analysis' }, { status: 502 });
  }
  return Response.json({
    description: result.description,
    sections: result.sections,
    candidates: classifyObservations(result),
  });
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run src/app/api/rules/route.test.ts src/app/api/analyze/route.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/rules/route.ts src/app/api/rules/route.test.ts src/app/api/analyze/route.ts src/app/api/analyze/route.test.ts
git commit -m "feat(rules): analyze + registry API routes — blind prompt to OpenAI, local classification"
```

---

### Task 8: The `/rules` page, components, nav link, PRD row

> Before this task: skim `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md` (AGENTS.md guard). This task adds only a `'use client'` page + components — the same pattern as `ArrangeScreen`.

**Files:**
- Create: `src/app/rules/page.tsx`
- Create: `src/components/rules/RuleLibrary.tsx`, `src/components/rules/AnalyzePanel.tsx`, `src/components/rules/CandidateCard.tsx`
- Modify: `src/components/layer2/ArrangeScreen.tsx` (header link — file is clean, safe to stage)
- Modify: `docs/PRD.md` (§4 route table)

**Interfaces:**
- Consumes: `GET/POST /api/analyze`, `GET/POST/PATCH /api/rules` (T7); `PRINCIPLES`, `INVARIANTS`, `grammarRows` (T3); `CandidateRule`, `DiscoveredRule` types (T2); `config.analysis` (T1).
- Produces: the user-facing feature. No new exports consumed elsewhere.

- [ ] **Step 1: Create `src/components/rules/CandidateCard.tsx`**

```tsx
'use client';
import type { CandidateRule } from '@/rules/analysisSchema';

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

const BADGE: Record<CandidateRule['kind'], { label: string; cls: string }> = {
  confirms: { label: '✓ matches', cls: 'bg-emerald-600/15 text-emerald-700 dark:text-emerald-400' },
  contradicts: { label: '✗ contradicts', cls: 'bg-red-600/15 text-red-700 dark:text-red-400' },
  novel: { label: '★ new', cls: 'bg-[color-mix(in_oklch,var(--accent)_25%,transparent)] text-[var(--accent-ink)]' },
};

export function CandidateCard({
  candidate, keptId, onKeep, onDiscard, onPromote,
}: {
  candidate: CandidateRule;
  keptId: string | null;            // registry id once kept, else null
  onKeep: () => void;
  onDiscard: () => void;
  onPromote: () => void;
}) {
  const badge = BADGE[candidate.kind];
  const promotable = keptId !== null && candidate.structured !== null && candidate.mode !== null;
  return (
    <div className="rounded-[var(--radius-md)] border border-border bg-card p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.cls}`}>
          {badge.label}{candidate.relatedRule ? ` ${candidate.relatedRule}` : ''}
        </span>
        {candidate.layer && <span className="label">{candidate.layer}</span>}
        {candidate.structured && (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">structured</span>
        )}
        <span className="ml-auto text-xs tabular-nums text-muted-foreground">
          {(candidate.confidence * 100).toFixed(0)}%
        </span>
      </div>
      <p className="text-sm text-foreground">{candidate.text}</p>
      {candidate.evidence.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {candidate.evidence.map((e, i) => (
            <span key={i} className="rounded bg-muted px-1.5 py-0.5 text-[11px] tabular-nums text-muted-foreground"
              title={e.note}>
              {mmss(e.atSec)} — {e.note}
            </span>
          ))}
        </div>
      )}
      <div className="mt-3 flex gap-2">
        {keptId === null ? (
          <>
            <button type="button" onClick={onKeep}
              className="rounded-full px-3 py-1 text-xs text-white transition-calm"
              style={{ background: 'var(--accent-ink)' }}>
              Keep
            </button>
            <button type="button" onClick={onDiscard}
              className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition-calm hover:text-foreground">
              Discard
            </button>
          </>
        ) : (
          <>
            <span className="text-xs text-muted-foreground">kept ✓</span>
            {promotable && (
              <button type="button" onClick={onPromote}
                className="rounded-full border border-[var(--accent)] px-3 py-1 text-xs text-[var(--accent-ink)] transition-calm">
                Promote to grammar
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `src/components/rules/AnalyzePanel.tsx`**

```tsx
'use client';
import { useRef, useState } from 'react';
import { config } from '@/config';

export interface AnalyzeResponse {
  description: string;
  sections: Array<{ startSec: number; label: string }> | null;
  candidates: unknown[];
}

export function AnalyzePanel({
  ready, onResult,
}: {
  ready: boolean | null; // null = probing
  onResult: (r: AnalyzeResponse, fileName: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analyze = async (file: File) => {
    setError(null);
    if (!/\.(mp3|wav)$/i.test(file.name)) { setError('MP3 or WAV only.'); return; }
    if (file.size > config.analysis.maxUploadBytes) {
      setError(`File is ${(file.size / 1048576).toFixed(1)} MB — the limit is ` +
        `${Math.round(config.analysis.maxUploadBytes / 1048576)} MB. Re-encode around 128 kbps mono.`);
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.set('file', file);
      const res = await fetch('/api/analyze', { method: 'POST', body: form });
      const body = await res.json();
      if (!res.ok) { setError(body.error ?? `Analysis failed (${res.status})`); return; }
      onResult(body as AnalyzeResponse, file.name);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-[var(--radius-md)] border border-border bg-card p-4">
      <h2 className="mb-1 text-sm font-medium">Analyze a reference track</h2>
      <p className="mb-3 text-xs text-muted-foreground">
        MP3/WAV up to {Math.round(config.analysis.maxUploadBytes / 1048576)} MB. The model hears the
        audio blind — it is told what layers sound like, never the house rules. Timings on long
        tracks are approximate; the Keep gate is the filter.
      </p>
      {ready === false && (
        <p className="mb-3 rounded bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          OPENAI_API_KEY is not configured. Add it to <code>.env.local</code> and restart the dev server.
        </p>
      )}
      <div className="flex items-center gap-3">
        <input ref={inputRef} type="file" accept=".mp3,.wav,audio/mpeg,audio/wav" className="text-xs"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void analyze(f); }}
          disabled={busy || ready !== true} />
        {busy && <span className="text-xs text-muted-foreground">Analyzing… (a long track can take a minute)</span>}
      </div>
      {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </section>
  );
}
```

- [ ] **Step 3: Create `src/components/rules/RuleLibrary.tsx`**

```tsx
'use client';
import { INVARIANTS, PRINCIPLES, grammarRows } from '@/rules/inventory';
import type { DiscoveredRule } from '@/rules/analysisSchema';

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="rounded-[var(--radius-md)] border border-border bg-card p-3" open={false}>
      <summary className="cursor-pointer text-sm font-medium">{title}</summary>
      <div className="mt-2">{children}</div>
    </details>
  );
}

export function RuleLibrary({
  discovered, onPromote, onDiscard,
}: {
  discovered: DiscoveredRule[];
  onPromote: (id: string) => void;
  onDiscard: (id: string) => void;
}) {
  const rows = grammarRows();
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-medium">Rule library</h2>
      <Group title={`Principles (R1–R9)`}>
        <ul className="flex flex-col gap-1 text-sm">
          {PRINCIPLES.map((r) => (
            <li key={r.id}><span className="label mr-2">{r.id}</span>{r.title} — <span className="text-muted-foreground">{r.text}</span></li>
          ))}
        </ul>
      </Group>
      <Group title="Invariants (I1–I6, enforced in code)">
        <ul className="flex flex-col gap-1 text-sm">
          {INVARIANTS.map((r) => (
            <li key={r.id}><span className="label mr-2">{r.id}</span>{r.title} — <span className="text-muted-foreground">{r.text}</span></li>
          ))}
        </ul>
      </Group>
      <Group title="Live grammar (what Generate draws from)">
        <div className="overflow-x-auto">
          <table className="w-full text-xs tabular-nums">
            <thead className="text-left text-muted-foreground">
              <tr><th className="pr-3">mode</th><th className="pr-3">layer</th><th className="pr-3">enter</th><th className="pr-3">exit</th><th className="pr-3">fadeIn</th><th className="pr-3">fadeOut</th><th className="pr-3">present</th><th>after</th></tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-border">
                  <td className="pr-3">{r.mode}</td><td className="pr-3">{r.category}</td>
                  <td className="pr-3">{r.enter}</td><td className="pr-3">{r.exit}</td>
                  <td className="pr-3">{r.fadeIn}</td><td className="pr-3">{r.fadeOut}</td>
                  <td className="pr-3">{r.present}</td><td>{r.after}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Group>
      <Group title={`Discovered (${discovered.length})`}>
        {discovered.length === 0 && <p className="text-xs text-muted-foreground">Nothing kept yet — analyze a track below.</p>}
        <ul className="flex flex-col gap-2">
          {discovered.map((r) => (
            <li key={r.id} className="rounded border border-border p-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="label">{r.status}</span>
                <span>{r.text}</span>
                <span className="ml-auto text-[11px] text-muted-foreground">
                  {r.source.file} · {r.source.date.slice(0, 10)}
                </span>
              </div>
              <div className="mt-1 flex gap-2">
                {r.status === 'kept' && r.structured && r.mode && (
                  <button type="button" onClick={() => onPromote(r.id)}
                    className="rounded-full border border-[var(--accent)] px-2.5 py-0.5 text-[11px] text-[var(--accent-ink)]">
                    Promote
                  </button>
                )}
                {r.status === 'kept' && (
                  <button type="button" onClick={() => onDiscard(r.id)}
                    className="rounded-full border border-border px-2.5 py-0.5 text-[11px] text-muted-foreground">
                    Discard
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </Group>
    </section>
  );
}
```

- [ ] **Step 4: Create `src/app/rules/page.tsx`**

```tsx
'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { config } from '@/config';
import type { CandidateRule, DiscoveredRule } from '@/rules/analysisSchema';
import { AnalyzePanel, type AnalyzeResponse } from '@/components/rules/AnalyzePanel';
import { CandidateCard } from '@/components/rules/CandidateCard';
import { RuleLibrary } from '@/components/rules/RuleLibrary';

export default function RulesPage() {
  const [ready, setReady] = useState<boolean | null>(null);
  const [discovered, setDiscovered] = useState<DiscoveredRule[]>([]);
  const [description, setDescription] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [cards, setCards] = useState<Array<{ candidate: CandidateRule; keptId: string | null }>>([]);
  const [actionError, setActionError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setDiscovered(await (await fetch('/api/rules')).json());
  }, []);
  useEffect(() => {
    void fetch('/api/analyze').then(async (r) => setReady((await r.json()).ready));
    void refresh();
  }, [refresh]);

  const onResult = (r: AnalyzeResponse, name: string) => {
    setDescription(r.description);
    setFileName(name);
    setCards((r.candidates as CandidateRule[]).map((candidate) => ({ candidate, keptId: null })));
  };

  const keep = async (i: number) => {
    setActionError(null);
    const res = await fetch('/api/rules', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidate: cards[i].candidate, source: { file: fileName, model: config.analysis.model } }),
    });
    if (!res.ok) { setActionError('Keep failed'); return; }
    const kept: DiscoveredRule = await res.json();
    setCards((c) => c.map((x, j) => (j === i ? { ...x, keptId: kept.id } : x)));
    void refresh();
  };
  const patch = async (id: string, action: 'promote' | 'discard') => {
    setActionError(null);
    const res = await fetch('/api/rules', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action }),
    });
    if (!res.ok) setActionError((await res.json()).error ?? `${action} failed`);
    void refresh();
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <div>
          <p className="label">Rule Discovery</p>
          <h1 className="text-lg font-medium">Composition rules — existing, and discovered from tracks</h1>
        </div>
        <Link href="/layer2" className="text-sm text-muted-foreground hover:text-foreground">← Module Designer</Link>
      </header>
      <main className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
        <RuleLibrary discovered={discovered}
          onPromote={(id) => void patch(id, 'promote')}
          onDiscard={(id) => void patch(id, 'discard')} />
        <AnalyzePanel ready={ready} onResult={onResult} />
        {actionError && <p className="text-xs text-red-600 dark:text-red-400">{actionError}</p>}
        {description && (
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-medium">Description — {fileName}</h2>
            <p className="whitespace-pre-wrap rounded-[var(--radius-md)] border border-border bg-card p-4 text-sm leading-relaxed">
              {description}
            </p>
            <h2 className="text-sm font-medium">Candidate rules ({cards.length})</h2>
            {cards.map((c, i) => (
              <CandidateCard key={i} candidate={c.candidate} keptId={c.keptId}
                onKeep={() => void keep(i)}
                onDiscard={() => setCards((all) => all.filter((_, j) => j !== i))}
                onPromote={() => c.keptId && void patch(c.keptId, 'promote')} />
            ))}
          </section>
        )}
      </main>
    </div>
  );
}
```

- [ ] **Step 5: Add the nav link** — in `src/components/layer2/ArrangeScreen.tsx`, inside the header's left `<div className="flex items-center gap-3">`, after the title `<div>…</div>` block, add:

```tsx
          <a href="/rules" className="ml-2 text-xs text-muted-foreground transition-calm hover:text-foreground">
            Rules →
          </a>
```

- [ ] **Step 6: PRD route row** — in `docs/PRD.md` §4 table, after the `/layer2` row add:

```markdown
| `/rules` | Rule Discovery | List all composition rules; analyze a track into candidate rules; keep/promote |
```

- [ ] **Step 7: Typecheck + full suite**

Run: `npx tsc --noEmit && npm test`
Expected: tsc clean; all test files pass (including all pre-existing suites).

- [ ] **Step 8: Manual verification**

1. `npm run dev` → open `/rules`: library groups render (grammar table shows DRONE rows); amber banner if no key.
2. Add `.env.local` with `OPENAI_API_KEY=sk-…`, restart, banner gone.
3. Upload the sample MP3 → description reads like the production brief; candidate cards show badges + timestamps.
4. **Keep** a card → `git diff config/discovered-rules.json` shows the entry; it appears under Discovered.
5. **Promote** a kept structured rule → `git diff config/ecosonic.config.json` shows the surgical change; `/layer2` → Generate reflects it.
6. Oversize file → friendly 400 message. `/layer2` header shows "Rules →".

- [ ] **Step 9: Commit**

```bash
git add src/app/rules/page.tsx src/components/rules/RuleLibrary.tsx src/components/rules/AnalyzePanel.tsx src/components/rules/CandidateCard.tsx src/components/layer2/ArrangeScreen.tsx docs/PRD.md
git commit -m "feat(rules): /rules page — rule library, blind track analysis, keep/promote lifecycle"
```

---

## Self-Review

**Spec coverage:** §1 lifecycle → T5/T6/T7/T8 (keep/promote/discard paths). §2 OpenAI grounding → T7 (base64 `input_audio`, strict schema, readiness, size cap from T1 config). §3 three zones → T8. §4 data model → T2 (wire-null convention). §5 routes → T7 (+ both discard semantics). §6 blind prompt → T3 (zero-arg + negative tests); §6b matcher → T4 (tolerance `max(30, half)`, presence ±0.25, `after` equality, R2 ordering, prose = novel + topic link — the spec's "prose matches rules they textually address" is implemented as a topic *link* on a novel candidate, since text cannot prove agreement direction; noted in T4 interface). §7 promote → T6 (absent+partial rejection emerges from whole-config validation, with an explanatory reason). §8 files → all present. §9 tests → T2–T7. §10 out-of-scope respected. §11 build notes → Global Constraints.

**Placeholder scan:** none — every code step is complete.

**Type consistency:** `CandidateRule`/`DiscoveredRule`/`PatchWireT` defined in T2, consumed by T4/T5/T6/T7/T8 with identical shapes; `classifyObservations(result, cfg?)` (T4) used in T7; registry/promote signatures (T5/T6) match T7's calls; `grammarRows()`/`buildSystemPrompt()` (T3) match T7/T8 usage; env-var names (`ECOSONIC_RULES_PATH`, `ECOSONIC_CONFIG_PATH`, `OPENAI_API_KEY`) consistent across T5/T6/T7 and tests.

**Known judgment calls (documented, not gaps):** oversize test in T7 builds a 25 MB+ `File` in memory (fast, no disk); `mode` for promotion comes from the matcher's section mapping — tracks without exactly 3 sections yield `mode: null` candidates that are keepable but not promotable (spec §6b + §7 intersection).

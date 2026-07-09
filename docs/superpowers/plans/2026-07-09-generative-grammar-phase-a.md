# Generative Grammar (Phase A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a seeded, pure generative engine that emits valid module timing tables (and whole compositions) from bounded rules, with a 3-mode drift control, wired into Layer Two so a designer can "Generate" a fresh arrangement.

**Architecture:** Replace each layer's *fixed* `{enter, exit, fade}` with a `canon ± half` **range** plus an ordering constraint (`after`). A deterministic PRNG draws timings within those ranges; a bottom-up ordering pass guarantees entrances can't invert; the density arch emerges from placement. Output is a `ModeTemplate` — a drop-in for the existing `buildComposition → trackScalarAt → regionEnvAt` engine, so no playback code changes. `generateComposition` mirrors `buildComposition` but swaps the template source. A minimal UI hook reseeds the single-module designer from the generator.

**Tech Stack:** TypeScript 5, Zod 4 (config validation), Vitest 4 (`npm test` / `npx vitest run <file>`), Zustand 5 (store), Next.js 16 + React 19 (Layer Two UI). Path alias `@` → `src`.

## Global Constraints

- **Determinism:** every generator function is pure and seeded — same `(mode, drift, seed)` ⇒ identical output. No `Math.random()`, no `Date.now()` in `src/arrange/**` generator code.
- **Drift labels are exactly** `STRICT | MODERATE | EXPLORATORY`.
- **Stack order (bottom→top) is exactly:** `NOISE, ELEMENT, ELEMENT_SUB, FX, ISO, PLANET, PAD, BASS, ARP, MELODY`.
- **Fades are the volume-envelope path** (decided 2026-07-09): the generator emits `fadeIn/fadeOut ≈ 60`; they render via the existing `regionEnvAt` cosine ramp in composition playback. Do **not** change the single-module `useModuleScheduler` (it stays trigger/release per ADR-0002).
- **Config is pure data, Zod-validated** ([ADR-0004]): all tunable numbers live in `config/ecosonic.config.json`, never hardcoded in generator logic.
- **Next.js guard (AGENTS.md):** before editing any Next.js component (Task 6 only), read the relevant guide in `node_modules/next/dist/docs/`. Tasks 1–5 are framework-agnostic TS.
- **Reuse, don't duplicate:** `generateModeTemplate` reuses the exact region-emission rules already in [`buildModeTemplate`](../../../src/arrange/buildModeTemplate.ts) (2nd-element stagger, fade-cap to half-width); `generateComposition` reuses [`buildSequence`](../../../src/arrange/buildSequence.ts).

## File Structure

| File | Responsibility |
|---|---|
| `config/ecosonic.config.json` | **Modify** — add `layerTwo.generation` (drift scales + per-mode `GenModeRule` tables). |
| `src/config.ts` | **Modify** — Zod schemas `GenRangeSchema/GenLayerRuleSchema/GenModeRuleSchema/GenerationSchema`; extend `LayerTwo`; export types `GenRange/GenLayerRule/GenModeRule`. |
| `src/config.test.ts` | **Modify** — add a minimal `generation` block to the `valid` fixture. |
| `src/arrange/prng.ts` | **Create** — deterministic PRNG (`makeRng`) + `RNG` interface. |
| `src/arrange/types.ts` | **Modify** — `Drift`, `DRIFTS`, `STACK_ORDER`, `stackIndex`. |
| `src/arrange/generate/generateModeTemplate.ts` | **Create** — the core grammar: rules → `ModeTemplate`. |
| `src/arrange/generate/validateTemplate.ts` | **Create** — invariants I1–I6 as a pure oracle. |
| `src/arrange/generate/generateComposition.ts` | **Create** — session-level assembly (mirrors `buildComposition`). |
| `src/arrange/arrangementStore.ts` | **Modify** — `drift` state, `setDrift`, `generateModule`. |
| `src/components/layer2/ArrangeScreen.tsx` | **Modify** — drift picker + "Generate" button. |
| `docs/adr/0007-generated-playback-uses-volume-envelope.md` | **Create** — records the envelope decision (supersedes 0002 for composition playback). |
| `docs/PRD.md` | **Modify** — §8 fade principle points to ADR-0007. |

---

### Task 1: Generation config + Zod schema + decision record

**Files:**
- Modify: `config/ecosonic.config.json` (add `layerTwo.generation`)
- Modify: `src/config.ts` (add schemas + types)
- Modify: `src/config.test.ts` (extend `valid` fixture)
- Create: `docs/adr/0007-generated-playback-uses-volume-envelope.md`
- Modify: `docs/PRD.md:137` (the "Baked fades" principle line)

**Interfaces:**
- Produces (via `EcosonicConfig` inference):
  - `config.layerTwo.generation.minGapSec: number`
  - `config.layerTwo.generation.driftScales: { STRICT: number; MODERATE: number; EXPLORATORY: number }`
  - `config.layerTwo.generation.modeRules: { INTRODUCTION: GenModeRule; DEEP_RELAXATION: GenModeRule; RETURN: GenModeRule }`
  - Exported types: `GenRange = { canon: number; half: number }`, `GenLayerRule = { present: number; enter: GenRange; exit: GenRange | 'MODULE_END'; fadeIn: GenRange; fadeOut: GenRange; after?: Category }`, `GenModeRule = Partial<Record<Category, GenLayerRule>>`.

- [ ] **Step 1: Write the failing test** — append to `src/config.test.ts` (inside the `describe('config', …)` block):

```ts
  it('parses the generation block and exposes drift scales', () => {
    expect(config.layerTwo.generation.driftScales.MODERATE).toBe(0.5);
    expect(config.layerTwo.generation.modeRules.INTRODUCTION.ISO?.after).toBe('ELEMENT');
    expect(config.layerTwo.generation.modeRules.DEEP_RELAXATION.BASS).toBeUndefined();
  });
  it('rejects a generation layer rule with present > 1', () => {
    const bad = JSON.parse(JSON.stringify(valid));
    bad.layerTwo.generation.modeRules.INTRODUCTION.NOISE.present = 2;
    expect(ConfigSchema.safeParse(bad).success).toBe(false);
  });
```

Also add a `generation` block to the `valid` fixture object in that file (as a sibling of `modeRules`, inside `layerTwo`):

```ts
      generation: {
        minGapSec: 20,
        driftScales: { STRICT: 0.15, MODERATE: 0.5, EXPLORATORY: 1.0 },
        modeRules: {
          INTRODUCTION: {
            NOISE: { present: 1, enter: { canon: 0, half: 0 }, exit: 'MODULE_END', fadeIn: { canon: 60, half: 0 }, fadeOut: { canon: 0, half: 0 } },
            ISO: { present: 1, enter: { canon: 60, half: 20 }, exit: { canon: 540, half: 30 }, fadeIn: { canon: 60, half: 15 }, fadeOut: { canon: 120, half: 20 }, after: 'ELEMENT' },
          },
          DEEP_RELAXATION: {
            NOISE: { present: 1, enter: { canon: 0, half: 0 }, exit: { canon: 480, half: 30 }, fadeIn: { canon: 60, half: 15 }, fadeOut: { canon: 60, half: 15 } },
          },
          RETURN: {
            NOISE: { present: 1, enter: { canon: 0, half: 0 }, exit: 'MODULE_END', fadeIn: { canon: 60, half: 15 }, fadeOut: { canon: 60, half: 15 } },
          },
        },
      },
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/config.test.ts`
Expected: FAIL — `config.layerTwo.generation` is undefined / `ConfigSchema` has no `generation` (parse of the extended `valid` fixture fails).

- [ ] **Step 3: Add the Zod schemas + types** — in `src/config.ts`, insert **before** `const LayerTwo = z.object({` :

```ts
const CATEGORY_VALUES = [
  'NOISE', 'ISO', 'PLANET', 'ELEMENT', 'ELEMENT_SUB', 'BASS', 'PAD', 'ARP', 'MELODY', 'FX',
] as const;

const GenRangeSchema = z.object({
  canon: z.number().nonnegative(),
  half: z.number().nonnegative(),
});
const ExitSpecSchema = z.union([GenRangeSchema, z.literal('MODULE_END')]);
const GenLayerRuleSchema = z.object({
  present: z.number().min(0).max(1),
  enter: GenRangeSchema,
  exit: ExitSpecSchema,
  fadeIn: GenRangeSchema,
  fadeOut: GenRangeSchema,
  after: z.enum(CATEGORY_VALUES).optional(),
});
// Every category optional — an omitted key = the layer is absent in that mode.
const GenModeRuleSchema = z.object({
  NOISE: GenLayerRuleSchema.optional(), ISO: GenLayerRuleSchema.optional(),
  PLANET: GenLayerRuleSchema.optional(), ELEMENT: GenLayerRuleSchema.optional(),
  ELEMENT_SUB: GenLayerRuleSchema.optional(), BASS: GenLayerRuleSchema.optional(),
  PAD: GenLayerRuleSchema.optional(), ARP: GenLayerRuleSchema.optional(),
  MELODY: GenLayerRuleSchema.optional(), FX: GenLayerRuleSchema.optional(),
});
const GenerationSchema = z.object({
  minGapSec: z.number().nonnegative(),
  driftScales: z.object({
    STRICT: z.number().nonnegative(),
    MODERATE: z.number().nonnegative(),
    EXPLORATORY: z.number().nonnegative(),
  }),
  modeRules: z.object({
    INTRODUCTION: GenModeRuleSchema,
    DEEP_RELAXATION: GenModeRuleSchema,
    RETURN: GenModeRuleSchema,
  }),
});

export type GenRange = z.infer<typeof GenRangeSchema>;
export type GenLayerRule = z.infer<typeof GenLayerRuleSchema>;
export type GenModeRule = z.infer<typeof GenModeRuleSchema>;
```

Then add `generation` to the `LayerTwo` object schema (after the `modeRules: …` line):

```ts
  modeRules: z.object({ INTRODUCTION: ModeRule, DEEP_RELAXATION: ModeRule, RETURN: ModeRule }),
  generation: GenerationSchema,
});
```

- [ ] **Step 4: Add the real generation data** — in `config/ecosonic.config.json`, add a `"generation"` key inside `"layerTwo"` immediately after the `"modeRules": { … }` block (add a comma after `modeRules`'s closing brace):

```json
    "generation": {
      "minGapSec": 20,
      "driftScales": { "STRICT": 0.15, "MODERATE": 0.5, "EXPLORATORY": 1.0 },
      "modeRules": {
        "INTRODUCTION": {
          "NOISE":   { "present": 1,    "enter": { "canon": 0,   "half": 0 },  "exit": "MODULE_END",                 "fadeIn": { "canon": 60, "half": 0 },  "fadeOut": { "canon": 0,   "half": 0 } },
          "ELEMENT": { "present": 1,    "enter": { "canon": 0,   "half": 0 },  "exit": "MODULE_END",                 "fadeIn": { "canon": 30, "half": 10 }, "fadeOut": { "canon": 60,  "half": 15 } },
          "FX":      { "present": 1,    "enter": { "canon": 0,   "half": 0 },  "exit": "MODULE_END",                 "fadeIn": { "canon": 30, "half": 10 }, "fadeOut": { "canon": 60,  "half": 15 } },
          "ISO":     { "present": 1,    "enter": { "canon": 60,  "half": 20 }, "exit": { "canon": 540, "half": 30 }, "fadeIn": { "canon": 60, "half": 15 }, "fadeOut": { "canon": 120, "half": 20 }, "after": "ELEMENT" },
          "PLANET":  { "present": 1,    "enter": { "canon": 120, "half": 25 }, "exit": { "canon": 540, "half": 30 }, "fadeIn": { "canon": 60, "half": 15 }, "fadeOut": { "canon": 120, "half": 20 }, "after": "ISO" },
          "PAD":     { "present": 1,    "enter": { "canon": 180, "half": 30 }, "exit": { "canon": 540, "half": 30 }, "fadeIn": { "canon": 60, "half": 15 }, "fadeOut": { "canon": 60,  "half": 15 }, "after": "PLANET" },
          "BASS":    { "present": 1,    "enter": { "canon": 240, "half": 30 }, "exit": { "canon": 540, "half": 30 }, "fadeIn": { "canon": 0,  "half": 0 },  "fadeOut": { "canon": 60,  "half": 15 }, "after": "PAD" },
          "ARP":     { "present": 0.9,  "enter": { "canon": 270, "half": 30 }, "exit": { "canon": 540, "half": 30 }, "fadeIn": { "canon": 60, "half": 15 }, "fadeOut": { "canon": 60,  "half": 15 }, "after": "BASS" },
          "MELODY":  { "present": 0.85, "enter": { "canon": 390, "half": 45 }, "exit": { "canon": 540, "half": 30 }, "fadeIn": { "canon": 60, "half": 15 }, "fadeOut": { "canon": 60,  "half": 15 }, "after": "ARP" }
        },
        "DEEP_RELAXATION": {
          "NOISE":       { "present": 1, "enter": { "canon": 0, "half": 0 }, "exit": { "canon": 480, "half": 30 }, "fadeIn": { "canon": 60, "half": 15 }, "fadeOut": { "canon": 60, "half": 15 } },
          "ELEMENT":     { "present": 1, "enter": { "canon": 0, "half": 0 }, "exit": "MODULE_END",                 "fadeIn": { "canon": 60, "half": 15 }, "fadeOut": { "canon": 60, "half": 15 } },
          "ELEMENT_SUB": { "present": 1, "enter": { "canon": 0, "half": 0 }, "exit": "MODULE_END",                 "fadeIn": { "canon": 60, "half": 15 }, "fadeOut": { "canon": 60, "half": 15 } },
          "ISO":         { "present": 1, "enter": { "canon": 0, "half": 0 }, "exit": { "canon": 480, "half": 30 }, "fadeIn": { "canon": 60, "half": 15 }, "fadeOut": { "canon": 60, "half": 15 } },
          "PLANET":      { "present": 1, "enter": { "canon": 0, "half": 0 }, "exit": { "canon": 480, "half": 30 }, "fadeIn": { "canon": 60, "half": 15 }, "fadeOut": { "canon": 60, "half": 15 } }
        },
        "RETURN": {
          "NOISE":   { "present": 1,    "enter": { "canon": 0,   "half": 0 },  "exit": "MODULE_END",                 "fadeIn": { "canon": 60, "half": 15 }, "fadeOut": { "canon": 60, "half": 15 } },
          "ELEMENT": { "present": 1,    "enter": { "canon": 0,   "half": 0 },  "exit": "MODULE_END",                 "fadeIn": { "canon": 30, "half": 10 }, "fadeOut": { "canon": 60, "half": 15 } },
          "FX":      { "present": 1,    "enter": { "canon": 0,   "half": 0 },  "exit": "MODULE_END",                 "fadeIn": { "canon": 30, "half": 10 }, "fadeOut": { "canon": 60, "half": 15 } },
          "ISO":     { "present": 1,    "enter": { "canon": 60,  "half": 20 }, "exit": "MODULE_END",                 "fadeIn": { "canon": 60, "half": 15 }, "fadeOut": { "canon": 60, "half": 15 }, "after": "ELEMENT" },
          "PLANET":  { "present": 1,    "enter": { "canon": 120, "half": 25 }, "exit": "MODULE_END",                 "fadeIn": { "canon": 60, "half": 15 }, "fadeOut": { "canon": 60, "half": 15 }, "after": "ISO" },
          "PAD":     { "present": 1,    "enter": { "canon": 180, "half": 30 }, "exit": { "canon": 570, "half": 20 }, "fadeIn": { "canon": 60, "half": 15 }, "fadeOut": { "canon": 60, "half": 15 }, "after": "PLANET" },
          "BASS":    { "present": 1,    "enter": { "canon": 240, "half": 30 }, "exit": { "canon": 570, "half": 20 }, "fadeIn": { "canon": 0,  "half": 0 },  "fadeOut": { "canon": 60, "half": 15 }, "after": "PAD" },
          "ARP":     { "present": 0.9,  "enter": { "canon": 270, "half": 30 }, "exit": { "canon": 570, "half": 20 }, "fadeIn": { "canon": 60, "half": 15 }, "fadeOut": { "canon": 60, "half": 15 }, "after": "BASS" },
          "MELODY":  { "present": 0.85, "enter": { "canon": 390, "half": 45 }, "exit": { "canon": 570, "half": 20 }, "fadeIn": { "canon": 60, "half": 15 }, "fadeOut": { "canon": 60, "half": 15 }, "after": "ARP" }
        }
      }
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/config.test.ts`
Expected: PASS (all config tests, including the two new ones).

- [ ] **Step 6: Record the decision** — create `docs/adr/0007-generated-playback-uses-volume-envelope.md`:

```markdown
# ADR-0007: Generated / composition playback uses the volume-envelope path

**Status:** Accepted (2026-07-09) · Supersedes [ADR-0002] *for composition playback only*.

## Context
The generative framework (docs/generative/03-generation-framework.md) emits ~1-min fades per region.
ADR-0002 established that the single-module designer treats a clip as playback trigger/release, with
the sample's baked fades as the only fades.

## Decision
Generated **composition** playback applies a ~1-min cosine **volume envelope** per region via
`regionEnvAt` / `trackScalarAt`. The shipping **single-module** designer is unchanged (still
trigger/release, ADR-0002). The two paths coexist: baked fades for single-module audition,
volume envelopes for composition playback.

## Consequences
- The generator only needs to emit good `fadeIn/fadeOut` values; no new fade code.
- Hearing the envelope fades in-app depends on surfacing the composition scheduler (ROADMAP Phase C).
```

Then in `docs/PRD.md`, replace the "Baked fades" principle line (§8) with:

```markdown
  - **Fades:** the single-module designer treats a clip as playback trigger/release — baked sample
    fades are the only fades there ([ADR-0002]). **Generated composition playback** applies a ~1-min
    cosine volume envelope per region ([ADR-0007]).
```

- [ ] **Step 7: Commit**

```bash
git add config/ecosonic.config.json src/config.ts src/config.test.ts docs/adr/0007-generated-playback-uses-volume-envelope.md docs/PRD.md
git commit -m "feat(config): add layerTwo.generation grammar rules + drift scales; record ADR-0007"
```

---

### Task 2: Deterministic PRNG

**Files:**
- Create: `src/arrange/prng.ts`
- Test: `src/arrange/prng.test.ts`

**Interfaces:**
- Produces: `interface RNG { float(): number; range(lo: number, hi: number): number; chance(p: number): boolean }` and `makeRng(seed: number): RNG`.

- [ ] **Step 1: Write the failing test** — create `src/arrange/prng.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { makeRng } from '@/arrange/prng';

describe('makeRng', () => {
  it('is deterministic — same seed yields the same sequence', () => {
    const a = makeRng(42), b = makeRng(42);
    const seqA = [a.float(), a.float(), a.float()];
    const seqB = [b.float(), b.float(), b.float()];
    expect(seqA).toEqual(seqB);
  });
  it('different seeds diverge', () => {
    const a = makeRng(1), b = makeRng(2);
    expect(a.float()).not.toBe(b.float());
  });
  it('float() stays in [0,1)', () => {
    const r = makeRng(7);
    for (let i = 0; i < 1000; i++) {
      const x = r.float();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
  it('range(lo,hi) stays within bounds', () => {
    const r = makeRng(9);
    for (let i = 0; i < 1000; i++) {
      const x = r.range(10, 20);
      expect(x).toBeGreaterThanOrEqual(10);
      expect(x).toBeLessThanOrEqual(20);
    }
  });
  it('chance(0) is always false and chance(1) always true', () => {
    const r = makeRng(3);
    expect(r.chance(0)).toBe(false);
    expect(r.chance(1)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/arrange/prng.test.ts`
Expected: FAIL — "makeRng is not defined" / cannot find module `@/arrange/prng`.

- [ ] **Step 3: Write the implementation** — create `src/arrange/prng.ts`:

```ts
/** A small deterministic PRNG (mulberry32) + convenience helpers. Seeded so the generator is pure:
 *  same seed → same stream. Used instead of Math.random() (which is banned in generator code). */
export interface RNG {
  /** Next value in [0, 1). */
  float(): number;
  /** Uniform in [lo, hi]. */
  range(lo: number, hi: number): number;
  /** True with probability p (p ≤ 0 → never, p ≥ 1 → always). */
  chance(p: number): boolean;
}

export function makeRng(seed: number): RNG {
  let a = seed >>> 0;
  const float = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    float,
    range: (lo, hi) => lo + (hi - lo) * float(),
    chance: (p) => (p <= 0 ? false : p >= 1 ? true : float() < p),
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/arrange/prng.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/arrange/prng.ts src/arrange/prng.test.ts
git commit -m "feat(arrange): deterministic seeded PRNG for the generator"
```

---

### Task 3: `generateModeTemplate` (the grammar core)

**Files:**
- Modify: `src/arrange/types.ts` (add `Drift`, `DRIFTS`, `STACK_ORDER`, `stackIndex`)
- Create: `src/arrange/generate/generateModeTemplate.ts`
- Test: `src/arrange/generate/generateModeTemplate.test.ts`

**Interfaces:**
- Consumes: `makeRng` (Task 2); `config.layerTwo.generation`, types `GenLayerRule`/`GenRange` (Task 1); `ArrTrack`, `Mode`, `ModeTemplate`, `TemplateRegion` (existing `types.ts`); `EcosonicConfig` (existing `config.ts`).
- Produces:
  - `type Drift = 'STRICT' | 'MODERATE' | 'EXPLORATORY'`, `const DRIFTS: Drift[]`
  - `const STACK_ORDER: Category[]`, `stackIndex(c: Category): number`
  - `generateModeTemplate(tracks: ArrTrack[], mode: Mode, drift: Drift, seed: number, cfg?: EcosonicConfig): ModeTemplate`

- [ ] **Step 1: Add the shared types** — append to `src/arrange/types.ts`:

```ts
export type Drift = 'STRICT' | 'MODERATE' | 'EXPLORATORY';
export const DRIFTS: Drift[] = ['STRICT', 'MODERATE', 'EXPLORATORY'];

/** Fixed vertical grammar (bottom → top) from the production brief. Drives entrance ordering. */
export const STACK_ORDER: Category[] = [
  'NOISE', 'ELEMENT', 'ELEMENT_SUB', 'FX', 'ISO', 'PLANET', 'PAD', 'BASS', 'ARP', 'MELODY',
];
export const stackIndex = (c: Category): number => STACK_ORDER.indexOf(c);
```

- [ ] **Step 2: Write the failing test** — create `src/arrange/generate/generateModeTemplate.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { generateModeTemplate } from '@/arrange/generate/generateModeTemplate';
import type { ArrTrack, Drift } from '@/arrange/types';
import { config } from '@/config';

const D = config.layerTwo.moduleSeconds;
const t = (id: string, category: ArrTrack['category']): ArrTrack => ({
  id, category, label: id, sample: { name: id, path: id, bytes: 1 }, ceilingDb: 0, locked: false,
});
const introTracks: ArrTrack[] = [
  t('n', 'NOISE'), t('e', 'ELEMENT'), t('iso', 'ISO'), t('pl', 'PLANET'),
  t('pad', 'PAD'), t('bass', 'BASS'), t('arp', 'ARP'), t('mel', 'MELODY'),
];
const byTrack = (tpl: ReturnType<typeof generateModeTemplate>, id: string) =>
  tpl.regions.find((r) => r.trackId === id);

describe('generateModeTemplate', () => {
  it('is deterministic for a given (mode, drift, seed)', () => {
    const a = generateModeTemplate(introTracks, 'INTRODUCTION', 'MODERATE', 123);
    const b = generateModeTemplate(introTracks, 'INTRODUCTION', 'MODERATE', 123);
    expect(a).toEqual(b);
  });
  it('varies with the seed', () => {
    const a = generateModeTemplate(introTracks, 'INTRODUCTION', 'MODERATE', 1);
    const b = generateModeTemplate(introTracks, 'INTRODUCTION', 'MODERATE', 2);
    expect(a).not.toEqual(b);
  });
  it('keeps bottom-up entrance order across 50 seeds (ISO ≤ PLANET ≤ PAD ≤ BASS ≤ MELODY)', () => {
    for (let s = 0; s < 50; s++) {
      const tpl = generateModeTemplate(introTracks, 'INTRODUCTION', 'MODERATE', s);
      const e = (id: string) => byTrack(tpl, id)?.enterSec ?? Infinity;
      expect(e('iso')).toBeLessThanOrEqual(e('pl'));
      expect(e('pl')).toBeLessThanOrEqual(e('pad'));
      expect(e('pad')).toBeLessThanOrEqual(e('bass'));
      if (byTrack(tpl, 'mel')) expect(e('bass')).toBeLessThanOrEqual(e('mel'));
    }
  });
  it('STRICT hugs the canonical value (ISO enter near 60)', () => {
    for (let s = 0; s < 20; s++) {
      const iso = byTrack(generateModeTemplate(introTracks, 'INTRODUCTION', 'STRICT', s), 'iso')!;
      expect(Math.abs(iso.enterSec - 60)).toBeLessThanOrEqual(20 * 0.15 + 0.001);
    }
  });
  it('forces all layers present under STRICT (MELODY always appears)', () => {
    for (let s = 0; s < 20; s++) {
      expect(byTrack(generateModeTemplate(introTracks, 'INTRODUCTION', 'STRICT', s), 'mel')).toBeDefined();
    }
  });
  it('NOISE spans the module with no fade-out in INTRODUCTION', () => {
    const noise = byTrack(generateModeTemplate(introTracks, 'INTRODUCTION', 'EXPLORATORY', 5), 'n')!;
    expect(noise.enterSec).toBe(0);
    expect(noise.exitSec).toBe(D);
    expect(noise.fadeOutSec).toBe(0);
  });
  it('BASS enters with no fade-in (R4 exception)', () => {
    const bass = byTrack(generateModeTemplate(introTracks, 'INTRODUCTION', 'MODERATE', 8), 'bass')!;
    expect(bass.fadeInSec).toBe(0);
  });
  it('DEEP_RELAXATION drops all drivers', () => {
    const deep = generateModeTemplate(introTracks, 'DEEP_RELAXATION', 'MODERATE', 4);
    for (const id of ['pad', 'bass', 'arp', 'mel']) expect(byTrack(deep, id)).toBeUndefined();
    expect(byTrack(deep, 'n')).toBeDefined();
    expect(byTrack(deep, 'iso')).toBeDefined();
  });
  it('staggers a 2nd Element past secondElementEnterSec', () => {
    const tpl = generateModeTemplate([t('e0', 'ELEMENT'), t('e1', 'ELEMENT')], 'INTRODUCTION', 'MODERATE', 2);
    expect(byTrack(tpl, 'e0')!.enterSec).toBe(0);
    expect(byTrack(tpl, 'e1')!.enterSec).toBeGreaterThanOrEqual(config.layerTwo.secondElementEnterSec);
  });
  it('caps each fade to half the clip width', () => {
    const tpl = generateModeTemplate(introTracks, 'INTRODUCTION', 'EXPLORATORY', 11);
    for (const r of tpl.regions) {
      const half = (r.exitSec - r.enterSec) / 2;
      expect(r.fadeInSec).toBeLessThanOrEqual(half + 1e-9);
      expect(r.fadeOutSec).toBeLessThanOrEqual(half + 1e-9);
    }
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/arrange/generate/generateModeTemplate.test.ts`
Expected: FAIL — cannot find module `@/arrange/generate/generateModeTemplate`.

- [ ] **Step 4: Write the implementation** — create `src/arrange/generate/generateModeTemplate.ts`:

```ts
import { config as defaultConfig, type EcosonicConfig, type GenLayerRule, type GenRange } from '@/config';
import type { Category } from '@/types';
import type { ArrTrack, Drift, Mode, ModeTemplate, TemplateRegion } from '@/arrange/types';
import { STACK_ORDER } from '@/arrange/types';
import { makeRng, type RNG } from '@/arrange/prng';

interface DrawnTiming { enter: number; exit: number; fadeIn: number; fadeOut: number }

/** Sample a value from `canon ± half × scale`, clamped to [0, D]. Even at scale 0 it returns canon. */
function sampleRange(r: GenRange, scale: number, rng: RNG, D: number): number {
  const half = r.half * scale;
  const lo = Math.max(0, r.canon - half);
  const hi = Math.min(D, r.canon + half);
  return hi <= lo ? lo : rng.range(lo, hi);
}

/** Generate one mode's timing table from the generation grammar. Pure and seeded.
 *  Draw per-category timings within drift-scaled ranges, enforce bottom-up ordering (R2), then
 *  emit one region per track (shared category timing; a 2nd element staggers; fades capped). */
export function generateModeTemplate(
  tracks: ArrTrack[],
  mode: Mode,
  drift: Drift,
  seed: number,
  cfg: EcosonicConfig = defaultConfig,
): ModeTemplate {
  const rng = makeRng(seed);
  const D = cfg.layerTwo.moduleSeconds;
  const gen = cfg.layerTwo.generation;
  const rule = gen.modeRules[mode];
  const scale = gen.driftScales[drift];
  const minGap = gen.minGapSec;
  const secondEnter = cfg.layerTwo.secondElementEnterSec;

  // 1. Presence + draw, processed bottom-up so `after` targets are already drawn.
  const drawn: Partial<Record<Category, DrawnTiming>> = {};
  for (const cat of STACK_ORDER) {
    const r: GenLayerRule | undefined = rule[cat];
    if (!r) continue; // absent in this mode
    const present = drift === 'STRICT' ? true : r.present >= 1 ? true : rng.chance(r.present);
    if (!present) continue;
    const enter = sampleRange(r.enter, scale, rng, D);
    const exit = r.exit === 'MODULE_END' ? D : sampleRange(r.exit, scale, rng, D);
    const fadeIn = sampleRange(r.fadeIn, scale, rng, D);
    const fadeOut = sampleRange(r.fadeOut, scale, rng, D);
    drawn[cat] = { enter, exit, fadeIn, fadeOut };
  }

  // 2. Enforce bottom-up ordering (R2): clamp enter ≥ enter[after] + minGap; keep within bounds.
  for (const cat of STACK_ORDER) {
    const d = drawn[cat];
    if (!d) continue;
    const after = rule[cat]?.after;
    if (after && drawn[after]) d.enter = Math.max(d.enter, drawn[after]!.enter + minGap);
    d.enter = Math.max(0, Math.min(d.enter, D));
    d.exit = Math.max(d.enter, Math.min(d.exit, D));
  }

  // 3. Emit one region per track. Multiple tracks of a category share its timing, except a
  //    2nd (or later) Element/Sub-Element, which enters no earlier than secondElementEnterSec.
  const seen: Partial<Record<Category, number>> = {};
  const regions: TemplateRegion[] = [];
  for (const track of tracks) {
    const d = drawn[track.category];
    if (!d) continue;
    const idx = seen[track.category] ?? 0;
    seen[track.category] = idx + 1;
    const isElementish = track.category === 'ELEMENT' || track.category === 'ELEMENT_SUB';
    const enterSec = isElementish && idx >= 1 ? Math.max(d.enter, secondEnter) : d.enter;
    const exitSec = Math.max(enterSec, Math.min(d.exit, D));
    const halfWidth = (exitSec - enterSec) / 2;
    regions.push({
      trackId: track.id,
      enterSec,
      exitSec,
      fadeInSec: Math.min(d.fadeIn, halfWidth),
      fadeOutSec: Math.min(d.fadeOut, halfWidth),
    });
  }

  return { mode, regions };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/arrange/generate/generateModeTemplate.test.ts`
Expected: PASS (all 10 tests).

- [ ] **Step 6: Commit**

```bash
git add src/arrange/types.ts src/arrange/generate/generateModeTemplate.ts src/arrange/generate/generateModeTemplate.test.ts
git commit -m "feat(arrange): generateModeTemplate — seeded grammar with drift + bottom-up ordering"
```

---

### Task 4: `validateTemplate` (invariants I1–I6)

**Files:**
- Create: `src/arrange/generate/validateTemplate.ts`
- Test: `src/arrange/generate/validateTemplate.test.ts`

**Interfaces:**
- Consumes: `generateModeTemplate` (Task 3); `ModeTemplate`, `ArrTrack`, `Mode`, `Category` (types); `EcosonicConfig`.
- Produces:
  - `interface Violation { code: string; message: string }`
  - `validateTemplate(template: ModeTemplate, tracks: ArrTrack[], cfg?: EcosonicConfig): { ok: boolean; violations: Violation[] }`

- [ ] **Step 1: Write the failing test** — create `src/arrange/generate/validateTemplate.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { validateTemplate } from '@/arrange/generate/validateTemplate';
import { generateModeTemplate } from '@/arrange/generate/generateModeTemplate';
import type { ArrTrack, ModeTemplate } from '@/arrange/types';
import { DRIFTS } from '@/arrange/types';
import { config } from '@/config';

const t = (id: string, category: ArrTrack['category']): ArrTrack => ({
  id, category, label: id, sample: { name: id, path: id, bytes: 1 }, ceilingDb: 0, locked: false,
});
const tracks: ArrTrack[] = [
  t('n', 'NOISE'), t('e', 'ELEMENT'), t('iso', 'ISO'), t('pl', 'PLANET'),
  t('pad', 'PAD'), t('bass', 'BASS'), t('arp', 'ARP'), t('mel', 'MELODY'),
];

describe('validateTemplate', () => {
  it('passes every generated template across modes, drifts and seeds', () => {
    for (const mode of config.layerTwo.modes) {
      for (const drift of DRIFTS) {
        for (let s = 0; s < 30; s++) {
          const tpl = generateModeTemplate(tracks, mode, drift, s);
          const res = validateTemplate(tpl, tracks);
          expect(res.ok, `${mode}/${drift}/${s}: ${JSON.stringify(res.violations)}`).toBe(true);
        }
      }
    }
  });
  it('flags an inverted entrance order (I2)', () => {
    const bad: ModeTemplate = {
      mode: 'INTRODUCTION',
      regions: [
        { trackId: 'n', enterSec: 0, exitSec: 600, fadeInSec: 0, fadeOutSec: 0 },
        { trackId: 'iso', enterSec: 300, exitSec: 540, fadeInSec: 30, fadeOutSec: 30 },
        { trackId: 'pl', enterSec: 120, exitSec: 540, fadeInSec: 30, fadeOutSec: 30 }, // before ISO!
      ],
    };
    const res = validateTemplate(bad, tracks);
    expect(res.ok).toBe(false);
    expect(res.violations.some((v) => v.code === 'I2_ORDER')).toBe(true);
  });
  it('flags a missing continuity bed (I1)', () => {
    const bad: ModeTemplate = {
      mode: 'INTRODUCTION',
      regions: [{ trackId: 'pad', enterSec: 180, exitSec: 540, fadeInSec: 30, fadeOutSec: 30 }],
    };
    const res = validateTemplate(bad, tracks);
    expect(res.ok).toBe(false);
    expect(res.violations.some((v) => v.code === 'I1_CONTINUITY')).toBe(true);
  });
  it('flags a driver present in DEEP_RELAXATION (I4)', () => {
    const bad: ModeTemplate = {
      mode: 'DEEP_RELAXATION',
      regions: [
        { trackId: 'n', enterSec: 0, exitSec: 480, fadeInSec: 30, fadeOutSec: 30 },
        { trackId: 'e', enterSec: 0, exitSec: 600, fadeInSec: 30, fadeOutSec: 30 },
        { trackId: 'bass', enterSec: 240, exitSec: 540, fadeInSec: 0, fadeOutSec: 30 }, // forbidden
      ],
    };
    const res = validateTemplate(bad, tracks);
    expect(res.ok).toBe(false);
    expect(res.violations.some((v) => v.code === 'I4_MODE')).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/arrange/generate/validateTemplate.test.ts`
Expected: FAIL — cannot find module `@/arrange/generate/validateTemplate`.

- [ ] **Step 3: Write the implementation** — create `src/arrange/generate/validateTemplate.ts`:

```ts
import { config as defaultConfig, type EcosonicConfig } from '@/config';
import type { Category } from '@/types';
import type { ArrTrack, ModeTemplate, TemplateRegion } from '@/arrange/types';
import { STACK_ORDER } from '@/arrange/types';

export interface Violation { code: string; message: string }

const DRIVERS: Category[] = ['PAD', 'BASS', 'ARP', 'MELODY', 'FX'];

/** True if `nums` rises (non-decreasing) then falls (non-increasing) — a single density peak. */
function isUnimodal(nums: number[]): boolean {
  let i = 0;
  while (i + 1 < nums.length && nums[i + 1] >= nums[i]) i++;
  while (i + 1 < nums.length && nums[i + 1] <= nums[i]) i++;
  return i === nums.length - 1;
}

/** Check a template against the brief's invariants (I1–I6). Pure oracle: repairs live in the
 *  generator, this only reports. `tracks` maps region trackId → category. */
export function validateTemplate(
  template: ModeTemplate,
  tracks: ArrTrack[],
  cfg: EcosonicConfig = defaultConfig,
): { ok: boolean; violations: Violation[] } {
  const D = cfg.layerTwo.moduleSeconds;
  const catOf = new Map(tracks.map((t) => [t.id, t.category]));
  const regions = template.regions;
  const v: Violation[] = [];
  const catOfRegion = (r: TemplateRegion) => catOf.get(r.trackId);

  // I1 — continuity: a NOISE region exists; in Introduction/Return it spans [0, D].
  const noise = regions.filter((r) => catOfRegion(r) === 'NOISE');
  if (noise.length === 0) {
    v.push({ code: 'I1_CONTINUITY', message: 'no NOISE (continuity bed) present' });
  } else if (template.mode !== 'DEEP_RELAXATION' && !noise.some((r) => r.enterSec === 0 && r.exitSec === D)) {
    v.push({ code: 'I1_CONTINUITY', message: 'NOISE does not span the module' });
  }

  // I2 — bottom-up order: earliest enter per category is non-decreasing up the stack.
  const earliest = new Map<Category, number>();
  for (const r of regions) {
    const c = catOfRegion(r);
    if (!c) continue;
    earliest.set(c, Math.min(earliest.get(c) ?? Infinity, r.enterSec));
  }
  const present = STACK_ORDER.filter((c) => earliest.has(c));
  for (let i = 1; i < present.length; i++) {
    if (earliest.get(present[i])! < earliest.get(present[i - 1])! - 1e-6) {
      v.push({ code: 'I2_ORDER', message: `${present[i]} enters before ${present[i - 1]}` });
    }
  }

  // I3 — single-peaked density.
  const counts: number[] = [];
  for (let s = 1; s < D; s += 5) counts.push(regions.filter((r) => s > r.enterSec && s < r.exitSec).length);
  if (!isUnimodal(counts)) v.push({ code: 'I3_ARCH', message: 'density is not single-peaked' });

  // I4 — mode constraints: no drivers in Deep Relaxation.
  if (template.mode === 'DEEP_RELAXATION') {
    for (const r of regions) {
      const c = catOfRegion(r);
      if (c && DRIVERS.includes(c)) v.push({ code: 'I4_MODE', message: `${c} present in DEEP_RELAXATION` });
    }
  }

  // I5 — bounds: 0 ≤ enter < exit ≤ D and fades fit the clip.
  for (const r of regions) {
    if (r.enterSec < 0 || r.exitSec > D || r.enterSec >= r.exitSec) {
      v.push({ code: 'I5_BOUNDS', message: `region ${r.trackId} out of bounds` });
    }
    if (r.fadeInSec + r.fadeOutSec > r.exitSec - r.enterSec + 1e-6) {
      v.push({ code: 'I5_BOUNDS', message: `region ${r.trackId} fades exceed width` });
    }
  }

  // I6 — no silent gap: ≥1 region active at every sampled instant.
  for (let s = 1; s < D; s += 5) {
    if (!regions.some((r) => s > r.enterSec && s < r.exitSec)) {
      v.push({ code: 'I6_GAP', message: `silence at ${s}s` });
      break;
    }
  }

  return { ok: v.length === 0, violations: v };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/arrange/generate/validateTemplate.test.ts`
Expected: PASS. If the property test (`passes every generated template…`) fails for some seed, that is a real `generateModeTemplate` bug — fix the generator (Task 3), not the assertion.

- [ ] **Step 5: Commit**

```bash
git add src/arrange/generate/validateTemplate.ts src/arrange/generate/validateTemplate.test.ts
git commit -m "feat(arrange): validateTemplate — invariants I1–I6 as a pure oracle"
```

---

### Task 5: `generateComposition` (session-level assembly)

**Files:**
- Create: `src/arrange/generate/generateComposition.ts`
- Test: `src/arrange/generate/generateComposition.test.ts`

**Interfaces:**
- Consumes: `generateModeTemplate` (Task 3); `buildSequence` (existing); `Composition`, `Mode`, `ModeTemplate`, `ArrTrack`, `Drift` (types); `trackScalarAt` (existing, used by the test to prove envelopes render).
- Produces: `generateComposition(input: { tracks: ArrTrack[]; tuningHz: number; masterDb: number }, totalSecTarget: number, drift: Drift, seed: number, cfg?: EcosonicConfig): Composition`.

Note: `Composition.templates` holds one template per mode (shared by all instances of that mode), so this v1 varies **per section** (each of Introduction/Deep Relaxation/Return is a distinct generated arrangement), not per repeated instance. Per-instance variation is a documented follow-up (requires extending the `Composition` model).

- [ ] **Step 1: Write the failing test** — create `src/arrange/generate/generateComposition.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { generateComposition } from '@/arrange/generate/generateComposition';
import { trackScalarAt } from '@/arrange/trackScalar';
import type { ArrTrack } from '@/arrange/types';
import { config } from '@/config';

const t = (id: string, category: ArrTrack['category']): ArrTrack => ({
  id, category, label: id, sample: { name: id, path: id, bytes: 1 }, ceilingDb: 0, locked: false,
});
const input = {
  tracks: [t('n', 'NOISE'), t('e', 'ELEMENT'), t('iso', 'ISO'), t('pad', 'PAD')],
  tuningHz: 440,
  masterDb: 0,
};

describe('generateComposition', () => {
  it('builds a composition with a template per mode and a sequence', () => {
    const comp = generateComposition(input, 30 * 60, 'MODERATE', 1);
    for (const mode of config.layerTwo.modes) expect(comp.templates[mode].regions.length).toBeGreaterThan(0);
    expect(comp.sequence.length).toBe(3); // 30 min / 10-min modules
    expect(comp.tuningHz).toBe(440);
  });
  it('is deterministic for a given seed', () => {
    expect(generateComposition(input, 1800, 'MODERATE', 7))
      .toEqual(generateComposition(input, 1800, 'MODERATE', 7));
  });
  it('renders the ~1-min NOISE fade-in as a rising volume envelope', () => {
    const comp = generateComposition(input, 1800, 'MODERATE', 1);
    // Introduction instance covers [0,600]; NOISE fades in over 60s (canon 60, half 0).
    // At t=30 (halfway up the cosine ramp) the scalar is ~0.5, and clearly between 0 and 1.
    const noise = input.tracks[0];
    const mid = trackScalarAt(comp, noise, 30);
    expect(mid).toBeGreaterThan(0.3);
    expect(mid).toBeLessThan(0.7);
    // Fully in by t=120 (past the fade).
    expect(trackScalarAt(comp, noise, 120)).toBeGreaterThan(0.95);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/arrange/generate/generateComposition.test.ts`
Expected: FAIL — cannot find module `@/arrange/generate/generateComposition`.

- [ ] **Step 3: Write the implementation** — create `src/arrange/generate/generateComposition.ts`:

```ts
import { config as defaultConfig, type EcosonicConfig } from '@/config';
import type { ArrTrack, Composition, Drift, Mode, ModeTemplate } from '@/arrange/types';
import { generateModeTemplate } from '@/arrange/generate/generateModeTemplate';
import { buildSequence } from '@/arrange/buildSequence';

/** Generate a whole composition: one seeded template per mode (a distinct arrangement per section),
 *  laid out on the standard module sequence. Mirrors buildComposition but swaps the template source,
 *  so the existing scheduler (trackScalarAt → regionEnvAt) plays it — volume fades included. */
export function generateComposition(
  input: { tracks: ArrTrack[]; tuningHz: number; masterDb: number },
  totalSecTarget: number,
  drift: Drift,
  seed: number,
  cfg: EcosonicConfig = defaultConfig,
): Composition {
  const templates = {} as Record<Mode, ModeTemplate>;
  cfg.layerTwo.modes.forEach((mode, i) => {
    templates[mode] = generateModeTemplate(input.tracks, mode, drift, seed + i * 1000, cfg);
  });
  const { sequence, bridges, totalSec } = buildSequence(totalSecTarget, cfg);
  return {
    tracks: input.tracks,
    templates,
    sequence,
    bridges,
    totalSec,
    tuningHz: input.tuningHz,
    masterDb: input.masterDb,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/arrange/generate/generateComposition.test.ts`
Expected: PASS (all 3 tests — including the envelope-fade check).

- [ ] **Step 5: Commit**

```bash
git add src/arrange/generate/generateComposition.ts src/arrange/generate/generateComposition.test.ts
git commit -m "feat(arrange): generateComposition — per-section generated templates on the module sequence"
```

---

### Task 6: Wire "Generate" into the Module Designer

**Files:**
- Modify: `src/arrange/arrangementStore.ts` (add `drift`, `setDrift`, `generateModule`)
- Modify: `src/arrange/arrangementStore.test.ts` (test the new action)
- Modify: `src/components/layer2/ArrangeScreen.tsx` (drift picker + Generate button)

**Interfaces:**
- Consumes: `generateModeTemplate` (Task 3); `Drift`, `DRIFTS` (types).
- Produces (store): state `drift: Drift`; actions `setDrift(d: Drift): void`, `generateModule(): void` (reseeds `moduleRegions` from the generator for the active mode; advances an internal seed so each call differs).

> **AGENTS.md guard:** before editing `ArrangeScreen.tsx`, read `node_modules/next/dist/docs/` for the current client-component conventions. This change adds only standard React buttons — no new Next.js API — and follows the existing mode-picker markup.
>
> **Audible scope:** the single-module designer plays via `useModuleScheduler` (trigger/release, baked fades — ADR-0002). So "Generate" changes **which arrangement you see and hear** (different enters/exits per drift), but the ~1-min *volume* envelope is heard only through composition playback (ADR-0007, ROADMAP Phase C). Do not change `useModuleScheduler`.

- [ ] **Step 1: Write the failing test** — append to `src/arrange/arrangementStore.test.ts` (inside the `describe('arrangementStore', …)` block):

```ts
  it('generateModule reseeds the module for the active mode and defaults drift to MODERATE', () => {
    store.getState().initFrom(sel, 30);
    expect(store.getState().drift).toBe('MODERATE');
    store.getState().generateModule();
    const regions = store.getState().moduleRegions;
    expect(regions.length).toBeGreaterThan(0);
    const noise = regions.find((r) => r.trackId === 'n')!;
    expect(noise.enterSec).toBe(0); // NOISE still spans as the continuity bed
    expect(noise.exitSec).toBe(D);
  });
  it('setDrift changes the drift used by generateModule', () => {
    store.getState().initFrom(sel, 30);
    store.getState().setDrift('STRICT');
    expect(store.getState().drift).toBe('STRICT');
    store.getState().generateModule();
    expect(store.getState().moduleRegions.length).toBeGreaterThan(0);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/arrange/arrangementStore.test.ts`
Expected: FAIL — `store.getState().drift` is undefined / `generateModule` is not a function.

- [ ] **Step 3: Extend the store** — in `src/arrange/arrangementStore.ts`:

(a) Update the imports at the top:

```ts
import type { ArrTrack, Composition, Drift, Mode, TemplateRegion } from '@/arrange/types';
import { buildComposition } from '@/arrange/buildComposition';
import { buildModeTemplate } from '@/arrange/buildModeTemplate';
import { generateModeTemplate } from '@/arrange/generate/generateModeTemplate';
```

(b) Add to the `ArrangementState` interface (after `activeMode: Mode;`):

```ts
  drift: Drift;
```

and to the actions block (after `loadMode: (mode: Mode) => void;`):

```ts
  setDrift: (d: Drift) => void;
  /** Reseed the module's clips from the generative grammar for the active mode. */
  generateModule: () => void;
```

(c) Inside `createArrangementStore`, add a seed counter next to `let selection`:

```ts
    let selection: Selection | null = null;
    let genSeed = 1;
```

(d) Add `drift: 'MODERATE',` to the initial state (after `activeMode: 'INTRODUCTION',`).

(e) Add the two actions (after `loadMode: …`):

```ts
      setDrift: (d) => set({ drift: d }),
      generateModule: () =>
        set((s) => ({
          moduleRegions: generateModeTemplate(s.tracks, s.activeMode, s.drift, genSeed++, config).regions,
          positionSec: 0,
        })),
```

- [ ] **Step 4: Run the store test to verify it passes**

Run: `npx vitest run src/arrange/arrangementStore.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the UI** — in `src/components/layer2/ArrangeScreen.tsx`:

(a) Add to the imports:

```ts
import { DRIFTS } from '@/arrange/types';
```

(b) Add selectors next to the other `useArrangement` calls:

```ts
  const drift = useArrangement((s) => s.drift);
  const setDrift = useArrangement((s) => s.setDrift);
  const generateModule = useArrangement((s) => s.generateModule);
```

(c) In the `<main>` mode-row `<div className="mb-4 flex flex-wrap items-center gap-2">`, after the closing of the modes `.map(...)` and its trailing help `<span>`, append a drift picker + Generate button:

```tsx
          <span className="mx-2 h-4 w-px bg-border" aria-hidden />
          <span className="label mr-1">Variation</span>
          {DRIFTS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDrift(d)}
              aria-pressed={drift === d}
              className={`rounded-full px-3 py-1 text-xs transition-calm ${
                drift === d ? 'text-white' : 'bg-card text-muted-foreground hover:text-foreground'
              }`}
              style={drift === d ? { background: 'var(--accent-ink)' } : undefined}
            >
              {d.charAt(0) + d.slice(1).toLowerCase()}
            </button>
          ))}
          <button
            type="button"
            onClick={() => generateModule()}
            className="ml-2 rounded-full border border-border px-3.5 py-1 text-xs transition-calm hover:text-foreground"
          >
            Generate
          </button>
```

- [ ] **Step 6: Manual verification**

Run: `npm run dev`, go to `/` → pick an element → Continue to Layer Two.
Expected: a **Variation** row (Strict / Moderate / Exploratory) and a **Generate** button appear next to Mode. Clicking **Generate** reshuffles the clips (different entrances/exits); **Strict** keeps them near the canonical layout, **Exploratory** spreads them and may drop ARP/MELODY. Press play — the new arrangement plays. NOISE always spans the full module.

- [ ] **Step 7: Run the full suite**

Run: `npm test`
Expected: PASS (all files, including the existing suites).

- [ ] **Step 8: Commit**

```bash
git add src/arrange/arrangementStore.ts src/arrange/arrangementStore.test.ts src/components/layer2/ArrangeScreen.tsx
git commit -m "feat(layer2): Generate button + drift picker — reseed the module from the grammar"
```

---

## Self-Review

**Spec coverage (against `docs/generative/03-generation-framework.md`):**
- §A.1 `GenLayerRule` model → Task 1 (config + Zod + types). ✓
- §A.2 3-mode drift → Task 1 (`driftScales`) + Task 3 (`sampleRange` scaling, STRICT-forces-present). ✓
- §A.3 generation algorithm (PRNG, presence, draw, order-enforce, exceptions, 2nd-element, fade-cap, assign) → Task 2 + Task 3. ✓
- §A.4 session-level generation → Task 5 (`generateComposition` via `buildSequence`). ✓
- §A.5 validator I1–I6 → Task 4. ✓
- §A.6 envelope fades / decision record → Task 1 (ADR-0007, PRD §8) + Task 5 test (proves envelope renders). ✓
- §A.7 config extension → Task 1. ✓
- Part B (live scheduler) → explicitly deferred; not in this plan. ✓
- Build phases A1–A5 → Tasks 1–6 (A5 "wire into Layer Two" is Task 6, scoped to the existing single-module designer; full composition-view playback is ROADMAP Phase C). ✓

**Placeholder scan:** no TBD/TODO; every code + test block is complete; commands have expected output. ✓

**Type consistency:** `Drift`, `DRIFTS`, `STACK_ORDER` defined in Task 3 and reused verbatim in Tasks 4–6; `GenLayerRule/GenRange` exported in Task 1 and imported in Task 3; `generateModeTemplate` signature `(tracks, mode, drift, seed, cfg?)` identical across Tasks 3–6; `validateTemplate(template, tracks, cfg?)` consistent; `generateComposition(input, totalSecTarget, drift, seed, cfg?)` consistent. ✓

**Known deferral (documented, not a gap):** `Composition.templates` is per-mode, so repeated instances of the same mode in a >30-min session share an arrangement; per-instance variation needs a `Composition` model change — a follow-up, noted in Task 5.

[ADR-0001]: ../../adr/0001-density-is-the-arrangement.md
[ADR-0002]: ../../adr/0002-clips-control-playback-not-gain.md
[ADR-0004]: ../../adr/0004-mode-rules-as-config-data.md
[ADR-0007]: ../../adr/0007-generated-playback-uses-volume-envelope.md

# Remix View — Free-Mix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `/remix` view that draws one authored rule per Arrangement track (honoring absence) from a pool built off the authored session timelines, lays the picks on one continuous 0–`totalSec` timeline, and plays / exports the result through the existing single-module renderer.

**Architecture:** Pure data layer (`src/remix/*`): a markdown parser turns `config/sessions/*.md` into `AuthoredRule[]` (absolute times; sections are metadata tags); a seeded generator picks one rule per track and emits a flat `TemplateRegion[]`. A `nodejs` route serves/accepts sessions. The UI reuses `arrangementStore.tracks` (samples) and the existing offline renderer (`renderModuleToWav` with `moduleSeconds` overridden to the full length) for play/export.

**Tech Stack:** TypeScript, Next.js (app router), React 19, Zustand, Zod, Vitest + @testing-library/react (jsdom). No new dependencies.

## Global Constraints

- **This Next.js has breaking changes.** Before writing any route (`route.ts`) or page (`page.tsx`), read the relevant guide in `node_modules/next/dist/docs/` (per `AGENTS.md`). Match the existing app-router patterns in `src/app/api/analyses/route.ts` (uses `export const runtime = 'nodejs'`, `Response.json(...)`, Zod `safeParse`).
- **Categories (exact set, from `src/types.ts`):** `ISO, PLANET, NOISE, ELEMENT, ELEMENT_SUB, BASS, PAD, DRONE, ARP, MELODY, FX`. `ElementName`: `EARTH, WATER, AIR, FIRE, ETHER`.
- **Times are absolute seconds** on a 0–`totalSec` timeline (`totalSec = durationMin·60`, default 1800). No section-relative conversion. Sections are metadata labels only.
- **No new npm dependencies.** Reuse `makeRng` (`@/arrange/prng`), `TemplateRegion`/`ArrTrack`/`Mode` (`@/arrange/types`), `renderModuleToWav` (`@/arrange/render/renderModuleWav`), `config` (`@/config`).
- **Determinism:** the generator is pure and seeded; same tracks + pool + seed ⇒ same output.
- **Tests:** Vitest runs with `globals: true` (`describe/it/expect` are global) and `environment: 'jsdom'`. Run a single file with `npx vitest run <path>`.
- **Commit after every task.** Conventional-commit messages. End messages with the `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` trailer.

---

## File Structure

- `src/remix/vocab.ts` — layer-name → `{ category, variant? }` (+ `.test.ts`)
- `src/remix/sessionRules.ts` — `Phrase`/`AuthoredRule`/`SessionDoc`/`RuleStore` types + `poolFor()` (+ `.test.ts`)
- `src/remix/parseSessionTimeline.ts` — markdown → `{ rules, warnings }` (+ `.test.ts`)
- `src/remix/loadSessions.ts` — read `config/sessions/*.md` (node fs) → `{ store, warnings }` (+ `.test.ts`)
- `src/remix/generateFreeMix.ts` — pure seeded generator → `{ regions, picks }` (+ `.test.ts`)
- `src/remix/renderFreeMix.ts` — `exportFreeMixWav()` wrapper over `renderModuleToWav` (+ `.test.ts`)
- `src/app/api/sessions/route.ts` — GET (serve store) / POST (upload) (+ `.test.ts`)
- `src/arrange/arrangementStore.ts` — MODIFY: `durationSec` state + `playFreeMix()`
- `src/arrange/useModuleScheduler.ts` — MODIFY: loop at `durationSec`, not the constant
- `src/components/remix/useRemix.ts` — fetch + derive `{ regions, picks }` + regenerate (+ `.test.ts`)
- `src/components/remix/RemixView.tsx`, `TrackPoolRow.tsx`, `ResultTimeline.tsx` — layout A (+ render tests)
- `src/app/remix/page.tsx` — route entry

---

### Task 1: Vocabulary map

**Files:**
- Create: `src/remix/vocab.ts`
- Test: `src/remix/vocab.test.ts`

**Interfaces:**
- Produces: `mapLayer(name: string): { category: Category; variant?: string } | null` — `null` = unknown layer.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { mapLayer } from './vocab';

describe('mapLayer', () => {
  it('maps the beds and drivers 1:1', () => {
    expect(mapLayer('ISO')).toEqual({ category: 'ISO' });
    expect(mapLayer('BASS')).toEqual({ category: 'BASS' });
  });
  it('maps ELEMENTS/SUB ELEMENTS and both PLANET spellings', () => {
    expect(mapLayer('ELEMENTS')).toEqual({ category: 'ELEMENT' });
    expect(mapLayer('SUB ELEMENTS')).toEqual({ category: 'ELEMENT_SUB' });
    expect(mapLayer('PLANET')).toEqual({ category: 'PLANET' });
    expect(mapLayer('PLANETS')).toEqual({ category: 'PLANET' });
  });
  it('maps melody-family variants to MELODY with a variant tag', () => {
    expect(mapLayer('MELODY')).toEqual({ category: 'MELODY' });
    expect(mapLayer('MELODY 2')).toEqual({ category: 'MELODY', variant: 'MELODY 2' });
    expect(mapLayer('SUB MELODY')).toEqual({ category: 'MELODY', variant: 'SUB MELODY' });
    expect(mapLayer('SUB MELODY 2')).toEqual({ category: 'MELODY', variant: 'SUB MELODY 2' });
  });
  it('is case/space tolerant and returns null for unknown', () => {
    expect(mapLayer('  noise ')).toEqual({ category: 'NOISE' });
    expect(mapLayer('THEREMIN')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — `npx vitest run src/remix/vocab.test.ts` → FAIL ("mapLayer is not a function").

- [ ] **Step 3: Write minimal implementation**

```ts
import type { Category } from '@/types';

const EXACT: Record<string, { category: Category; variant?: string }> = {
  'ISO': { category: 'ISO' }, 'NOISE': { category: 'NOISE' }, 'BASS': { category: 'BASS' },
  'PAD': { category: 'PAD' }, 'ARP': { category: 'ARP' }, 'MELODY': { category: 'MELODY' },
  'PLANET': { category: 'PLANET' }, 'PLANETS': { category: 'PLANET' },
  'ELEMENTS': { category: 'ELEMENT' }, 'ELEMENT': { category: 'ELEMENT' },
  'SUB ELEMENTS': { category: 'ELEMENT_SUB' },
  'MELODY 2': { category: 'MELODY', variant: 'MELODY 2' },
  'SUB MELODY': { category: 'MELODY', variant: 'SUB MELODY' },
  'SUB MELODY 2': { category: 'MELODY', variant: 'SUB MELODY 2' },
};

export function mapLayer(name: string): { category: Category; variant?: string } | null {
  return EXACT[name.trim().toUpperCase()] ?? null;
}
```

- [ ] **Step 4: Run test to verify it passes** — `npx vitest run src/remix/vocab.test.ts` → PASS.

- [ ] **Step 5: Commit** — `git add src/remix/vocab.ts src/remix/vocab.test.ts && git commit -m "feat(remix): layer-name → Category vocabulary map"`

---

### Task 2: Rule-store types + pool

**Files:**
- Create: `src/remix/sessionRules.ts`
- Test: `src/remix/sessionRules.test.ts`

**Interfaces:**
- Produces:
  - `interface Phrase { enterSec; exitSec; fadeInSec; fadeOutSec }` (all `number`, absolute seconds)
  - `interface AuthoredRule { category: Category; variant?: string; section: Mode; phrases: Phrase[]; source: { element: ElementName; sessionId: string; track: string } }`
  - `interface SessionDoc { id: string; element: ElementName; label: string; rules: AuthoredRule[] }`
  - `type RuleStore = Record<ElementName, SessionDoc[]>`
  - `poolFor(store: RuleStore, category: Category): AuthoredRule[]`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { poolFor, type RuleStore, type AuthoredRule } from './sessionRules';

const rule = (category: AuthoredRule['category'], element: 'WATER' | 'FIRE'): AuthoredRule => ({
  category, section: 'INTRODUCTION',
  phrases: [{ enterSec: 0, exitSec: 60, fadeInSec: 0, fadeOutSec: 0 }],
  source: { element, sessionId: `${element}-1`, track: category },
});

describe('poolFor', () => {
  it('collects rules of a category across all elements and sessions', () => {
    const store: RuleStore = {
      WATER: [{ id: 'WATER-1', element: 'WATER', label: 'w', rules: [rule('MELODY', 'WATER'), rule('BASS', 'WATER')] }],
      FIRE:  [{ id: 'FIRE-1',  element: 'FIRE',  label: 'f', rules: [rule('MELODY', 'FIRE')] }],
      EARTH: [], AIR: [], ETHER: [],
    };
    expect(poolFor(store, 'MELODY')).toHaveLength(2);
    expect(poolFor(store, 'BASS')).toHaveLength(1);
    expect(poolFor(store, 'DRONE')).toHaveLength(0); // absent → empty pool
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — `npx vitest run src/remix/sessionRules.test.ts` → FAIL.

- [ ] **Step 3: Write minimal implementation**

```ts
import type { Category, ElementName } from '@/types';
import type { Mode } from '@/arrange/types';

export interface Phrase { enterSec: number; exitSec: number; fadeInSec: number; fadeOutSec: number }
export interface AuthoredRule {
  category: Category;
  variant?: string;
  section: Mode;
  phrases: Phrase[];
  source: { element: ElementName; sessionId: string; track: string };
}
export interface SessionDoc { id: string; element: ElementName; label: string; rules: AuthoredRule[] }
export type RuleStore = Record<ElementName, SessionDoc[]>;

export function poolFor(store: RuleStore, category: Category): AuthoredRule[] {
  const out: AuthoredRule[] = [];
  for (const docs of Object.values(store)) {
    for (const doc of docs) for (const r of doc.rules) if (r.category === category) out.push(r);
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes** — PASS.

- [ ] **Step 5: Commit** — `git commit -am "feat(remix): authored-rule store types + poolFor"`

---

### Task 3: Markdown parser — core rows, fuzzy tokens, validation

**Files:**
- Create: `src/remix/parseSessionTimeline.ts`
- Test: `src/remix/parseSessionTimeline.test.ts`

**Interfaces:**
- Consumes: `mapLayer` (Task 1); `AuthoredRule`, `Phrase` (Task 2).
- Produces: `parseSessionTimeline(md: string, element: ElementName): { rules: AuthoredRule[]; warnings: string[] }`
- Internal helper (exported for tests): `parseClock(s: string): number | null` — `"9:30" → 570`, `"~2:30" → 150`, non-clock → `null`.

**Notes for the implementer:**
- Section headers look like `## Section 1 - Introduction (0:00-10:00)`. Section index → `Mode`: 1→`INTRODUCTION`, 2→`DEEP_RELAXATION`, 3→`RETURN`. The header's time range gives the section window; a row's `section` tag = the section header it appears under. **Times stay absolute** (do NOT subtract the section start).
- Table rows: `| Layer | Starts | Full Level | Starts Leaving | Ends |`. Skip the header row and the `|---|` separator.
- Column resolution → one `Phrase` (Task 4 adds multi-phrase):
  - `enterSec = parseClock(Starts)`, `exitSec = end` where `end`: a clock → that; `End of section` → section end; else section end.
  - `fadeInSec`: if `Full Level` is a clock (e.g. `10:30 (Fade in)`) → `fullClock − enterSec` (min 0); `Immediate`/none → 0.
  - `fadeOutSec`: if `Starts Leaving` is a clock → `exitSec − leaveClock` (min 0); `End of ... phrase`/`Continuous`/`Automation only`/`-` → 0.
  - `Continuous`/`Automation only` in `Starts Leaving` **and** `End of section` in `Ends` → the phrase spans to section end with `fadeOut = 0`.
- **Absent row:** every data cell is `-` (or empty) → skip, no rule.
- **Unknown layer:** `mapLayer` returns `null` → push warning `"<element> · <section> · <name>: unknown layer — skipped"`, skip.
- **Impossible row:** after resolution `enterSec >= exitSec` → push warning `"<element> · <section> · <name>: start <a> after end <b> — skipped"`, skip.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { parseSessionTimeline, parseClock } from './parseSessionTimeline';

const md = `# Water Session Layer Timeline

## Section 1 - Introduction (0:00-10:00)

| Layer | Starts | Full Level | Starts Leaving | Ends |
|---|---|---|---|---|
| ISO | ~1:00 | ~2:00 (Fade in) | ~7:00 | ~9:00 (Fade out) |
| NOISE | 0:00 | Immediate | Continuous | End of section |
| SUB MELODY | - | - | - | - |
| THEREMIN | 0:00 | Immediate | - | 5:00 |
`;

describe('parseSessionTimeline', () => {
  it('parses clocks incl. ~approx', () => {
    expect(parseClock('9:30')).toBe(570);
    expect(parseClock('~2:30')).toBe(150);
    expect(parseClock('Immediate')).toBeNull();
  });
  it('resolves a fade-in/out row to one absolute phrase, tagged by section', () => {
    const { rules } = parseSessionTimeline(md, 'WATER');
    const iso = rules.find((r) => r.category === 'ISO')!;
    expect(iso.section).toBe('INTRODUCTION');
    expect(iso.phrases[0]).toEqual({ enterSec: 60, exitSec: 540, fadeInSec: 60, fadeOutSec: 60 });
  });
  it('treats Continuous + End of section as a full-span, no-fade bed', () => {
    const { rules } = parseSessionTimeline(md, 'WATER');
    const noise = rules.find((r) => r.category === 'NOISE')!;
    expect(noise.phrases[0]).toEqual({ enterSec: 0, exitSec: 600, fadeInSec: 0, fadeOutSec: 0 });
  });
  it('skips all-dash rows and warns on unknown layers', () => {
    const { rules, warnings } = parseSessionTimeline(md, 'WATER');
    expect(rules.find((r) => r.variant === 'SUB MELODY')).toBeUndefined(); // all-dash → absent
    expect(warnings.some((w) => w.includes('THEREMIN'))).toBe(true);
  });
  it('skips impossible rows with a warning', () => {
    const bad = `## Section 2 - Deep Relaxation (10:00-20:00)\n\n| Layer | Starts | Full Level | Starts Leaving | Ends |\n|---|---|---|---|---|\n| NOISE | 19:00 | 20:00 (Fade in) | 9:30 (Fade out) | 10:30 |\n`;
    const { rules, warnings } = parseSessionTimeline(bad, 'AIR');
    expect(rules).toHaveLength(0);
    expect(warnings.some((w) => w.includes('start') && w.includes('NOISE'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — FAIL.

- [ ] **Step 3: Write minimal implementation**

```ts
import type { ElementName } from '@/types';
import type { Mode } from '@/arrange/types';
import { mapLayer } from './vocab';
import type { AuthoredRule, Phrase } from './sessionRules';

const SECTION_BY_INDEX: Mode[] = ['INTRODUCTION', 'DEEP_RELAXATION', 'RETURN'];

/** "9:30" | "~2:30" → seconds; anything non-clock → null. */
export function parseClock(s: string): number | null {
  const m = s.trim().replace(/^~/, '').match(/^(\d+):(\d{2})$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

const isBlank = (s: string) => s.trim() === '' || s.trim() === '-';

export function parseSessionTimeline(
  md: string, element: ElementName,
): { rules: AuthoredRule[]; warnings: string[] } {
  const rules: AuthoredRule[] = [];
  const warnings: string[] = [];
  const lines = md.split(/\r?\n/);
  let section: Mode | null = null;
  let sectionEnd = 0;

  for (const line of lines) {
    const header = line.match(/^##\s*Section\s*(\d)\s*-\s*[^(]*\((\d+:\d{2})-(\d+:\d{2})\)/i);
    if (header) {
      section = SECTION_BY_INDEX[Number(header[1]) - 1] ?? null;
      sectionEnd = parseClock(header[3]) ?? 0;
      continue;
    }
    if (!section || !line.trim().startsWith('|')) continue;
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length < 5) continue;
    const [name, starts, full, leaving, ends] = cells;
    if (name === 'Layer' || /^-+$/.test(name)) continue; // header / separator
    if ([starts, full, leaving, ends].every(isBlank)) continue; // absent

    const mapped = mapLayer(name);
    if (!mapped) { warnings.push(`${element} · ${section} · ${name}: unknown layer — skipped`); continue; }

    const enterSec = parseClock(starts) ?? 0;
    const endClock = parseClock(ends);
    const exitSec = endClock ?? sectionEnd; // "End of section"/blank → section end
    const fullClock = parseClock(full);
    const fadeInSec = fullClock !== null ? Math.max(0, fullClock - enterSec) : 0;
    const leaveClock = parseClock(leaving);
    const fadeOutSec = leaveClock !== null ? Math.max(0, exitSec - leaveClock) : 0;

    if (enterSec >= exitSec) {
      warnings.push(`${element} · ${section} · ${name}: start ${enterSec}s after end ${exitSec}s — skipped`);
      continue;
    }
    const phrase: Phrase = { enterSec, exitSec, fadeInSec, fadeOutSec };
    rules.push({
      category: mapped.category, variant: mapped.variant, section,
      phrases: [phrase],
      source: { element, sessionId: `${element}`, track: name },
    });
  }
  return { rules, warnings };
}
```

- [ ] **Step 4: Run test to verify it passes** — PASS.

- [ ] **Step 5: Commit** — `git commit -am "feat(remix): session-timeline parser — rows, fuzzy tokens, validation"`

---

### Task 4: Parser — phrases + same-layer merge

**Files:**
- Modify: `src/remix/parseSessionTimeline.ts`
- Test: `src/remix/parseSessionTimeline.test.ts` (add cases)

**Interfaces:** unchanged signature; behavior extends: comma-lists in `Starts` become multiple phrases (sharing the row's fades, on the outer edges); **multiple rows of the same layer within one section merge into one `AuthoredRule`** whose `phrases` concatenate, each keeping its own fades.

- [ ] **Step 1: Write the failing test (add to the file)**

```ts
it('expands a comma phrase-list into multiple phrases (fades on outer edges)', () => {
  const m = `## Section 1 - Introduction (0:00-10:00)\n\n| Layer | Starts | Full Level | Starts Leaving | Ends |\n|---|---|---|---|---|\n| MELODY | 2:45-4:33, 5:27-7:15 | Immediate | End of each phrase | 7:15 |\n`;
  const { rules } = parseSessionTimeline(m, 'AIR');
  const mel = rules.find((r) => r.category === 'MELODY')!;
  expect(mel.phrases.map((p) => [p.enterSec, p.exitSec])).toEqual([[165, 273], [327, 435]]);
});

it('merges two rows of one layer in a section into one rule with per-phrase fades', () => {
  const m = `## Section 2 - Deep Relaxation (10:00-20:00)\n\n| Layer | Starts | Full Level | Starts Leaving | Ends |\n|---|---|---|---|---|\n| ELEMENTS | 10:00 | Immediate | 10:00 | 12:00 |\n| ELEMENTS | 19:00 | 20:00 (Fade in) | - | 20:00 |\n`;
  const { rules } = parseSessionTimeline(m, 'FIRE');
  const el = rules.filter((r) => r.category === 'ELEMENT');
  expect(el).toHaveLength(1);
  expect(el[0].phrases).toEqual([
    { enterSec: 600, exitSec: 720, fadeInSec: 0, fadeOutSec: 120 },
    { enterSec: 1140, exitSec: 1200, fadeInSec: 60, fadeOutSec: 0 },
  ]);
});
```

- [ ] **Step 2: Run to verify new cases fail** — FAIL.

- [ ] **Step 3: Update implementation**

Replace the single-phrase build with: (a) split `starts` on `,` — for each interval `a-b`, make a phrase `{enter:a, exit:b}`; a lone clock is one phrase `{enter, exit:endClock ?? sectionEnd}`. Apply `fadeIn` to the first phrase, `fadeOut` to the last, 0 elsewhere. (b) Keep a `Map<string /*category+variant+section*/, AuthoredRule>` while iterating a section; a second matching row **appends its phrases** to the existing rule instead of pushing a new one. Reset the map at each section header. Impossible-phrase guard runs per phrase (`enter >= exit` → warn + drop that phrase; if a rule ends with zero phrases, drop the rule).

```ts
// helper
function phrasesFrom(starts: string, endClock: number | null, sectionEnd: number,
                     fadeInSec: number, fadeOutSec: number) {
  const parts = starts.split(',').map((s) => s.trim()).filter(Boolean);
  const spans = parts.map((p) => {
    const [a, b] = p.split('-').map((x) => x.trim());
    const enter = parseClock(a) ?? 0;
    const exit = b !== undefined ? (parseClock(b) ?? sectionEnd) : (endClock ?? sectionEnd);
    return { enterSec: enter, exitSec: exit };
  });
  return spans.map((s, i) => ({
    ...s,
    fadeInSec: i === 0 ? fadeInSec : 0,
    fadeOutSec: i === spans.length - 1 ? fadeOutSec : 0,
  }));
}
```

Use a `Map` keyed by `${mapped.category}|${mapped.variant ?? ''}` (reset on each section header) to merge rows; validate/drop impossible phrases; warn as before.

- [ ] **Step 4: Run tests to verify all pass** — `npx vitest run src/remix/parseSessionTimeline.test.ts` → PASS.

- [ ] **Step 5: Commit** — `git commit -am "feat(remix): parser phrases + same-layer row merge"`

---

### Task 5: Load seed sessions (+ CI guard)

**Files:**
- Create: `src/remix/loadSessions.ts`
- Test: `src/remix/loadSessions.test.ts`

**Interfaces:**
- Consumes: `parseSessionTimeline` (Task 3/4), `RuleStore`/`SessionDoc` (Task 2).
- Produces: `loadSessions(dir?: string): { store: RuleStore; warnings: string[] }` — reads every `*.md` in `dir` (default `config/sessions/`), element from the filename prefix (`water-...` → `WATER`), one `SessionDoc` per file.
- `elementFromFilename(name: string): ElementName | null`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { loadSessions } from './loadSessions';

const seedDir = path.join(process.cwd(), 'config', 'sessions');

describe('loadSessions (seed guard)', () => {
  it('parses all five seed files with ZERO warnings', () => {
    const { store, warnings } = loadSessions(seedDir);
    expect(warnings).toEqual([]);                 // CI guard: seed data stays clean
    expect(Object.keys(store).sort()).toEqual(['AIR', 'EARTH', 'ETHER', 'FIRE', 'WATER'].sort());
    expect(store.WATER.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails** — FAIL (module missing).

- [ ] **Step 3: Write minimal implementation**

```ts
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { ElementName } from '@/types';
import { ELEMENTS } from '@/types';
import { parseSessionTimeline } from './parseSessionTimeline';
import type { RuleStore, SessionDoc } from './sessionRules';

export function elementFromFilename(name: string): ElementName | null {
  const prefix = name.split('-')[0]?.toUpperCase();
  return (ELEMENTS as string[]).includes(prefix ?? '') ? (prefix as ElementName) : null;
}

export function loadSessions(dir: string = path.join(process.cwd(), 'config', 'sessions')):
  { store: RuleStore; warnings: string[] } {
  const store: RuleStore = { EARTH: [], WATER: [], AIR: [], FIRE: [], ETHER: [] };
  const warnings: string[] = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.md'))) {
    const element = elementFromFilename(file);
    if (!element) { warnings.push(`${file}: filename has no element prefix — skipped`); continue; }
    const md = readFileSync(path.join(dir, file), 'utf8');
    const { rules, warnings: w } = parseSessionTimeline(md, element);
    warnings.push(...w);
    const doc: SessionDoc = { id: file.replace(/\.md$/, ''), element, label: file, rules };
    store[element].push(doc);
  }
  return { store, warnings };
}
```

- [ ] **Step 4: Run to verify it passes** — PASS. *(If a seed file warns, fix the `.md` — the guard must stay green.)*

- [ ] **Step 5: Commit** — `git commit -am "feat(remix): load + seed sessions from config/sessions/*.md"`

---

### Task 6: Free-mix generator

**Files:**
- Create: `src/remix/generateFreeMix.ts`
- Test: `src/remix/generateFreeMix.test.ts`

**Interfaces:**
- Consumes: `poolFor`/`AuthoredRule` (Task 2), `makeRng` (`@/arrange/prng`), `ArrTrack`/`TemplateRegion` (`@/arrange/types`).
- Produces:
  - `interface Pick { trackId: string; rule: AuthoredRule; poolSize: number }`
  - `generateFreeMix(tracks: ArrTrack[], pool: (c: Category) => AuthoredRule[], seed: number): { regions: TemplateRegion[]; picks: Pick[] }` — `pool` is a category→rules function (wrap `poolFor(store, …)` at the call site).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { generateFreeMix } from './generateFreeMix';
import type { AuthoredRule } from './sessionRules';
import type { ArrTrack } from '@/arrange/types';

const track = (id: string, category: ArrTrack['category']): ArrTrack => ({
  id, category, label: id, sample: { name: id, path: `${id}.wav`, bytes: 1 }, ceilingDb: 0, locked: false,
});
const rule = (category: AuthoredRule['category'], phrases: AuthoredRule['phrases']): AuthoredRule => ({
  category, section: 'INTRODUCTION', phrases, source: { element: 'WATER', sessionId: 'w', track: category },
});

describe('generateFreeMix', () => {
  const melA = rule('MELODY', [{ enterSec: 100, exitSec: 200, fadeInSec: 0, fadeOutSec: 0 }]);
  const melB = rule('MELODY', [{ enterSec: 300, exitSec: 400, fadeInSec: 0, fadeOutSec: 0 }]);
  const pool = (c: string) => (c === 'MELODY' ? [melA, melB] : []);

  it('is deterministic for a seed and skips absent tracks', () => {
    const tracks = [track('m', 'MELODY'), track('b', 'BASS')]; // BASS pool empty → skipped
    const a = generateFreeMix(tracks, pool as never, 7);
    const b = generateFreeMix(tracks, pool as never, 7);
    expect(a.regions).toEqual(b.regions);
    expect(a.picks.map((p) => p.trackId)).toEqual(['m']); // BASS absent
  });

  it('forces a single-rule pool and emits one region per phrase', () => {
    const two = rule('PAD', [
      { enterSec: 0, exitSec: 120, fadeInSec: 0, fadeOutSec: 120 },
      { enterSec: 540, exitSec: 600, fadeInSec: 60, fadeOutSec: 0 },
    ]);
    const p = (c: string) => (c === 'PAD' ? [two] : []);
    const { regions } = generateFreeMix([track('p', 'PAD')], p as never, 1);
    expect(regions).toHaveLength(2);
    expect(regions.every((r) => r.trackId === 'p')).toBe(true);
    expect(regions[0]).toMatchObject({ enterSec: 0, exitSec: 120, fadeOutSec: 120 });
  });
});
```

- [ ] **Step 2: Run to verify it fails** — FAIL.

- [ ] **Step 3: Write minimal implementation**

```ts
import type { Category } from '@/types';
import type { ArrTrack, TemplateRegion } from '@/arrange/types';
import { makeRng } from '@/arrange/prng';
import type { AuthoredRule } from './sessionRules';

export interface Pick { trackId: string; rule: AuthoredRule; poolSize: number }

export function generateFreeMix(
  tracks: ArrTrack[],
  pool: (c: Category) => AuthoredRule[],
  seed: number,
): { regions: TemplateRegion[]; picks: Pick[] } {
  const rng = makeRng(seed);
  const regions: TemplateRegion[] = [];
  const picks: Pick[] = [];
  for (const track of tracks) {
    const cands = pool(track.category);
    if (cands.length === 0) continue; // absent → skip
    const rule = rng.pick(cands);
    picks.push({ trackId: track.id, rule, poolSize: cands.length });
    for (const p of rule.phrases) {
      regions.push({ trackId: track.id, enterSec: p.enterSec, exitSec: p.exitSec, fadeInSec: p.fadeInSec, fadeOutSec: p.fadeOutSec });
    }
  }
  return { regions, picks };
}
```

*(Verify `rng.pick` exists on the RNG from `@/arrange/prng`; if the API differs, use `cands[Math.floor(rng.range(0, cands.length))]`.)*

- [ ] **Step 4: Run to verify it passes** — PASS.

- [ ] **Step 5: Commit** — `git commit -am "feat(remix): seeded free-mix generator"`

---

### Task 7: `/api/sessions` route

**Files:**
- Create: `src/app/api/sessions/route.ts`
- Test: `src/app/api/sessions/route.test.ts`

**Interfaces:**
- Consumes: `loadSessions` (Task 5), `parseSessionTimeline` (Task 3/4), `elementFromFilename` (Task 5).
- `GET` → `Response.json({ store, warnings })`. `POST` (body: `{ filename: string; markdown: string }`) → parse; if it yields ≥1 rule, write to `config/sessions/<filename>` and return `{ doc, warnings }` (201); else 422.

**Before coding:** read `node_modules/next/dist/docs/` for the current route API and mirror `src/app/api/analyses/route.ts`.

- [ ] **Step 1: Write the failing test** (call the handlers directly; use a temp dir via `ECOSONIC_SESSIONS_DIR`)

```ts
import { describe, it, expect } from 'vitest';
import { GET } from './route';

describe('/api/sessions', () => {
  it('GET returns the seeded store', async () => {
    const res = await GET(new Request('http://x/api/sessions'));
    const body = await res.json();
    expect(body.store.WATER.length).toBeGreaterThan(0);
    expect(Array.isArray(body.warnings)).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails** — FAIL.

- [ ] **Step 3: Write minimal implementation**

```ts
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { loadSessions, elementFromFilename } from '@/remix/loadSessions';
import { parseSessionTimeline } from '@/remix/parseSessionTimeline';

export const runtime = 'nodejs';

const dir = () => process.env.ECOSONIC_SESSIONS_DIR ?? path.join(process.cwd(), 'config', 'sessions');
const Upload = z.object({ filename: z.string().regex(/^[a-z0-9-]+\.md$/i), markdown: z.string().min(1) });

export async function GET() {
  return Response.json(loadSessions(dir()));
}

export async function POST(req: Request) {
  const parsed = Upload.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'bad request' }, { status: 400 });
  const element = elementFromFilename(parsed.data.filename);
  if (!element) return Response.json({ error: 'filename needs an element prefix' }, { status: 400 });
  const { rules, warnings } = parseSessionTimeline(parsed.data.markdown, element);
  if (rules.length === 0) return Response.json({ error: 'no parsable rules', warnings }, { status: 422 });
  writeFileSync(path.join(dir(), parsed.data.filename), parsed.data.markdown);
  return Response.json({ doc: { id: parsed.data.filename.replace(/\.md$/, ''), element, label: parsed.data.filename, rules }, warnings }, { status: 201 });
}
```

- [ ] **Step 4: Run to verify it passes** — PASS.

- [ ] **Step 5: Commit** — `git commit -am "feat(remix): /api/sessions GET+POST"`

---

### Task 8: Free-mix render / export

**Files:**
- Create: `src/remix/renderFreeMix.ts`
- Test: `src/remix/renderFreeMix.test.ts`

**Interfaces:**
- Consumes: `renderModuleToWav` (`@/arrange/render/renderModuleWav`), `config` (`@/config`), `ArrTrack`/`TemplateRegion`.
- Produces: `exportFreeMixWav(args: { tracks: ArrTrack[]; regions: TemplateRegion[]; totalSec: number; masterDb: number }): Promise<Blob>` — calls `renderModuleToWav` with `moduleSeconds` overridden to `totalSec`.

**Note:** `OfflineAudioContext` is unavailable in jsdom, so the test **mocks** `renderModuleToWav` and asserts the cfg override — it does not render audio.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from 'vitest';
vi.mock('@/arrange/render/renderModuleWav', () => ({
  renderModuleToWav: vi.fn(async (_args, cfg) => new Blob([String(cfg.layerTwo.moduleSeconds)])),
}));
import { renderModuleToWav } from '@/arrange/render/renderModuleWav';
import { exportFreeMixWav } from './renderFreeMix';

describe('exportFreeMixWav', () => {
  it('renders one module sized to totalSec', async () => {
    await exportFreeMixWav({ tracks: [], regions: [], totalSec: 1800, masterDb: 0 });
    const cfgArg = (renderModuleToWav as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][1] as { layerTwo: { moduleSeconds: number } };
    expect(cfgArg.layerTwo.moduleSeconds).toBe(1800);
  });
});
```

- [ ] **Step 2: Run to verify it fails** — FAIL.

- [ ] **Step 3: Write minimal implementation**

```ts
import { config } from '@/config';
import type { ArrTrack, TemplateRegion } from '@/arrange/types';
import { renderModuleToWav } from '@/arrange/render/renderModuleWav';

export function exportFreeMixWav(args: {
  tracks: ArrTrack[]; regions: TemplateRegion[]; totalSec: number; masterDb: number;
}): Promise<Blob> {
  const cfg = { ...config, layerTwo: { ...config.layerTwo, moduleSeconds: args.totalSec } };
  return renderModuleToWav({ tracks: args.tracks, regions: args.regions, masterDb: args.masterDb }, cfg);
}
```

- [ ] **Step 4: Run to verify it passes** — PASS.

- [ ] **Step 5: Commit** — `git commit -am "feat(remix): export free-mix to WAV via the module renderer"`

---

### Task 9: Store `playFreeMix` + scheduler duration

**Files:**
- Modify: `src/arrange/arrangementStore.ts`
- Modify: `src/arrange/useModuleScheduler.ts`
- Test: `src/arrange/arrangementStore.test.ts` (add a case)

**Interfaces:**
- Adds to `ArrangementState`: `durationSec: number` (default `config.layerTwo.moduleSeconds`) and `playFreeMix(regions: TemplateRegion[], totalSec: number): void`.

- [ ] **Step 1: Write the failing test**

```ts
// in arrangementStore.test.ts
import { createArrangementStore } from './arrangementStore';
it('playFreeMix loads regions, sets duration, starts single-module playback', () => {
  const store = createArrangementStore();
  const regions = [{ trackId: 't', enterSec: 0, exitSec: 100, fadeInSec: 0, fadeOutSec: 0 }];
  store.getState().playFreeMix(regions, 1800);
  const s = store.getState();
  expect(s.moduleRegions).toEqual(regions);
  expect(s.durationSec).toBe(1800);
  expect(s.session).toBeNull();
  expect(s.playing).toBe(true);
});
```

- [ ] **Step 2: Run to verify it fails** — FAIL.

- [ ] **Step 3: Implement**
- In the store initial state add `durationSec: config.layerTwo.moduleSeconds`.
- Change `clampModule` to clamp against a passed max, or add `clampTo(sec, max)`; `seek`/`setPosition` clamp to `get().durationSec`.
- Add:

```ts
playFreeMix: (regions, totalSec) =>
  set({ moduleRegions: regions, durationSec: totalSec, session: null, activeMode: 'INTRODUCTION', positionSec: 0, playing: true }),
```

- In `useModuleScheduler`, replace the closure constant `const D = config.layerTwo.moduleSeconds;` with reading `st.durationSec` **inside** `frame` (so it tracks the current value): `const D = st.durationSec ?? config.layerTwo.moduleSeconds;`.

- [ ] **Step 4: Run to verify it passes** — `npx vitest run src/arrange/arrangementStore.test.ts` → PASS. Also run the existing arrange tests to confirm no regression: `npx vitest run src/arrange`.

- [ ] **Step 5: Commit** — `git commit -am "feat(arrange): playFreeMix + duration-aware module scheduler"`

---

### Task 10: `useRemix` hook — fetch, derive, regenerate

**Files:**
- Create: `src/components/remix/useRemix.ts`
- Test: `src/components/remix/useRemix.test.ts`

**Interfaces:**
- Consumes: `generateFreeMix`/`Pick` (Task 6), `poolFor`/`RuleStore` (Task 2), `useArrangement` (`@/arrange/arrangementStore`).
- Produces: `useRemix(): { tracks; picks: Pick[]; regions: TemplateRegion[]; totalSec; warnings; regenerate(): void; loading }`. Fetches `/api/sessions` on mount; derives `{ regions, picks }` from `arrangementStore.tracks` + `poolFor(store, …)` + a `seed` state; `regenerate` bumps the seed.

- [ ] **Step 1: Write the failing test** (mock `fetch`, render the hook with `@testing-library/react`)

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { arrangementStore } from '@/arrange/arrangementStore';
import { useRemix } from './useRemix';

const store = { WATER: [{ id: 'w', element: 'WATER', label: 'w', rules: [
  { category: 'MELODY', section: 'INTRODUCTION', phrases: [{ enterSec: 0, exitSec: 60, fadeInSec: 0, fadeOutSec: 0 }], source: { element: 'WATER', sessionId: 'w', track: 'MELODY' } },
] }], EARTH: [], AIR: [], FIRE: [], ETHER: [] };

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => ({ store, warnings: [] }) })));
  arrangementStore.setState({ tracks: [{ id: 'm', category: 'MELODY', label: 'm', sample: { name: 'm', path: 'm.wav', bytes: 1 }, ceilingDb: 0, locked: false }] });
});

it('derives picks for present tracks and regenerate reshuffles the seed', async () => {
  const { result } = renderHook(() => useRemix());
  await waitFor(() => expect(result.current.picks.length).toBe(1));
  expect(result.current.picks[0].trackId).toBe('m');
  act(() => result.current.regenerate());
  expect(result.current.picks.length).toBe(1); // still valid after reshuffle
});
```

- [ ] **Step 2: Run to verify it fails** — FAIL.

- [ ] **Step 3: Implement** — `useState` for `{store, warnings}`, `seed`, `loading`; `useEffect` fetches `/api/sessions` once; `useArrangement((s) => s.tracks)` for tracks; `useMemo` over `(store, tracks, seed)` calls `generateFreeMix(tracks, (c) => poolFor(store, c), seed)`; `totalSec` from `useArrangement((s) => s.durationMin) * 60`; `regenerate = () => setSeed((n) => n + 1)`.

- [ ] **Step 4: Run to verify it passes** — PASS.

- [ ] **Step 5: Commit** — `git commit -am "feat(remix): useRemix hook (fetch + derive + regenerate)"`

---

### Task 11: Remix view UI + route

**Files:**
- Create: `src/components/remix/ResultTimeline.tsx`, `src/components/remix/TrackPoolRow.tsx`, `src/components/remix/RemixView.tsx`
- Create: `src/app/remix/page.tsx`
- Test: `src/components/remix/RemixView.test.tsx`

**Interfaces:**
- `ResultTimeline({ regions, totalSec, tracks })` — one lane per track, bars positioned `left = enter/totalSec`, `width = (exit−enter)/totalSec`; faint section-label ticks at `totalSec/3`, `2·totalSec/3`.
- `TrackPoolRow({ track, pick, poolSize })` — track name + pool size, pool chips (the picked `source.element·section` lit), picked mini-lane.
- `RemixView()` — uses `useRemix`; renders the pool rows + `ResultTimeline` + controls: **🎲 Regenerate** (`regenerate()`), **▶ Play** (`arrangementStore.playFreeMix(regions, totalSec)`), **⬇ Export** (`exportFreeMixWav(...)` → download Blob), **⬆ Upload** (POST `/api/sessions`, then re-fetch). Empty state when `tracks.length === 0`.

**Before coding the page:** read `node_modules/next/dist/docs/` for the current page/route conventions; match an existing `src/app/**/page.tsx`.

- [ ] **Step 1: Write the failing render test**

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ResultTimeline } from './ResultTimeline';

it('positions a region bar by absolute time over totalSec', () => {
  render(<ResultTimeline totalSec={1800}
    tracks={[{ id: 't', category: 'MELODY', label: 'MELODY', sample: { name: '', path: '', bytes: 0 }, ceilingDb: 0, locked: false }]}
    regions={[{ trackId: 't', enterSec: 900, exitSec: 1800, fadeInSec: 0, fadeOutSec: 0 }]} />);
  const bar = screen.getByTestId('region-t-900');
  expect(bar).toHaveStyle({ left: '50%', width: '50%' });
});
```

- [ ] **Step 2: Run to verify it fails** — FAIL.

- [ ] **Step 3: Implement** the three components + page. `ResultTimeline` renders each region as an absolutely-positioned div with `data-testid={\`region-${r.trackId}-${r.enterSec}\`}` and `style={{ left: \`${r.enterSec/totalSec*100}%\`, width: \`${(r.exitSec-r.enterSec)/totalSec*100}%\` }}`. `RemixView` wires `useRemix` + controls. `page.tsx` renders `<RemixView />` (client component). Follow the existing components' styling conventions (Tailwind classes as used elsewhere).

- [ ] **Step 4: Run to verify it passes** — `npx vitest run src/components/remix` → PASS.

- [ ] **Step 5: Manual smoke** — `npm run dev`, open `/remix` with an Arrangement set up: Regenerate reshuffles, Play sounds, Export downloads a full-length WAV, Upload grows the pool. *(Playback is RAF-driven and not unit-tested; verify here.)*

- [ ] **Step 6: Commit** — `git commit -am "feat(remix): Remix view UI + /remix route"`

---

### Task 12: Full-suite check

- [ ] **Step 1:** `npm test` → all pass (the `.claude/**` worktree exclusion is already in `vitest.config.ts`).
- [ ] **Step 2:** `npm run lint` → clean.
- [ ] **Step 3: Commit** any lint fixes — `git commit -am "chore(remix): lint + full-suite green"`

---

## Self-Review

**Spec coverage:** §3 data model → Task 2; §4 parser (headers/fuzzy/phrases/merge/validation) → Tasks 3–4; §5 vocab → Task 1; §6 generator → Task 6; §7 API + render + play → Tasks 7–9; §8 UI → Tasks 10–11; seed + CI guard → Task 5; §11 testing → folded into each task + Task 12. ✅ All spec sections have tasks.

**Placeholders:** none — every code step has real content; UI styling is the only intentionally-loose part (follow existing conventions), with concrete testable behavior specified.

**Type consistency:** `AuthoredRule`/`Phrase`/`RuleStore` (Task 2) are consumed verbatim by Tasks 3–6, 10; `Pick` (Task 6) by Task 10–11; `generateFreeMix` takes `pool: (c) => AuthoredRule[]` (Task 6) and is called with `(c) => poolFor(store, c)` (Task 10); `playFreeMix(regions, totalSec)` (Task 9) is called by Task 11; `exportFreeMixWav` args (Task 8) match Task 11's call. ✅

**Known verify-at-build items (flagged in-task):** `rng.pick` API (Task 6); Next.js route/page conventions per AGENTS.md (Tasks 7, 11); RAF playback smoke-tested not unit-tested (Task 11).

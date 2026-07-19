# Grammar Timeline Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Table/Timeline toggle to the "Live grammar" panel on `/rules`, rendering the mode-generation grammar as a stacked Gantt of layer spans.

**Architecture:** A new pure `grammarSpans()` in `inventory.ts` exposes the grammar as numbers (parallel to the string-formatting `grammarRows()`). A new `GrammarTimeline` client component renders three per-mode lane blocks over the `moduleSeconds` axis, reusing the lane/gridline idiom from the existing `AnalysisTimeline`. `RuleLibrary` gains a local view-state toggle that swaps the existing table for the timeline.

**Tech Stack:** TypeScript, React 19, Next.js 16, Tailwind v4 (CSS tokens), Zod config, Vitest + Testing Library.

## Global Constraints

- `grammarSpans()` is UI-ONLY and pure — never referenced from the analysis prompt path (same rule as `grammarRows`; keep it in the "display" region of `inventory.ts`, not near `buildSystemPrompt`).
- Layer order is the canonical stack `CATEGORIES` from `@/rules/analysisSchema` (`NOISE`…`MELODY`, bottom→top). Lanes render this **reversed** (NOISE at bottom).
- Time axis is `config.layerTwo.moduleSeconds` (`D`); positions are `s/D*100%`, clamped `[0,100]`.
- Grammar source is `config.layerTwo.generation.modeRules[mode][category]`, typed `GenLayerRule` (`{ present, enter: GenRange, exit: GenRange|'MODULE_END', fadeIn: GenRange, fadeOut: GenRange, after?: category }`). An absent category = key omitted (`undefined`).
- Match existing component conventions in `AnalysisTimeline.tsx`: `'use client'`, `label` class for lane names, `clock(s)` mm:ss, `bg-muted` track, `bg-foreground/10` gridlines.
- Colorblind-safe: 4 role-family hues only, validated with the dataviz `validate_palette.js` script before merge.

---

### Task 1: `grammarSpans()` — grammar as numbers

**Files:**
- Modify: `src/rules/inventory.ts` (add after `grammarRows`, ~line 101)
- Test: `src/rules/inventory.test.ts` (add cases to existing `describe('inventory')`)

**Interfaces:**
- Consumes: `config` (`EcosonicConfig`), `CATEGORIES` from `@/rules/analysisSchema`, `GenRange` type from `@/config`.
- Produces:
  ```ts
  export interface GrammarSpan {
    mode: string;
    category: (typeof CATEGORIES)[number];
    enterCanon: number; enterHalf: number;
    exit: number | 'MODULE_END'; exitHalf: number;
    fadeIn: number; fadeOut: number;
    present: number;
    after: string | null;
  }
  export function grammarSpans(cfg?: EcosonicConfig): GrammarSpan[];
  ```

- [ ] **Step 1: Write the failing test**

Add to `src/rules/inventory.test.ts`. Also extend the top import to include `grammarSpans`:
`import { PRINCIPLES, INVARIANTS, LAYER_VOCABULARY, buildSystemPrompt, grammarRows, grammarSpans } from '@/rules/inventory';`

```ts
describe('grammarSpans', () => {
  it('emits numeric spans covering every mode/layer that grammarRows covers', () => {
    const spans = grammarSpans();
    const rows = grammarRows();
    // Same coverage: one span per row.
    expect(spans.length).toBe(rows.length);
    const iso = spans.find((s) => s.mode === 'INTRODUCTION' && s.category === 'ISO');
    expect(iso).toBeDefined();
    expect(typeof iso!.enterCanon).toBe('number');
    expect(typeof iso!.enterHalf).toBe('number');
    expect(iso!.present).toBeGreaterThanOrEqual(0);
    expect(iso!.present).toBeLessThanOrEqual(1);
  });
  it('preserves MODULE_END exits and normalizes missing `after` to null', () => {
    const spans = grammarSpans();
    // NOISE in INTRODUCTION runs to module end and has no ordering hint.
    const noise = spans.find((s) => s.mode === 'INTRODUCTION' && s.category === 'NOISE');
    expect(noise!.exit).toBe('MODULE_END');
    expect(noise!.after).toBeNull();
    // At least one span carries an `after` string.
    expect(spans.some((s) => typeof s.after === 'string')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/rules/inventory.test.ts`
Expected: FAIL — `grammarSpans is not a function` / import undefined.

- [ ] **Step 3: Write minimal implementation**

Append to `src/rules/inventory.ts` (below `grammarRows`, keep the `GenRange` import — add `type GenRange` to the existing `@/config` import line):

```ts
export interface GrammarSpan {
  mode: string;
  category: (typeof CATEGORIES)[number];
  enterCanon: number; enterHalf: number;
  exit: number | 'MODULE_END'; exitHalf: number;
  fadeIn: number; fadeOut: number;
  present: number;
  after: string | null;
}

/** Live grammar as numeric spans for the timeline view. UI ONLY — never in the analysis prompt. */
export function grammarSpans(cfg: EcosonicConfig = defaultConfig): GrammarSpan[] {
  const spans: GrammarSpan[] = [];
  for (const mode of cfg.layerTwo.modes) {
    const mr = cfg.layerTwo.generation.modeRules[mode];
    for (const category of CATEGORIES) {
      const r = mr[category];
      if (!r) continue;
      spans.push({
        mode, category,
        enterCanon: r.enter.canon, enterHalf: r.enter.half,
        exit: r.exit === 'MODULE_END' ? 'MODULE_END' : r.exit.canon,
        exitHalf: r.exit === 'MODULE_END' ? 0 : r.exit.half,
        fadeIn: r.fadeIn.canon, fadeOut: r.fadeOut.canon,
        present: r.present,
        after: r.after ?? null,
      });
    }
  }
  return spans;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/rules/inventory.test.ts`
Expected: PASS (all cases, including the pre-existing ones).

- [ ] **Step 5: Commit**

```bash
git add src/rules/inventory.ts src/rules/inventory.test.ts
git commit -m "feat(rules): grammarSpans() — live grammar as numeric spans"
```

---

### Task 2: `GrammarTimeline` component

**Files:**
- Create: `src/components/rules/GrammarTimeline.tsx`
- Test: `src/components/rules/GrammarTimeline.test.tsx`

**Interfaces:**
- Consumes: `GrammarSpan`, `grammarSpans` from `@/rules/inventory`; `CATEGORIES` from `@/rules/analysisSchema`; `config` from `@/config`.
- Produces: `export function GrammarTimeline({ spans }: { spans: GrammarSpan[] }): JSX.Element`

**Design notes (implement exactly):**
- Role families → color. `ROLE_FAMILY: Record<category, 'bed'|'tonal'|'harmonic'|'melodic'>`:
  bed = NOISE, ELEMENT, ELEMENT_SUB, FX · tonal = ISO, PLANET, DRONE · harmonic = PAD, BASS · melodic = ARP, MELODY.
- Family bar colors (validated set — see Step 6):
  bed `#5b7fb0`, tonal `#3f9d8f`, harmonic `#c98a2b`, melodic `#8a6fc0`.
- Lanes per mode = `[...CATEGORIES].reverse()` (NOISE at bottom). A category with no span in that mode still renders an **empty lane** (no bar).
- Bar geometry: `pct(s) = clamp(s/D*100, 0, 100)`. Bar `left = pct(enterCanon)`, right edge = `pct(exit === 'MODULE_END' ? D : exit)`, `width = right - left`.
- `present` → opacity: `alpha = 0.4 + 0.6 * present` (so 1.0→100%, 0.5→70%). Render a numeric label (`present.toFixed(2)`) just right of the bar when `present < 1`.
- Fade ramps: overlay a leading gradient wedge of width `pct(fadeIn)` at the bar's left, trailing wedge width `pct(fadeOut)` at the right — implemented as absolutely-positioned divs with `bg-gradient-to-r from-transparent`/`to-transparent`. `fadeIn === 0` → render no wedge (hard edge; visually a wall).
- Jitter: a `bg-foreground/15` band of width `pct(2*enterHalf)` centered on the leading edge (`left = pct(enterCanon - enterHalf)`), behind the bar.
- Hover: bar `title` = `${category} · ${clock(enterCanon)}±${enterHalf}s → ${exit==='MODULE_END'?'end':clock(exit)} · fade ${fadeIn}/${fadeOut}s · present ${present}${after?` · after ${after}`:''}`.
- Legend row above the three blocks: 4 swatches + family labels.

- [ ] **Step 1: Write the failing test**

Create `src/components/rules/GrammarTimeline.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GrammarTimeline } from '@/components/rules/GrammarTimeline';
import { grammarSpans } from '@/rules/inventory';

describe('GrammarTimeline', () => {
  it('renders a heading per mode', () => {
    render(<GrammarTimeline spans={grammarSpans()} />);
    expect(screen.getByText('INTRODUCTION')).toBeInTheDocument();
    expect(screen.getByText('DEEP_RELAXATION')).toBeInTheDocument();
    expect(screen.getByText('RETURN')).toBeInTheDocument();
  });
  it('renders every layer lane in each mode, including empty ones', () => {
    render(<GrammarTimeline spans={grammarSpans()} />);
    // 11 categories × 3 modes = 33 lane labels (NOISE appears once per mode).
    expect(screen.getAllByText('NOISE')).toHaveLength(3);
    // PAD is absent in DEEP_RELAXATION but its lane label still renders (3 total).
    expect(screen.getAllByText('PAD')).toHaveLength(3);
  });
  it('shows the four role-family legend labels', () => {
    render(<GrammarTimeline spans={grammarSpans()} />);
    expect(screen.getByText('bed')).toBeInTheDocument();
    expect(screen.getByText('tonal')).toBeInTheDocument();
    expect(screen.getByText('harmonic')).toBeInTheDocument();
    expect(screen.getByText('melodic')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/rules/GrammarTimeline.test.tsx`
Expected: FAIL — cannot resolve `@/components/rules/GrammarTimeline`.

- [ ] **Step 3: Write minimal implementation**

Create `src/components/rules/GrammarTimeline.tsx`:

```tsx
'use client';
import { config } from '@/config';
import { CATEGORIES } from '@/rules/analysisSchema';
import type { GrammarSpan } from '@/rules/inventory';

type Family = 'bed' | 'tonal' | 'harmonic' | 'melodic';
const ROLE_FAMILY: Record<(typeof CATEGORIES)[number], Family> = {
  NOISE: 'bed', ELEMENT: 'bed', ELEMENT_SUB: 'bed', FX: 'bed',
  ISO: 'tonal', PLANET: 'tonal', DRONE: 'tonal',
  PAD: 'harmonic', BASS: 'harmonic',
  ARP: 'melodic', MELODY: 'melodic',
};
const FAMILY_COLOR: Record<Family, string> = {
  bed: '#5b7fb0', tonal: '#3f9d8f', harmonic: '#c98a2b', melodic: '#8a6fc0',
};
const FAMILIES: Family[] = ['bed', 'tonal', 'harmonic', 'melodic'];

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export function GrammarTimeline({ spans }: { spans: GrammarSpan[] }) {
  const D = config.layerTwo.moduleSeconds;
  const pct = (s: number) => Math.max(0, Math.min(100, (s / D) * 100));
  const minutes = Array.from({ length: Math.floor(D / 60) + 1 }, (_, i) => i * 60);
  const lanes = [...CATEGORIES].reverse();
  const modes = config.layerTwo.modes;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
        {FAMILIES.map((f) => (
          <span key={f} className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-[2px]" style={{ background: FAMILY_COLOR[f] }} />
            {f}
          </span>
        ))}
      </div>

      {modes.map((mode) => (
        <div key={mode} className="flex flex-col gap-1">
          <div className="text-xs font-medium">{mode}</div>
          <div className="flex gap-3 text-[11px] tabular-nums text-muted-foreground">
            <span className="w-24 shrink-0" />
            <span className="flex flex-1 justify-between">
              {minutes.map((m) => <span key={m}>{clock(m)}</span>)}
            </span>
          </div>
          {lanes.map((category) => {
            const span = spans.find((s) => s.mode === mode && s.category === category);
            const family = ROLE_FAMILY[category];
            return (
              <div key={category} className="flex items-center gap-3">
                <div className="label w-24 shrink-0">{category}</div>
                <div className="relative h-6 flex-1 overflow-hidden rounded-md bg-muted">
                  {minutes.slice(1, -1).map((m) => (
                    <div key={m} className="absolute inset-y-0 w-px bg-foreground/10" style={{ left: `${pct(m)}%` }} aria-hidden />
                  ))}
                  {span && (() => {
                    const right = pct(span.exit === 'MODULE_END' ? D : span.exit);
                    const left = pct(span.enterCanon);
                    const width = Math.max(0, right - left);
                    const alpha = 0.4 + 0.6 * span.present;
                    return (
                      <>
                        {span.enterHalf > 0 && (
                          <div className="absolute inset-y-0 bg-foreground/15" aria-hidden
                            style={{ left: `${pct(span.enterCanon - span.enterHalf)}%`, width: `${pct(2 * span.enterHalf)}%` }} />
                        )}
                        <div className="absolute inset-y-1 rounded-[4px]" aria-hidden
                          title={`${category} · ${clock(span.enterCanon)}±${span.enterHalf}s → ${span.exit === 'MODULE_END' ? 'end' : clock(span.exit)} · fade ${span.fadeIn}/${span.fadeOut}s · present ${span.present}${span.after ? ` · after ${span.after}` : ''}`}
                          style={{ left: `${left}%`, width: `${width}%`, background: FAMILY_COLOR[family], opacity: alpha }}>
                          {span.fadeIn > 0 && (
                            <div className="absolute inset-y-0 left-0 bg-gradient-to-r from-black/40 to-transparent" style={{ width: `${(span.fadeIn / (span.exit === 'MODULE_END' ? D - span.enterCanon : span.exit - span.enterCanon)) * 100}%` }} aria-hidden />
                          )}
                          {span.fadeOut > 0 && (
                            <div className="absolute inset-y-0 right-0 bg-gradient-to-l from-black/40 to-transparent" style={{ width: `${(span.fadeOut / (span.exit === 'MODULE_END' ? D - span.enterCanon : span.exit - span.enterCanon)) * 100}%` }} aria-hidden />
                          )}
                        </div>
                        {span.present < 1 && (
                          <div className="absolute inset-y-0 flex items-center text-[10px] tabular-nums text-muted-foreground"
                            style={{ left: `calc(${right}% + 4px)` }}>{span.present.toFixed(2)}</div>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/rules/GrammarTimeline.test.tsx`
Expected: PASS (3 cases).

- [ ] **Step 5: Commit**

```bash
git add src/components/rules/GrammarTimeline.tsx src/components/rules/GrammarTimeline.test.tsx
git commit -m "feat(rules): GrammarTimeline — stacked Gantt of the live grammar"
```

- [ ] **Step 6: Validate the palette (dataviz gate)**

Run (from the dataviz skill base dir, or inline the script per its docs):
`node scripts/validate_palette.js "#5b7fb0,#3f9d8f,#c98a2b,#8a6fc0" --mode light`
then `--mode dark`.
Expected: all four pass the lightness band, chroma floor, adjacent-pair CVD (ΔE ≥ 8), and contrast checks. If any pair FAILs, nudge that hex toward the nearest passing step and update `FAMILY_COLOR`, then re-run Step 4. Commit any color change with `style(rules): validated grammar timeline palette`.

---

### Task 3: Table/Timeline toggle in `RuleLibrary`

**Files:**
- Modify: `src/components/rules/RuleLibrary.tsx` (the "Live grammar" `<Group>`, ~lines 44–66; imports at top)
- Test: `src/components/rules/RuleLibrary.test.tsx` (create if absent)

**Interfaces:**
- Consumes: `grammarRows`, `grammarSpans` from `@/rules/inventory`; `GrammarTimeline` from `@/components/rules/GrammarTimeline`.
- Produces: no new export — internal `useState<'table' | 'timeline'>` (default `'timeline'`).

- [ ] **Step 1: Write the failing test**

Create `src/components/rules/RuleLibrary.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RuleLibrary } from '@/components/rules/RuleLibrary';

const noop = () => {};

describe('RuleLibrary live-grammar toggle', () => {
  it('defaults to the timeline view (mode headings visible, no table header)', () => {
    render(<RuleLibrary discovered={[]} onPromote={noop} onDiscard={noop} />);
    // Timeline shows the role-family legend; the table shows a "present" column header.
    expect(screen.getByText('bed')).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'present' })).toBeNull();
  });
  it('switches to the table when Table is clicked', async () => {
    render(<RuleLibrary discovered={[]} onPromote={noop} onDiscard={noop} />);
    await userEvent.click(screen.getByRole('button', { name: 'Table' }));
    expect(screen.getByRole('columnheader', { name: 'present' })).toBeInTheDocument();
    expect(screen.queryByText('bed')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/rules/RuleLibrary.test.tsx`
Expected: FAIL — no `Table` button; legend `bed` not rendered (table still hard-coded).

- [ ] **Step 3: Write minimal implementation**

In `src/components/rules/RuleLibrary.tsx`:

Add to imports (top):
```tsx
import { useState } from 'react';
import { INVARIANTS, PRINCIPLES, grammarRows, grammarSpans } from '@/rules/inventory';
import { GrammarTimeline } from '@/components/rules/GrammarTimeline';
```
(Replace the existing `grammarRows`-only import line with the one above.)

Inside `RuleLibrary`, replace `const rows = grammarRows();` with:
```tsx
const rows = grammarRows();
const spans = grammarSpans();
const [grammarView, setGrammarView] = useState<'table' | 'timeline'>('timeline');
```

Replace the entire `<Group title="Live grammar (what Generate draws from)">…</Group>` block with:
```tsx
<Group title="Live grammar (what Generate draws from)">
  <div className="mb-2 flex gap-1">
    {(['timeline', 'table'] as const).map((v) => (
      <button key={v} type="button" onClick={() => setGrammarView(v)}
        className={`rounded-full border px-2.5 py-0.5 text-[11px] capitalize ${
          grammarView === v ? 'border-[var(--accent)] text-[var(--accent-ink)]' : 'border-border text-muted-foreground'
        }`}>
        {v}
      </button>
    ))}
  </div>
  {grammarView === 'timeline' ? (
    <GrammarTimeline spans={spans} />
  ) : (
    <div className="overflow-x-auto">
      <table className="w-full text-xs tabular-nums">
        <thead className="text-left text-muted-foreground">
          <tr>
            <th className="pr-3">mode</th><th className="pr-3">layer</th><th className="pr-3">enter</th>
            <th className="pr-3">exit</th><th className="pr-3">fadeIn</th><th className="pr-3">fadeOut</th>
            <th className="pr-3">present</th><th>after</th>
          </tr>
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
  )}
</Group>
```

Note: the button labels render capitalized via `capitalize`, but the accessible name is the lowercase text node — the test queries `name: 'Table'` which matches case-insensitively through the `capitalize` CSS (CSS transforms don't change the accessible name, so the button's name is `timeline`/`table`). Adjust the test queries to `name: 'table'`/`name: 'timeline'` if your Testing Library version is case-sensitive.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/rules/RuleLibrary.test.tsx`
Expected: PASS (2 cases). If the button-name case fails, change the test queries to lowercase `'table'`/`'timeline'`.

- [ ] **Step 5: Full suite + commit**

Run: `npx vitest run` (confirm no regressions in the rules area).
Expected: PASS.

```bash
git add src/components/rules/RuleLibrary.tsx src/components/rules/RuleLibrary.test.tsx
git commit -m "feat(rules): Table/Timeline toggle on the live-grammar panel"
```

---

## Self-Review

**Spec coverage:**
- Toggle (Table/Timeline, default timeline) → Task 3. ✓
- `grammarSpans()` numeric sibling → Task 1. ✓
- Three stacked small-multiples + empty lanes for absent layers → Task 2 (`lanes` from full `CATEGORIES`, `span` may be undefined). ✓
- Bottom-up lane order → Task 2 (`[...CATEGORIES].reverse()`). ✓
- enter/exit/fade/jitter/present/after marks → Task 2 field→mark block. ✓
- `MODULE_END` open cap → Task 2 (`right = pct(D)`). ✓
- Color by role family, 4 hues, validated → Task 2 Steps 3 + 6. ✓
- Reuse AnalysisTimeline idiom → Task 2 (labels, gridlines, `pct`, `clock`). ✓
- Table stays as-is → Task 3 (verbatim table markup moved under `else`). ✓

**Type consistency:** `GrammarSpan` fields (`enterCanon`, `enterHalf`, `exit`, `exitHalf`, `fadeIn`, `fadeOut`, `present`, `after`) are defined in Task 1 and consumed identically in Task 2. `grammarSpans`/`grammarRows` names consistent across Tasks 1–3.

**Placeholders:** none — every code step is complete.

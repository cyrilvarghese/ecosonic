# Analysis Timeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only per-mode-tab Timeline view of the analysis candidates — lanes per category with grammar ghost bands and verdict-tinted bars — toggled against the existing Cards view.

**Architecture:** A pure geometry module (`src/rules/timeline.ts`) maps candidates + grammar to lane/bar/ghost positions; a presentational component (`AnalysisTimeline.tsx`) renders them reusing the ModuleDesigner idiom; `page.tsx` gains a `timeline|cards` toggle per tab. No route/schema/data changes — both views read the same `group.cards`.

**Tech Stack:** Next.js (App Router), TypeScript, React client components, Tailwind, Vitest + @testing-library/react.

## Global Constraints

- Read-only: the Timeline has **no** Keep/Discard/Promote — those stay in Cards.
- Axis is window-relative `[0, D]` where `D = config.layerTwo.moduleSeconds` (600). Never hard-code 600.
- Lane order is `CATEGORIES` (stack order, bottom→top) from `@/rules/analysisSchema`.
- Verdict palette mirrors `CandidateCard`: green `confirms`, red `contradicts`, accent `novel`.
- Ghost bands come from `config.layerTwo.generation.modeRules[mode][category]` — the same grammar the matcher uses; no new numbers introduced.
- Types: `Category` from `@/types`; `CandidateRule`/`CATEGORIES` from `@/rules/analysisSchema`; `GenLayerRule`/`GenRange` from `@/config`; `Mode` from `@/arrange/types`.
- Vitest excludes `**/.claude/**`; run from repo root.

---

### Task 1: Pure timeline geometry — `src/rules/timeline.ts`

**Files:**
- Create: `src/rules/timeline.ts`
- Test: `src/rules/timeline.test.ts`

**Interfaces:**
- Consumes: `CandidateRule`, `CATEGORIES` (`@/rules/analysisSchema`); `Category` (`@/types`); `GenLayerRule`, `config`, `EcosonicConfig` (`@/config`); `Mode` (`@/arrange/types`).
- Produces:
  - `interface LaneItem { category: Category; kind: CandidateRule['kind']; startSec: number; endSec: number | null; mark: 'bar' | 'tick'; candidate: CandidateRule }`
  - `laneItem(candidate: CandidateRule, D: number): LaneItem | null`
  - `ghostBand(rule: GenLayerRule | undefined, D: number): { startSec: number; endSec: number } | null`
  - `ruleFor(mode: Mode, category: Category, cfg?: EcosonicConfig): GenLayerRule | undefined`
  - `partition(candidates: CandidateRule[], D: number): { lanes: Array<{ category: Category; items: LaneItem[] }>; untimed: CandidateRule[] }`

- [ ] **Step 1: Write the failing test**

```ts
// src/rules/timeline.test.ts
import { describe, it, expect } from 'vitest';
import { laneItem, ghostBand, ruleFor, partition } from '@/rules/timeline';
import type { CandidateRule, PatchWireT } from '@/rules/analysisSchema';

const patch = (over: Partial<PatchWireT>): PatchWireT => ({
  present: null, enter: null, exit: null, fadeIn: null, fadeOut: null, after: null, ...over,
});
const cand = (over: Partial<CandidateRule>): CandidateRule => ({
  text: 'x', layer: null, sectionIndex: 1, structured: null, evidence: [], confidence: 0.7,
  kind: 'novel', relatedRule: null, mode: 'INTRODUCTION', ...over,
});

describe('laneItem', () => {
  it('enter+exit → a bar', () => {
    const it_ = laneItem(cand({ kind: 'confirms', structured: { category: 'ISO', patch: patch({ enter: { canon: 60, half: 10 }, exit: { canon: 300, half: 20 } }) } }), 600);
    expect(it_).toMatchObject({ category: 'ISO', mark: 'bar', startSec: 60, endSec: 300, kind: 'confirms' });
  });
  it('enter only → a tick (endSec null)', () => {
    const it_ = laneItem(cand({ structured: { category: 'PAD', patch: patch({ enter: { canon: 120, half: 5 } }) } }), 600);
    expect(it_).toMatchObject({ mark: 'tick', startSec: 120, endSec: null });
  });
  it('exit MODULE_END → bar to D', () => {
    const it_ = laneItem(cand({ structured: { category: 'NOISE', patch: patch({ enter: { canon: 0, half: 1 }, exit: 'MODULE_END' }) } }), 600);
    expect(it_).toMatchObject({ mark: 'bar', startSec: 0, endSec: 600 });
  });
  it('no structured / no enter → null', () => {
    expect(laneItem(cand({ text: 'prose' }), 600)).toBeNull();
    expect(laneItem(cand({ structured: { category: 'ISO', patch: patch({}) } }), 600)).toBeNull();
  });
});

describe('ghostBand', () => {
  it('canon→canon from a rule', () => {
    expect(ghostBand(ruleFor('INTRODUCTION', 'ISO'), 600)).toEqual(
      { startSec: ruleFor('INTRODUCTION', 'ISO')!.enter.canon, endSec: (ruleFor('INTRODUCTION', 'ISO')!.exit === 'MODULE_END' ? 600 : (ruleFor('INTRODUCTION', 'ISO')!.exit as { canon: number }).canon) },
    );
  });
  it('missing rule → null (layer absent in that mode)', () => {
    expect(ghostBand(ruleFor('DEEP_RELAXATION', 'BASS'), 600)).toBeNull();
  });
});

describe('partition', () => {
  it('groups by category in stack order and splits untimed', () => {
    const cands = [
      cand({ text: 'prose', kind: 'novel' }),
      cand({ structured: { category: 'MELODY', patch: patch({ enter: { canon: 400, half: 5 } }) } }),
      cand({ structured: { category: 'ISO', patch: patch({ enter: { canon: 60, half: 5 } }) } }),
    ];
    const { lanes, untimed } = partition(cands, 600);
    expect(lanes.map((l) => l.category)).toEqual(['ISO', 'MELODY']); // stack order, not input order
    expect(untimed).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/rules/timeline.test.ts`
Expected: FAIL — cannot find module `@/rules/timeline`.

- [ ] **Step 3: Write the implementation**

```ts
// src/rules/timeline.ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/rules/timeline.test.ts && npx tsc --noEmit`
Expected: all pass; no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/rules/timeline.ts src/rules/timeline.test.ts
git commit -m "feat(rules): pure timeline geometry (laneItem/ghostBand/partition)"
```

---

### Task 2: Timeline component — `src/components/rules/AnalysisTimeline.tsx`

**Files:**
- Create: `src/components/rules/AnalysisTimeline.tsx`
- Test: `src/components/rules/AnalysisTimeline.test.tsx`

**Interfaces:**
- Consumes: `partition`, `ghostBand`, `ruleFor` (Task 1); `CandidateRule` (`@/rules/analysisSchema`); `Mode` (`@/arrange/types`); `config` (`@/config`).
- Produces: `AnalysisTimeline({ candidates: CandidateRule[]; mode: Mode }): JSX.Element` — read-only.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/rules/AnalysisTimeline.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AnalysisTimeline } from '@/components/rules/AnalysisTimeline';
import type { CandidateRule, PatchWireT } from '@/rules/analysisSchema';

const patch = (over: Partial<PatchWireT>): PatchWireT => ({
  present: null, enter: null, exit: null, fadeIn: null, fadeOut: null, after: null, ...over,
});
const cand = (over: Partial<CandidateRule>): CandidateRule => ({
  text: 'x', layer: null, sectionIndex: 1, structured: null, evidence: [], confidence: 0.7,
  kind: 'novel', relatedRule: null, mode: 'INTRODUCTION', ...over,
});

describe('AnalysisTimeline', () => {
  it('renders a lane per observed category and a chip per untimed candidate', () => {
    const candidates = [
      cand({ kind: 'confirms', structured: { category: 'ISO', patch: patch({ enter: { canon: 60, half: 5 }, exit: { canon: 300, half: 10 } }) } }),
      cand({ kind: 'contradicts', structured: { category: 'PAD', patch: patch({ enter: { canon: 500, half: 5 } }) } }),
      cand({ kind: 'novel', text: 'The noise bed never stops', relatedRule: 'R7' }),
    ];
    render(<AnalysisTimeline candidates={candidates} mode="INTRODUCTION" />);
    expect(screen.getByText('ISO')).toBeInTheDocument();
    expect(screen.getByText('PAD')).toBeInTheDocument();
    expect(screen.getByText(/noise bed never stops/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/rules/AnalysisTimeline.test.tsx`
Expected: FAIL — cannot find module `@/components/rules/AnalysisTimeline`.

- [ ] **Step 3: Write the component**

```tsx
// src/components/rules/AnalysisTimeline.tsx
'use client';
import type { Mode } from '@/arrange/types';
import type { CandidateRule } from '@/rules/analysisSchema';
import { config } from '@/config';
import { partition, ghostBand, ruleFor } from '@/rules/timeline';

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

const TINT: Record<CandidateRule['kind'], string> = {
  confirms: 'bg-emerald-500/70 border-emerald-600',
  contradicts: 'bg-red-500/70 border-red-600',
  novel: 'bg-[color-mix(in_oklch,var(--accent)_60%,transparent)] border-[var(--accent-ink)]',
};
const CHIP: Record<CandidateRule['kind'], string> = {
  confirms: 'bg-emerald-600/15 text-emerald-700 dark:text-emerald-400',
  contradicts: 'bg-red-600/15 text-red-700 dark:text-red-400',
  novel: 'bg-[color-mix(in_oklch,var(--accent)_25%,transparent)] text-[var(--accent-ink)]',
};

export function AnalysisTimeline({ candidates, mode }: { candidates: CandidateRule[]; mode: Mode }) {
  const D = config.layerTwo.moduleSeconds;
  const { lanes, untimed } = partition(candidates, D);
  const pct = (s: number) => `${Math.max(0, Math.min(100, (s / D) * 100))}%`;

  if (lanes.length === 0 && untimed.length === 0) {
    return <p className="text-sm text-muted-foreground">No candidates to plot.</p>;
  }

  return (
    <div className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-border bg-card p-4">
      <div className="flex gap-3 text-[11px] tabular-nums text-muted-foreground">
        <span className="w-24 shrink-0" />
        <span className="flex flex-1 justify-between"><span>0:00</span><span>{clock(D / 2)}</span><span>{clock(D)}</span></span>
      </div>

      {lanes.map(({ category, items }) => {
        const ghost = ghostBand(ruleFor(mode, category), D);
        return (
          <div key={category} className="flex items-center gap-3">
            <div className="label w-24 shrink-0">{category}</div>
            <div className="relative h-8 flex-1 overflow-hidden rounded-md bg-muted">
              {ghost && (
                <div className="absolute inset-y-0 bg-foreground/10"
                  style={{ left: pct(ghost.startSec), width: pct(ghost.endSec - ghost.startSec) }}
                  aria-hidden />
              )}
              {items.map((it, i) => (
                <div key={i}
                  className={`absolute inset-y-1.5 rounded-[4px] border ${TINT[it.kind]}`}
                  style={it.mark === 'bar'
                    ? { left: pct(it.startSec), width: pct((it.endSec ?? it.startSec) - it.startSec) }
                    : { left: pct(it.startSec), width: '3px' }}
                  title={`${clock(it.startSec)}${it.endSec != null ? `–${clock(it.endSec)}` : ''} · ${it.candidate.text}`} />
              ))}
            </div>
          </div>
        );
      })}

      {untimed.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1.5">
          {untimed.map((c, i) => (
            <span key={i} className={`rounded-full px-2.5 py-0.5 text-xs ${CHIP[c.kind]}`} title={c.text}>
              {c.relatedRule ? `${c.relatedRule}: ` : ''}{c.text.length > 48 ? `${c.text.slice(0, 47)}…` : c.text}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/rules/AnalysisTimeline.test.tsx && npx tsc --noEmit`
Expected: pass; no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/rules/AnalysisTimeline.tsx src/components/rules/AnalysisTimeline.test.tsx
git commit -m "feat(rules): AnalysisTimeline component — lanes, ghost bands, chip strip"
```

---

### Task 3: Timeline ⇄ Cards toggle — `src/app/rules/page.tsx`

**Files:**
- Modify: `src/app/rules/page.tsx`

**Interfaces:**
- Consumes: `AnalysisTimeline` (Task 2). Existing `groups`, `active`, `keep`/`discard`/`patch`.
- Produces: per-tab view state; segmented switch; conditional render.

- [ ] **Step 1: Add the import and view state**

Add the import near the other component imports:
```tsx
import { AnalysisTimeline } from '@/components/rules/AnalysisTimeline';
```

Add state beside the others in `RulesPage`:
```tsx
  const [view, setView] = useState<'timeline' | 'cards'>('timeline');
```

In `onResult`, reset the view when a new analysis lands (add as the last line of the setter body):
```tsx
    setView('timeline');
```

- [ ] **Step 2: Render the toggle + conditional view**

Replace the existing non-error branch of the active-tab render. Find:
```tsx
                {active && (active.error ? (
                  <p className="rounded-[var(--radius-md)] border border-border bg-card p-4 text-sm text-red-600 dark:text-red-400">
                    {MODE_LABEL[active.mode]} pass failed: {active.error}
                  </p>
                ) : (
                  <>
                    <p className="whitespace-pre-wrap rounded-[var(--radius-md)] border border-border bg-card p-4 text-sm leading-relaxed">
                      {active.description}
                    </p>
                    {active.cards.map((c, i) => (
                      <CandidateCard key={`${active.mode}-${i}`} candidate={c.candidate} keptId={c.keptId}
                        onKeep={() => void keep(active.mode, i)}
                        onDiscard={() => discard(active.mode, i)}
                        onPromote={() => { if (c.keptId) void patch(c.keptId, 'promote'); }} />
                    ))}
                  </>
                ))}
```
with:
```tsx
                {active && (active.error ? (
                  <p className="rounded-[var(--radius-md)] border border-border bg-card p-4 text-sm text-red-600 dark:text-red-400">
                    {MODE_LABEL[active.mode]} pass failed: {active.error}
                  </p>
                ) : (
                  <>
                    <div className="flex gap-1 self-start rounded-full border border-border p-0.5 text-xs">
                      {(['timeline', 'cards'] as const).map((v) => (
                        <button key={v} type="button" onClick={() => setView(v)}
                          className={`rounded-full px-3 py-1 capitalize transition-calm ${
                            view === v ? 'bg-[var(--accent-ink)] text-white' : 'text-muted-foreground hover:text-foreground'}`}>
                          {v}
                        </button>
                      ))}
                    </div>
                    <p className="whitespace-pre-wrap rounded-[var(--radius-md)] border border-border bg-card p-4 text-sm leading-relaxed">
                      {active.description}
                    </p>
                    {view === 'timeline' ? (
                      <AnalysisTimeline candidates={active.cards.map((c) => c.candidate)} mode={active.mode} />
                    ) : (
                      active.cards.map((c, i) => (
                        <CandidateCard key={`${active.mode}-${i}`} candidate={c.candidate} keptId={c.keptId}
                          onKeep={() => void keep(active.mode, i)}
                          onDiscard={() => discard(active.mode, i)}
                          onPromote={() => { if (c.keptId) void patch(c.keptId, 'promote'); }} />
                      ))
                    )}
                  </>
                ))}
```

- [ ] **Step 3: Typecheck + full test run**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no type errors; all tests pass (161 prior + Task 1 & 2 additions).

- [ ] **Step 4: Manual verification (dev server)**

Run: `npm run dev`, open `/rules`, analyze a track. Expected: each mode tab shows a **Timeline / Cards** toggle (Timeline default) — lanes per heard category with faint ghost bands, green/red/accent bars, a chip strip for prose/R2 findings; flip to Cards for the same data with Keep/Discard/Promote.

- [ ] **Step 5: Commit**

```bash
git add src/app/rules/page.tsx
git commit -m "feat(rules): Timeline <-> Cards toggle per mode tab"
```

---

## Self-Review

**Spec coverage:**
- §2 toggle, same data, read-only → Task 3 (toggle) + Tasks 1-2 (read-only render). ✓
- §3 pure geometry (`laneItem`/`ghostBand`/`ruleFor`/`partition`) → Task 1. ✓
- §4 component: axis, lanes in stack order, ghost bands, bars/ticks, MODULE_END, chip strip → Task 2. ✓
- §5 page integration: view state, reset in onResult, segmented switch, error branch preserved → Task 3. ✓
- §6 tests: timeline unit + component smoke → Tasks 1, 2. ✓
- §7 out of scope → nothing implemented from it. ✓

**Placeholder scan:** none — every code step is complete.

**Type consistency:** `LaneItem` defined in Task 1, consumed via `partition` in Task 2. `partition/ghostBand/ruleFor` signatures match between Task 1 definition and Task 2/3 use. `AnalysisTimeline({candidates, mode})` matches between Task 2 definition and Task 3 call. `view: 'timeline'|'cards'` consistent across Task 3 steps. `patch.exit?.canon ?? null` guarded after the `MODULE_END` check so the type narrows to `GenRange | null`.

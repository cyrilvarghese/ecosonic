# Analysis Timeline — Design

**Status:** Approved design · **Date:** 2026-07-19 · **Branch:** `feat/three-pass-analysis`
**Related:** [three-pass design](./2026-07-18-three-pass-analysis-design.md) ·
[ModuleDesigner](../../../src/components/layer2/ModuleDesigner.tsx) ·
[match.ts](../../../src/rules/match.ts) · [analysisSchema.ts](../../../src/rules/analysisSchema.ts)

---

## 1. Problem

The `/rules` Discover panel shows each mode tab's candidates as a vertical list of text cards. To
understand a track you read and mentally reconstruct the timeline. A visual, time-axis view would
let you *see* the whole section at once — when each layer enters/exits, and whether it matches the
grammar — instead of reading and interpreting card by card.

## 2. Solution overview

Add a per-mode-tab **Timeline ⇄ Cards** toggle (default Timeline). Both views read the **same**
`group.cards` already in `page.tsx` state — no new fetch, no route/schema change. Timeline is a
read-only overview; all actions (Keep / Discard / Promote) stay in the Cards view.

```
group.cards[] ──┬── Timeline (new, read-only): lanes + ghost bands + verdict-tinted bars + chip strip
                └── Cards (existing): description + CandidateCards with Keep/Discard/Promote
```

Decisions locked in brainstorming:
- **Toggle**, not replace — nothing regresses; prose/ordering candidates keep a home in Cards.
- **Ghost bands** — behind each lane, the grammar's expected window, so confirms/contradicts is
  *seen* (bar inside the ghost) not just read (color).
- **Prose / R2-ordering candidates** (no structured timing) → a verdict-tinted **chip strip** below
  the lanes, so the Timeline view is complete.
- **Observed-only lanes** for v1 — a lane per category the model actually heard, each with its ghost.
  "Expected-but-absent" lanes (grammar expects a layer, track has none) are a v2.
- Axis is **window-relative 0–10 min** (`D = config.layerTwo.moduleSeconds = 600`), matching the tab.

## 3. Pure geometry — `src/rules/timeline.ts` (new)

All math lives here so it is unit-testable without the DOM, mirroring how `sliceWindows` / `match`
were factored (pure core, thin visual shell).

- `laneItem(candidate: CandidateRule, D: number): { category: Category; kind; startSec: number;
  endSec: number | null; mark: 'bar' | 'tick' } | null`
  - `null` unless `candidate.structured` and `patch.enter` exist (can't place without a start).
  - `startSec = patch.enter.canon` (clamped ≥ 0).
  - `endSec = patch.exit === 'MODULE_END' ? D : patch.exit?.canon ?? null`.
  - `mark = (endSec != null && endSec > startSec) ? 'bar' : 'tick'`.
- `ghostBand(rule: GenLayerRule | undefined, D: number): { startSec: number; endSec: number } | null`
  - `null` if `rule` missing or `rule.enter` absent.
  - `startSec = enterCanon`, `endSec = exit === 'MODULE_END' ? D : exitCanon` (via the matcher's
    `toCanon` convention). Source: `config.layerTwo.generation.modeRules[mode][category]`.
- `partition(candidates: CandidateRule[], D): { lanes: Array<{ category: Category; items:
  LaneItem[] }>; untimed: CandidateRule[] }`
  - Groups placeable items by category, ordered by `CATEGORIES` (stack order, bottom→top). Everything
    `laneItem` returns `null` for goes to `untimed`.

## 4. Component — `src/components/rules/AnalysisTimeline.tsx` (new)

Read-only. Reuses the ModuleDesigner idiom: percentage `left`/`width`, a `clock()` axis, lane rows.

Props: `{ candidates: CandidateRule[]; mode: Mode }`.

- **Axis header:** `0:00 · 5:00 · 10:00`.
- **One lane per observed category**, bottom→top stack order. Multiple observations in a category
  stack as multiple bars/ticks in the same lane (unlike the designer's one-clip-per-lane).
- **Ghost band** behind each lane (faint fill), from `ghostBand(...)`. Novel items have no grammar to
  compare, so no ghost.
- **Bars** span `startSec→endSec`; **ticks** mark enter-only; `MODULE_END` reaches the right edge.
  Verdict tint: green `confirms`, red `contradicts`, accent `novel` (reuse CandidateCard's palette).
  Hover → tooltip with the observation text + `mm:ss`.
- **Chip strip** under the lanes: one verdict-tinted chip per `untimed` candidate, showing its text.

## 5. Page integration — `src/app/rules/page.tsx`

- Add `view: 'timeline' | 'cards'` state, default `'timeline'`, reset to `'timeline'` in `onResult`.
- A small segmented switch above the tab content (module-designer control style).
- Timeline renders `<AnalysisTimeline candidates={active.cards.map((c) => c.candidate)}
  mode={active.mode} />`; Cards renders today's description + card list unchanged.
- A failed tab (`active.error`) still shows its error in both views.

## 6. Testing

- `timeline.ts` unit tests: `laneItem` (bar vs tick vs `MODULE_END` vs `null`), `ghostBand`
  (canon→canon, `MODULE_END`→D, missing rule→null), `partition` (stack order + timed/untimed split).
- `AnalysisTimeline` smoke test (RTL): given a confirms bar + a contradicts bar + one prose
  candidate, renders the expected lane count and exactly one chip.

## 7. Out of scope (v1)

Empty "expected-but-absent" lanes, drag/edit of bars, playhead/scrub, and Keep/Promote from the
timeline (actions stay in Cards). All deferrable follow-ups.

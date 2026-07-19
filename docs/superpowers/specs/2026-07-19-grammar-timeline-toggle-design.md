# Grammar Timeline Toggle — Design

**Date:** 2026-07-19
**Status:** Draft (awaiting review)
**Area:** `/rules` page → "Live grammar" panel

## Problem

The "Live grammar (what Generate draws from)" panel in [`RuleLibrary.tsx`](../../../src/components/rules/RuleLibrary.tsx) renders the mode-generation grammar as a dense table (mode × layer × enter/exit/fadeIn/fadeOut/present/after). Every row is really a *timed span* — a layer enters at `canon±half`, holds until `exit`, with fade ramps — but the table forces the reader to reconstruct that timeline mentally. The bottom-up entrance rule (R2), the mode constraints (I4, e.g. no PAD/BASS in Deep Relaxation), and the density arch (R5) are all present in the numbers but invisible.

## Goal

Add a **Table / Timeline toggle** to the panel. The table stays byte-for-byte as-is. The timeline renders the same grammar as a Gantt: time on the x-axis, layers as stacked lanes, bars from enter→exit with fade ramps and jitter bands — so the arrangement's structure is legible at a glance.

Non-goals: editing the grammar (read-only, like the table); changing the grammar data model; touching the analysis/matcher paths.

## Data

Source of truth is unchanged: `cfg.layerTwo.generation.modeRules[mode][category]`, already surfaced by `grammarRows()` in [`inventory.ts`](../../../src/rules/inventory.ts). That function pre-formats numbers into display strings (`"120±25s"`), which is right for the table but useless for positioning bars.

**Add a sibling `grammarSpans(cfg)`** in `inventory.ts` that returns the same rows as *numbers*:

```ts
export interface GrammarSpan {
  mode: string;
  category: (typeof CATEGORIES)[number];
  enterCanon: number; enterHalf: number;
  exitCanon: number | 'MODULE_END'; exitHalf: number;
  fadeInCanon: number; fadeOutCanon: number;
  present: number;
  after: string | null;
}
export function grammarSpans(cfg?: EcosonicConfig): GrammarSpan[]
```

`grammarRows()` and `grammarSpans()` iterate the identical `modes × CATEGORIES` structure; only formatting differs. Both are pure, config-defaulted, and UI-only (never enter the analysis prompt — same constraint as today).

## Visual design

Reuse the established idiom from [`AnalysisTimeline.tsx`](../../../src/components/rules/AnalysisTimeline.tsx): a `w-24` lane label + a `flex-1` track over `bg-muted`, interior 1-minute gridlines, `moduleSeconds` (`D`) as the axis, `pct(s) = s/D*100%`. The grammar bar is that component's existing **ghost band** promoted from hint to primary mark.

### Layout — three stacked small-multiples
`INTRODUCTION`, `DEEP_RELAXATION`, `RETURN` render as three timeline blocks sharing one time axis (0 → `D`), one above the other, each with a mode heading. A layer absent in a mode leaves an **empty lane** (kept, not dropped) so mode constraints read as gaps — Deep Relaxation visibly missing PAD/BASS/ARP/MELODY/FX (I4).

### Lanes — fixed stack order, bottom-up
Lanes render in `CATEGORIES` order **reversed**, so NOISE sits at the bottom and MELODY at the top. Entrances then form a rising staircase up the stack — rule R2 made visual.

### The bar — field → mark mapping
| Field | Mark |
|-------|------|
| `enterCanon` → `exitCanon` | bar left edge → right edge, via `pct()` |
| `exit = 'MODULE_END'` | bar runs to the track's right edge, open/flush cap |
| `fadeInCanon` | leading ramp: a triangle/gradient over the first `fadeIn` seconds of the bar rather than a hard edge. `fadeIn = 0` (BASS) → vertical wall, making rule R4 visible |
| `fadeOutCanon` | trailing ramp, symmetric |
| `enterHalf` (±jitter) | a soft/gradient band of width `2·enterHalf` centered on the leading edge — the window Generate samples the actual entrance from |
| `present` | bar fill opacity scaled into a legible range (e.g. 0.5→1.0 present maps to ~55%→100% alpha) **plus** a small direct numeric label at the bar's right when `present < 1` |
| `after` | rendered as a hover-only detail (tooltip: "after ISO"); no persistent connector, to keep the chart quiet |

### Color — by role family (not per-layer)
Lanes already encode layer identity by position, so color is free to encode a second dimension. Bars are colored by **role family**, 4 hues:

- **bed** — NOISE, ELEMENT, ELEMENT_SUB, FX
- **tonal** — ISO, PLANET, DRONE
- **harmonic** — PAD, BASS
- **melodic** — ARP, MELODY

Four hues stays within the colorblind-safe categorical cap. Hues are drawn from the project's existing token palette (align with `AnalysisTimeline`'s accent usage and the brand palette in `globals.css`); the exact 4-hex set is validated with the dataviz `validate_palette.js` script before shipping (light + dark surfaces). A small legend (4 swatches + labels) sits above the three blocks; identity is never color-alone because the lane label always names the layer.

### Interaction
Per-bar hover tooltip: `LAYER · enter canon±half → exit · fadeIn/fadeOut · present · after`. Hit target = the bar. No filters needed (fixed small dataset). Empty lanes are non-interactive.

## Component structure

- **`grammarSpans()`** — new pure function in `inventory.ts` (unit-tested alongside existing `grammarRows` tests).
- **`GrammarTimeline.tsx`** — new client component in `src/components/rules/`. Props: `{ spans: GrammarSpan[] }`. Groups by mode internally, renders three lane blocks. Owns the field→mark geometry. Mirrors `AnalysisTimeline`'s markup conventions (labels, gridlines, `pct`).
- **`RuleLibrary.tsx`** — the "Live grammar" `<Group>` gains a segmented **Table / Timeline** control in its summary/header row. Local `useState<'table' | 'timeline'>` (default `'timeline'`). Renders the existing `<table>` or `<GrammarTimeline>` accordingly. Both fed from the same source (`grammarRows()` / `grammarSpans()`). Optional: persist choice to `localStorage` under a `rules.grammarView` key.

The existing table markup is not modified — it moves under the `view === 'table'` branch untouched.

## Testing

- `grammarSpans()` — asserts numeric extraction matches `grammarRows()` structurally (same mode/category coverage), `MODULE_END` preserved, `after` null-normalized.
- `GrammarTimeline` — renders a lane per category per mode (incl. empty lanes for absent categories), bar geometry percentages for a known fixture, `fadeIn = 0` renders the hard-edge variant, `present < 1` shows a label.
- Toggle — `RuleLibrary` shows table by default-or-timeline, switches on control click, both views present the same mode/layer set.

## Accessibility / dataviz checklist

- Legend present (4 role families); labels carry identity, not color alone.
- Table view *is* the "data table" affordance — always one click away.
- Dark mode: role hues re-validated against the dark surface, not auto-flipped.
- Palette run through `validate_palette.js` (light + dark) before merge.

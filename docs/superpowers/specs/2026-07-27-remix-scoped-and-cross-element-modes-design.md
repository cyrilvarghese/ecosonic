# Remix View — Scoped & Cross-Element Modes

**Status:** Approved design, not yet implemented · **Date:** 2026-07-27 · **Branch:** `feat/remix-view`
**Supersedes:** the "reuse Arrange setup / read `arrangementStore.tracks`" decision in
[the base remix spec](./2026-07-26-remix-view-free-mix-design.md) §7–§8.
**Builds on:** [base remix spec](./2026-07-26-remix-view-free-mix-design.md) ·
[implementation plan](../plans/2026-07-26-remix-view.md).

---

## 1. Where things stand (read this first)

The base Remix feature is **built and committed** on `feat/remix-view` (14 commits, `git log 70cb331..HEAD`):
`src/remix/{vocab,sessionRules,parseSessionTimeline,loadSessions,generateFreeMix,renderFreeMix}.ts`,
`src/app/api/sessions/route.ts`, `arrangementStore` `playFreeMix` + duration-aware `useModuleScheduler`,
`src/components/remix/{useRemix,ResultTimeline,TrackPoolRow,RemixView}.tsx`, `src/app/remix/page.tsx`,
seed data in `config/sessions/*.md`. **261 tests pass, tsc clean, remix code lint-clean.** Verified at
the HTTP level (`GET /remix 200`, `GET /api/sessions 200`).

**The problem to fix:** the current `/remix` reads `arrangementStore.tracks` — transient in-memory
state populated only by navigating Layer 1 → Layer 2 in one session. A direct visit to `/remix` shows
the empty prompt, and nothing links to it. Worse, pinning to one Arrange setup contradicts the
free-mix, which draws rules from **all elements**. `/remix` should build its **own** tracks and be
self-sufficient.

## 2. Goal

Make `/remix` self-sufficient with **two modes**, no Arrange-setup dependency, working on a direct visit:

- **Scoped** — pick an element; every track draws only from **that element's** rules; samples from that element.
- **Cross-element** — no picker; every track draws from the **whole pool**; each track's sample follows its picked rule's element.

## 3. Key design — the sample follows the pick

Every `AuthoredRule` carries `source.element`. The manifest (`@/manifest.json`, type `Manifest =
Record<ElementName, ElementManifest>`) indexes a sample list for every `element × category`. So a track's
audio is always `manifest[pickedRule.source.element][category]`.

**This unifies both modes** — the only difference is a **pool filter**:

| Mode | candidate rules for a category | sample element |
|---|---|---|
| Scoped(`el`) | `pool.filter(r => r.category === c && r.source.element === el)` | `el` (all candidates are from `el`) |
| Cross | `pool.filter(r => r.category === c)` | `pickedRule.source.element` (varies per track) |

Tracks are **derived**, not supplied: one track per category that has ≥1 candidate rule. No
`arrangementStore.tracks` read for the derivation.

## 4. Generator rework

Replace the `tracks`-in contract of `generateFreeMix` with a pool+manifest-in generator that also
builds the tracks. New module `src/remix/generateRemix.ts` (fold in the phrase→region logic from the
existing `generateFreeMix.ts`, which this supersedes):

```ts
import type { ElementName, Manifest } from '@/types';
import type { ArrTrack, TemplateRegion } from '@/arrange/types';
import type { AuthoredRule } from './sessionRules';

export interface RemixPick { track: ArrTrack; rule: AuthoredRule; poolSize: number }

export function generateRemix(
  pool: AuthoredRule[],
  manifest: Manifest,
  opts: { seed: number; element?: ElementName },   // element set ⇒ Scoped; omitted ⇒ Cross
): { tracks: ArrTrack[]; regions: TemplateRegion[]; picks: RemixPick[] };
```

Algorithm (pure, seeded via `makeRng` from `@/arrange/prng`):
1. Categories = distinct `r.category` in `pool` (filtered by `element` when Scoped).
2. For each category, `cands = pool.filter(r => r.category === c && (!opts.element || r.source.element === opts.element))`. Empty ⇒ skip (absent).
3. `rule = cands[floor(rng.float()*cands.length)]`.
4. `samples = manifest[rule.source.element][category]`. If empty ⇒ skip (or, optional fallback: try another element's samples — but simplest is skip + a returned warning).
5. `sample = samples[floor(rng.float()*samples.length)]`.
6. Build `ArrTrack`: `{ id: category, category, label: rule.variant ?? category, sample: { name, path, bytes }, ceilingDb: config.audio.volume.defaultTrackDb, locked: false }`.
7. Emit one `TemplateRegion` per `rule.phrases[i]` with `trackId = track.id`.
8. Return `{ tracks, regions, picks }`.

Deterministic: same pool + manifest + seed + element ⇒ same output. Regenerate = new seed.

**Note on `id`/category uniqueness:** one track per category (so `id = category` is unique). Melody
variants (`MELODY 2` / `SUB MELODY`) collapse into the single `MELODY` track — its `label` can show the
picked variant. This is the v1 "variant is label-only" decision.

## 5. `useRemix` changes (`src/components/remix/useRemix.ts`)

- Hold `mode: 'scoped' | 'cross'` and `element: ElementName | null` (default: `cross`, or `scoped` with
  a default element — pick one; recommend **cross** as the default since it's the headline behavior).
- Import the manifest: `import manifest from '@/manifest.json'` (as `Manifest`; see `appStore.ts` for
  the cast pattern) — or read it via `sessionStore`. Static import is simplest.
- Derivation: `generateRemix(flatPool(store), manifest, { seed, element: mode === 'scoped' ? element : undefined })`.
  (`flatPool` = concat every rule across the store; add a helper or reuse `poolFor` per category inside
  the generator — the generator takes the full `AuthoredRule[]`, so pass `Object.values(store).flatMap(docs => docs.flatMap(d => d.rules))`.)
- **Play/Export need `arrangementStore.tracks`** (the scheduler + renderer read them). After deriving,
  seed the store: `arrangementStore.getState().initFrom({ element: element ?? null, tracks, tuningHz: config.audio.tuning.defaultHz, masterDb: config.audio.volume.defaultMasterDb }, durationMin)`.
  Do this in an effect when `tracks` change (guard against loops — depend on a stable key like the
  seed+mode+element, not the tracks array identity).
- Return `{ tracks, picks, regions, totalSec, warnings, loading, mode, element, setMode, setElement, regenerate, refetch }`.

## 6. UI changes (`src/components/remix/RemixView.tsx`)

- Add a **mode toggle**: `[ Scoped | Cross-element ]` (pill toggle, like the rules page's timeline/cards toggle).
- When `mode === 'scoped'`, show **element chips**: `EARTH WATER AIR FIRE ETHER` (from `ELEMENTS` in `@/types`), the selected one lit; picking one sets `element` + regenerates.
- Remove the "Set up an Arrangement first" empty state — `/remix` now always has tracks (unless the pool
  is empty). Keep an empty state only for "no rules loaded".
- `TrackPoolRow` unchanged in spirit; it already shows candidate chips + the lit pick. In Scoped mode the
  candidates are one element's; in Cross they span elements (chip labels already encode element·section).
- Controls (🎲 Regenerate / ▶ Play / ⬇ Export / ⬆ Upload) unchanged; they operate on the derived
  `tracks`/`regions` now seeded into the store.

## 7. Tasks (bite-sized, TDD)

1. **`generateRemix`** (`src/remix/generateRemix.ts` + test). Tests: scoped filter (only picks that
   element's rules), cross (can pick any element; sample element follows the pick), one track per
   category, absent category skipped, empty-manifest-samples skipped, deterministic by seed, multi-phrase
   → multiple regions. Use a small fake `Manifest`. Commit.
2. **`useRemix` rework** (+ update `useRemix.test.ts`). Mock `fetch` + the manifest; assert mode/element
   switch changes picks; assert `initFrom` seeds the store. Commit.
3. **UI: mode toggle + element chips** in `RemixView` (+ a render test that the chips appear in scoped
   mode and toggle works). Remove the Arrange empty state. Commit.
4. **Delete/absorb `generateFreeMix.ts`** (superseded) — or keep it if still used; update imports/tests.
   Commit.
5. **Full check:** `npm test` (all green), `npx tsc --noEmit` (clean), `npm run lint` (remix code clean;
   pre-existing repo errors are out of scope). Commit any fixes.
6. **Manual smoke:** dev server from the worktree, open `/remix`, toggle Scoped↔Cross, pick elements,
   Regenerate/Play/Export.

## 8. Environment / how to run this worktree (IMPORTANT for a fresh session)

The feature lives in a **git worktree** at `.claude/worktrees/remix-view` (branch `feat/remix-view`),
created off `master`. A fresh worktree has **no `node_modules`** and no generated `manifest.json`:

- **node_modules:** junction it to the main repo (Windows):
  `New-Item -ItemType Junction -Path "<worktree>\node_modules" -Target "<mainRepo>\node_modules"`.
- **manifest.json:** copy the generated one in: `cp <mainRepo>/src/manifest.json <worktree>/src/manifest.json`
  (it's gitignored; regenerate with `npm run build:manifest` if stale). Needed for `@/manifest.json`
  imports (appStore, and the new generator).
- **Run tests from the worktree root:** `npx vitest run src/remix` etc. (`vitest.config.ts` already
  excludes `**/.claude/**`).
- **Dev server:** `npm run dev` from the worktree (uses port 3001 if 3000 is taken). `/remix` resolves there.

## 9. Decisions locked (do not re-litigate)

- Free-mix = pick **one rule per track** from the pool, honor absence; **no invariant repair**; sparsity/silence accepted.
- **Continuous absolute 0–`totalSec` timeline**; sections are metadata labels, not render boundaries.
- Multi-phrase rules render as multiple regions; per-phrase fades; same-layer rows merge (parser done).
- Render/play reuse `renderModuleToWav` / the single-module scheduler with `moduleSeconds = totalSec` (done).
- **Sample follows the picked rule's element** (`manifest[rule.source.element][category]`).
- Two modes: **Scoped** (element-filtered pool + that element's samples) and **Cross-element** (full pool + per-pick element). One code path, differing only by the pool filter.
- Seed data: `config/sessions/*.md` (air NOISE fixed, fire ELEMENTS split, water from PDF spec; earth is its own `.md`). Parser is zero-warning on all five (CI guard: `loadSessions.test.ts`).

## 10. Out of scope (still)

In-app rule editing; saving a generated result; per-variant separate tracks; auto-crossfading distinct
picks; re-authoring earth with genuine earth material.

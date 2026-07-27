# Remix View — Section Picker, Working Playback, Timeline Affordances

**Status:** Approved design, not yet implemented · **Date:** 2026-07-27 · **Branch:** `feat/remix-view`
**Builds on:** [base remix spec](./2026-07-26-remix-view-free-mix-design.md) ·
[scoped & cross-element modes](./2026-07-27-remix-scoped-and-cross-element-modes-design.md) (built)
**Revises:** the "sections are metadata labels only" half of §9 of the scoped/cross spec — sections
become a *selectable scope*, though the full-session draw keeps the absolute-timeline behaviour.

---

## 1. Where things stand

Scoped & Cross-element modes are **built and committed** (4 commits, `generateRemix.ts`, reworked
`useRemix`, mode toggle + element chips). 277 tests pass, tsc clean, remix code lint-clean. `/remix`
renders on a direct visit and derives its own tracks.

Three problems surfaced on first real use:

**A. Play does nothing.** `/remix` renders only `<RemixView />`, which mounts **no audio engine and
no scheduler**. Compare `ArrangeScreen.tsx:22-23` (`useLayer2Engine()` + `useModuleScheduler(engine)`).
`playFreeMix` sets `playing`/`moduleRegions`/`durationSec` and nothing consumes them. Two further
defects sit behind it:

- `useLayer2Engine.ts:21-23` loads tracks **once on mount** from a snapshot and early-returns when
  `tracks` is empty. On `/remix` tracks arrive after the `/api/sessions` fetch and change on every
  regenerate — so the engine would load nothing, then never reload.
- `useModuleScheduler.ts:59` uses `.find(r => r.trackId === track.id)` — **the first region only**.
  Multi-phrase rules emit several regions per track; the offline renderer maps over all of them, so
  Play and Export disagree.

**B. Export did nothing.** The worktree had no `ECOSONIC FILES` directory, so
`/api/samples/...` (which resolves from `process.cwd()/ECOSONIC FILES`) returned **404** for every
sample and `decodeAudioData` threw on a 404 body. **Fixed** by junctioning the folder in — the same
URL now returns `206 bytes 0-1023/27648080`. `onExport` has no `catch` and no UI feedback, which is
why every failure looked identical to nothing happening.

**C. Each track only sounds in one third of the session.** One rule per category, and every rule is
tagged to one section, so a `NOISE` bed can be silent for 20 minutes:

```
seed=1  NOISE  INTRODUCTION      0-600     ← then silent for 20 minutes
seed=2  NOISE  RETURN         1140-1800    ← no bed for the first 19 minutes
seed=3  NOISE  DEEP_RELAXATION 600-1170
```

## 2. Goals

1. A **section picker** as a third axis: compose one ~10-minute module, like Layer 2's designer.
2. **Play and Export actually work** on `/remix`.
3. Two timeline affordances: **hover shows a rule's time intervals**, and the result timeline carries
   a **time scale**.

## 3. Key data — section windows are per-element and they disagree

Each session `.md` declares its section windows in the header, e.g.
`## Section 2 - Deep Relaxation (10:00-20:00)`:

| Element | Introduction | Deep Relaxation | Return |
|---|---|---|---|
| EARTH / WATER / FIRE / ETHER | 0:00–10:00 | 10:00–20:00 | 20:00–30:00 |
| **AIR** | 0:00–**9:30** | **9:30–19:00** | 20:00–**29:30** |

So the rebase origin for Deep Relaxation is **570s for AIR and 600s for everyone else**. Origin is
real authored data, not a constant — and `parseSessionTimeline.ts:45-48` currently matches the
section start in `header[2]` and **discards it**, keeping only `header[3]` (the end, used to resolve
"End of section").

## 4. Parser — record the section window

Capture the start and hang it on the rule. Purely additive; phrases stay absolute, so the
full-session path is untouched.

```ts
export interface AuthoredRule {
  category: Category;
  variant?: string;
  section: Mode;
  sectionStartSec: number;   // NEW — absolute start of the window it was authored in
  phrases: Phrase[];         // still absolute
  source: { element: ElementName; sessionId: string; track: string };
}
```

## 5. Generator — a section axis that rebases per rule

```ts
export function generateRemix(
  pool: AuthoredRule[],
  manifest: Manifest,
  opts: { seed: number; element?: ElementName; section?: Mode; sessionSec: number },
): { tracks: ArrTrack[]; regions: TemplateRegion[]; picks: RemixPick[]; warnings: string[]; totalSec: number };
```

- **`section` omitted** ⇒ today's behaviour exactly: whole pool, absolute times,
  `totalSec = sessionSec` (the caller's `durationMin × 60`).
- **`section` set** ⇒ filter to `r.section === section`; **rebase every phrase by that rule's own
  `sectionStartSec`**; `totalSec = config.layerTwo.moduleSeconds` (600).

Rebasing per rule is what makes Cross-element work in a section: an AIR Deep-Relaxation rule shifts
by 570 and an EARTH one by 600, and both land on the same 0–600 timeline.

After rebasing, clip `exitSec` to `totalSec` and skip any phrase starting at or past it, with a
warning. Defensive — AIR's windows are shorter than 600s, not longer — but authored data can drift.

`totalSec` moves into the return value so no caller has to know the rule.

## 6. Hook and UI

- `useRemix` holds `section: Mode | null` (**null = Full session, the default**) plus `setSection`,
  and reads `totalSec` from the draw rather than computing `durationMin * 60`.
- `initFrom` is seeded with `totalSec / 60` as its `durationMin`.
- A second chip row in `RemixView`, independent of the Scoped/Cross toggle:

```
[ Cross-element | Scoped ]
[ Full session | Intro | Deep Relaxation | Return ]
```

Follow the existing chip pattern: `aria-pressed`, `LIT` when active.

## 7. Playback — reuse Layer 2's hooks and fix their two limits

Mount `useLayer2Engine()` + `useModuleScheduler(engine)` in `RemixView`, then:

1. **Engine reloads when the draw changes.** Key the load effect on the track identity list instead
   of running once against a mount-time snapshot, and drop the `if (!st.tracks.length) return` early
   exit so an empty→populated transition still loads.
2. **Scheduler honours every region.** Replace `.find(r => r.trackId === track.id)` with a search for
   the region *containing* the playhead.

Both are no-ops for Layer 2 — its templates carry one region per track and its tracks never change
after hand-off — and both are fixes for `/remix`. That is why they belong in the shared hooks rather
than in a parallel `useRemixEngine`: the `.find()` defect is latent in Layer 2 the moment anything
emits two regions for a track.

**Export feedback:** wrap `onExport` in `try/catch`, show a rendering indicator and surface the error.

**Known weight, not being optimised yet:** samples are 26–82 MB each, above the 8 MB
`hybridThresholdBytes`, so live playback streams them but the offline renderer always decodes whole
files. A 600s render buffer is ~212 MB against ~635 MB for 1800s, so the section picker helps.
Full-session export stays known-heavy — measure before optimising.

## 8. Timeline affordances

- **Hover a candidate chip** in `TrackPoolRow` → its rule's phrase intervals, formatted `M:SS`, e.g.
  `0:00–3:39, 5:27–8:09`, plus the section. Use the existing `src/components/ui/tooltip.tsx`
  (base-ui) rather than a bare `title`.
- **Time scale on `ResultTimeline`.** A tick row above the lanes, aligned to the same label gutter,
  with labels at "nice" intervals chosen to yield ~5–8 ticks (e.g. every 5 min over 1800s, every
  2 min over 600s). Replaces the two hardcoded dividers at 33.3%/66.7%, which are wrong for a
  600s section draw.

## 9. Tasks (bite-sized, TDD)

1. **Parser records `sectionStartSec`** (+ test: AIR Deep Relaxation = 570, EARTH = 600). Commit.
2. **`generateRemix` section axis** — filter, per-rule rebase, clip + warn, `totalSec` in the return
   (+ tests). Update callers. Commit.
3. **`useRemix` section state** + `totalSec` from the draw (+ tests). Commit.
4. **Section chip row** in `RemixView` (+ render test). Commit.
5. **Scheduler multi-region fix** (+ test asserting a second phrase plays; guards Layer 2). Commit.
6. **Engine reload-on-change fix** (+ test). Commit.
7. **Mount engine + scheduler in `RemixView`**; `onExport` try/catch + indicator. Commit.
8. **Chip hover tooltip** with phrase intervals (+ test). Commit.
9. **Timeline time scale** (+ test on tick positions/labels). Commit.
10. **Full check:** `npm test`, `npx tsc --noEmit`, `npm run lint` (remix code clean; the 5
    pre-existing offenders are out of scope). Commit any fixes.
11. **Manual smoke in a browser:** toggle modes and sections, Regenerate, **Play**, **Export**.

## 10. Decisions locked

- Section picker sits **alongside** the full-session draw; **Full session is the default**.
- Section module length is **fixed `config.layerTwo.moduleSeconds` (600s)**; AIR's 570s content ends
  30s early.
- Rules rebase by **their own `sectionStartSec`**, never by a constant.
- Playback reuses **Layer 2's engine + scheduler**, fixed in place, not a parallel hook.
- Sample follows the picked rule's element (unchanged).

## 11. Out of scope

Stitching three sections into one session; per-section absence repair; the `ELEMENT_SUB` sample gap
(WATER and ETHER have `ELEMENT_SUB` rules but no samples — generator skips + warns, still parked);
offline-render memory optimisation; in-app rule editing; saving a generated result.

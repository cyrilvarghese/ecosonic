# Remix — Layered lanes & click-to-set timings — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a `/remix` category sound several elements at once — each on its own authored timing — and make the candidate chips clickable so a timing can be pinned deliberately instead of only drawn.

**Architecture:** A *lane* replaces a *track* as the unit `/remix` derives: one lane per category **per element**, with id `CATEGORY·ELEMENT`. Two lanes are two `trackId`s, so overlapping timings layer through separate voices with nothing to resolve. Pins are stored as `slotKey → ruleKey` — keyed by rule *content*, not object identity, so they survive the `refetch()` that rebuilds every rule object — and are an input to the seeded draw, so Regenerate rerolls only unpinned slots.

**Tech Stack:** TypeScript, React 19.2.4, Next 16.2.9, Zustand, Vitest 4.1.9 + @testing-library/react (jsdom).

**Design doc:** [2026-07-31-remix-layered-lanes-design.md](../specs/2026-07-31-remix-layered-lanes-design.md) — read §3, §4, §5 and §7 before Task 3. This plan follows it; the four places it deviates are listed under **Deviations** below.

## Global Constraints

- **This is NOT the Next.js you know** (`AGENTS.md`): before writing any Next-specific code, read the relevant guide in `node_modules/next/dist/docs/`. Only Task 0 and Task 10 plausibly touch Next; the rest is pure TS + React.
- **Run every test command from inside the worktree** `.claude/worktrees/additional-features-remix`. `vitest` at the repo root picks up `.claude/worktrees/**` and reports phantom failures.
- **Never recursive-delete this worktree.** `node_modules` and `ECOSONIC FILES` are NTFS junctions to the main repo; `rm -rf` follows them and would wipe the 6.3 GB audio library. Unlink junctions first.
- **`Math.random()` is banned in generator code** (`src/arrange/prng.ts`). Everything random goes through `makeRng(seed)`.
- **Lane id separator is `·` (U+00B7, MIDDLE DOT)** — the same character the chips already use. Not `-`, not `.`, not `*`.
- **Every task ends with a commit.** Conventional-commit prefixes as used on this branch: `feat(remix)`, `fix(remix)`, `test(remix)`, `docs(remix)`.
- Verification commands, run from the worktree: `npx vitest run`, `npx tsc --noEmit`, `npx eslint src/remix src/components/remix`.

## Deviations from the design

Four points where this plan refines the design doc. Each is a deliberate decision, not an oversight.

1. **Pool rows become per-category, not per-lane** (Task 8). The design's §8 keeps `RemixView` rendering one `TrackPoolRow` per track. Once a category has two lanes that renders two identical chip rows, and filtering each row to its own lane's element would hide exactly the chips §5.1 needs you to click to *create* a lane. One row per category, all lanes' picks lit.
2. **Lane labels land in Task 2, not last.** The design lists the `ResultTimeline` gutter as task 9. A second lane appears in Task 3, and until the label carries its element the two lanes are indistinguishable in the UI — so the label and gutter go in *before* the feature that needs them.
3. **`togglePin(rule)` rather than `setPin`/`clearPin`** (Task 7). §5.1 defines one gesture with three outcomes, all reachable from one rule object. Two functions would need the caller to decide which — the hook already knows.
4. **Pins are ignored in Borrowed mode** (Task 6). A `slotKey` names a lane by element; a borrowed lane has no rule-element, so no slotKey can address it. Pins are *retained* in state across the mode switch (§5.4) and apply again on return.

---

## File Structure

**New:**

| file | responsibility |
|---|---|
| `src/remix/pins.ts` | `ruleKey`, `slotKey`, `slotKeyFor`, the `Pins` type. Pure string keys, no React, no I/O — imported by the generator, the hook and the chip row alike. |
| `src/remix/pins.test.ts` | The uniqueness guard: `ruleKey` must not collide across the whole shipped authored pool. |

**Modified:**

| file | change |
|---|---|
| `src/remix/generateRemix.ts` | lane ids and labels; `lanesPerTrack`; pins; collapsed warning |
| `src/remix/generateRemix.test.ts` | id/label assertions; new lane, pin and warning tests |
| `src/components/remix/useRemix.ts` | `layered` mode, `lanesPerTrack` + `pins` state, memo deps |
| `src/components/remix/useRemix.test.ts` | layered, pins-survive-regenerate |
| `src/components/remix/TrackPoolRow.tsx` | per-category row; clickable chips; three states |
| `src/components/remix/TrackPoolRow.test.tsx` | `category` prop; click, pinned, inert |
| `src/components/remix/RemixView.tsx` | Layered pill; lanes control; per-category rows; pin wiring |
| `src/components/remix/RemixView.test.tsx` | lane-id testids throughout; layered + pin coverage |
| `src/components/remix/ResultTimeline.tsx` | label gutter widened (three places) |
| `docs/remix-rules.md` | §3.1, §3.4, §3.6, §3.9, §7, new §9 |

---

## Task 0: Worktree environment

Nothing below can be verified until the worktree can run its tests. Three things git does not carry, per design §11.

**Files:** none committed — every path here is in `.gitignore`.

**Interfaces:**
- Consumes: the main checkout at `C:\Users\cyril varghese\code\ecosonic`
- Produces: a worktree where `npx vitest run` passes, which every later task's verification depends on

- [ ] **Step 1: Link `node_modules`**

From the worktree root:

```bash
cmd //c mklink /J node_modules "C:\Users\cyril varghese\code\ecosonic\node_modules"
```

- [ ] **Step 2: Link the audio library**

Without this every `/api/samples/…` 404s and both Play and Export fail silently. It is not needed for the test suite, but it is needed for the Task 11 smoke test — do it now.

```bash
cmd //c mklink /J "ECOSONIC FILES" "C:\Users\cyril varghese\code\ecosonic\ECOSONIC FILES"
```

- [ ] **Step 3: Generate the manifest**

`src/manifest.json` is gitignored and absent here. It is imported directly by `useRemix.ts`, so its absence is a TypeScript error, not a runtime one.

```bash
npm run build:manifest
```

Expected: `src/manifest.json` exists and is non-empty.

- [ ] **Step 4: Establish the green baseline**

```bash
npx vitest run
npx tsc --noEmit
```

Expected: all tests pass, no type errors. **Record the test count** — every later task should hold at or above it. If anything fails here, stop and fix the environment; do not start Task 1 against a red baseline.

- [ ] **Step 5: No commit**

Everything created here is gitignored. `git status` should still be clean.

---

## Task 1: Lane ids

`id = CATEGORY·ELEMENT`, always — even for the single-lane draw where `MELODY·EARTH` is the only melody lane. Per design §3.2, an id that changed shape when a sibling lane appeared would silently lose its `mutedIds` entry and be reloaded by the engine mid-session.

Behaviour is otherwise unchanged: still one lane per category.

**Files:**
- Modify: `src/remix/generateRemix.ts:117-129`
- Test: `src/remix/generateRemix.test.ts`, `src/components/remix/RemixView.test.tsx`

**Interfaces:**
- Consumes: `AuthoredRule`, `Manifest`, `ArrTrack` — unchanged
- Produces: `ArrTrack.id` of the form `` `${category}·${audioElement}` ``, where `audioElement` is `opts.sampleElement ?? lead.source.element` — the element whose **sample** the lane plays, not necessarily the element its rules came from. Every later task keys pins, mutes and regions off this string.

- [ ] **Step 1: Write the failing test**

Add to `src/remix/generateRemix.test.ts`, inside the first `describe('generateRemix', …)`:

```ts
  it('ids a lane by its category and the element it sounds', () => {
    const pool = [rule('MELODY', 'WATER'), rule('PAD', 'FIRE')];
    const { tracks } = generateRemix(pool, fakeManifest(), { ...SESSION, seed: 1 });
    expect(tracks.map((t) => t.id).sort()).toEqual(['MELODY·WATER', 'PAD·FIRE']);
  });

  it('ids a borrowed lane by the element it plays, not the rule it drew', () => {
    // Borrowed splits the two: the rule is WATER's, the audio is EARTH's. The id follows the audio,
    // because that is what mute, the engine and regionAt all address.
    const pool = [rule('MELODY', 'WATER')];
    const { tracks, regions } = generateRemix(pool, fakeManifest(), {
      ...SESSION, seed: 1, sampleElement: 'EARTH',
    });
    expect(tracks[0].id).toBe('MELODY·EARTH');
    expect(regions.every((r) => r.trackId === 'MELODY·EARTH')).toBe(true);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run src/remix/generateRemix.test.ts
```

Expected: both new tests FAIL — received `['MELODY', 'PAD']` and `'MELODY'`.

- [ ] **Step 3: Write the implementation**

In `src/remix/generateRemix.ts`, replace the `id` line of the track literal:

```ts
    const track: ArrTrack = {
      // A lane is category × element, so the id carries both — and carries them even when there is
      // only one lane, because an id that changed shape when a sibling appeared would lose this
      // lane's mute state and make the engine reload it mid-session (design §3.2).
      id: `${category}·${audioElement}`,
      category,
      label: drawn[0].rule.variant ?? category,
      sample: { name: sample.name, path: sample.path, bytes: sample.bytes },
      ceilingDb: config.audio.volume.defaultTrackDb,
      locked: false,
    };
```

Leave everything else in the file alone. `regions.push({ ...r, trackId: track.id })` already reads the new id.

- [ ] **Step 4: Update the existing id assertions in `generateRemix.test.ts`**

Five sites. Apply each exactly:

```ts
// in 'derives one track per category, collapsing melody variants into its label'
    expect(tracks[0].id).toBe(`MELODY·${picks[0].rule.source.element}`);

// in 'emits one region per phrase, keyed to its track'
    expect(regions.every((r) => r.trackId === 'PAD·FIRE')).toBe(true);
    expect(regions[0]).toEqual({ trackId: 'PAD·FIRE', enterSec: 0, exitSec: 120, fadeInSec: 0, fadeOutSec: 120 });

// in 'rebases each rule by its own section start, not a constant'
    expect(byTrack.get('MELODY·AIR')).toMatchObject({ enterSec: 30, exitSec: 330 });
    expect(byTrack.get('PAD·EARTH')).toMatchObject({ enterSec: 60, exitSec: 360 });

// in 'rebases a borrowed rule by its own section start, not the sample element’s'
    expect(regions[0]).toMatchObject({ trackId: 'MELODY·EARTH', enterSec: 30, exitSec: 330 });
```

- [ ] **Step 5: Update `RemixView.test.tsx` — add the lane matcher**

The view's testids are `region-${trackId}-${enterSec}`, so all ~30 of them change. Which element a cross-mode lane lands on is the seed's business, so match on the category rather than hard-coding it. Add this helper just below the `rule` factory (above `const STORE`):

```ts
/** A region testid is `region-${laneId}-${enterSec}` and a lane id is `CATEGORY·ELEMENT`. Which
 *  element a cross draw lands on is the seed's business, so match the category and let the element
 *  be whatever was drawn. */
const laneRegion = (category: string, enterSec = 0) =>
  new RegExp(`^region-${category}·[A-Z]+-${enterSec}$`);
```

- [ ] **Step 6: Update `RemixView.test.tsx` — apply the matcher**

Mechanical, whole-file:

- Replace every `screen.findByTestId('region-PAD-0')` with `screen.findByTestId(laneRegion('PAD'))`.
- Replace every `screen.getByTestId('region-PAD-0')` with `screen.getByTestId(laneRegion('PAD'))`.
- Replace every `screen.queryByTestId('region-PAD-0')` with `screen.queryByTestId(laneRegion('PAD'))`.
- Replace every `screen.findByTestId('region-MELODY-0')` / `getByTestId('region-MELODY-0')` with the `laneRegion('MELODY')` form.
- Replace `screen.getByTestId('region-BASS-120')` with `screen.getByTestId(laneRegion('BASS', 120))`.
- Replace both `within(screen.getByTestId('region-PAD-0'))` with `within(screen.getByTestId(laneRegion('PAD')))`.

Then the four non-testid sites. PAD is authored only by FIRE in this file's `STORE`, so its lane id is deterministic:

```ts
// 'rounds an interval to whole loops when adjust is ticked'  and
// 'exports the adjusted intervals, not the authored ones'    and
// 'plays the adjusted intervals, not the authored ones'
    await waitFor(() => expect(arrangementStore.getState().trackDurations['PAD·FIRE']).toBe(40));

// 'exports the adjusted intervals, not the authored ones'
    expect(exportCtl.lastArgs!.regions.find((r) => r.trackId === 'PAD·FIRE')?.exitSec).toBe(80);

// 'plays the adjusted intervals, not the authored ones'
    const pad = arrangementStore.getState().moduleRegions.find((r) => r.trackId === 'PAD·FIRE');

// 'leaves a muted track out of the exported mix'
    expect(exportCtl.lastArgs!.tracks.map((t) => t.id)).not.toContain('PAD·FIRE');
    expect(exportCtl.lastArgs!.regions.map((r) => r.trackId)).not.toContain('PAD·FIRE');
    expect(exportCtl.lastArgs!.tracks.some((t) => t.id.startsWith('MELODY·'))).toBe(true);
```

`getByRole('button', { name: 'Mute PAD' })` stays as it is — `label` does not change until Task 2.

- [ ] **Step 7: Run the full suite**

```bash
npx vitest run
npx tsc --noEmit
```

Expected: PASS, at the Task 0 count + 2.

- [ ] **Step 8: Commit**

```bash
git add src/remix/generateRemix.ts src/remix/generateRemix.test.ts src/components/remix/RemixView.test.tsx
git commit -m "feat(remix): a lane id is CATEGORY·ELEMENT, always"
```

---

## Task 2: Lane labels and the timeline gutter

A lane's label gains the element it sounds, so two lanes of one category can be told apart the moment Task 3 creates them. `w-36` will not hold `MELODY 2 · Fire`, and the gutter width appears in **three** places — the row label, the tick-row spacer and the playhead spacer. Miss one and the playhead stops lining up with the bars.

**Files:**
- Modify: `src/remix/generateRemix.ts` (the `label` line)
- Modify: `src/components/remix/ResultTimeline.tsx:94`, `:113`, `:184`
- Test: `src/remix/generateRemix.test.ts`, `src/components/remix/RemixView.test.tsx`

**Interfaces:**
- Consumes: `ArrTrack.id` from Task 1
- Produces: `ArrTrack.label` of the form `` `${variant ?? category} · ${Titlecase(element)}` `` — e.g. `MELODY 2 · Fire`, `PAD · Earth`. `ResultTimeline` renders it in the mute `aria-label` (`Mute PAD · Fire`), the row gutter, the bar tooltip and the bar's `interval-source` text.

- [ ] **Step 1: Write the failing test**

In `src/remix/generateRemix.test.ts`, inside the first `describe`:

```ts
  it('labels a lane with its variant and the element it sounds', () => {
    const pool = [rule('MELODY', 'FIRE', [ph(0, 60)], 'MELODY 2'), rule('PAD', 'EARTH')];
    const { tracks } = generateRemix(pool, fakeManifest(), { ...SESSION, seed: 1 });
    const byId = new Map(tracks.map((t) => [t.id, t.label]));
    expect(byId.get('MELODY·FIRE')).toBe('MELODY 2 · Fire');
    expect(byId.get('PAD·EARTH')).toBe('PAD · Earth');
  });
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npx vitest run src/remix/generateRemix.test.ts -t 'labels a lane'
```

Expected: FAIL — received `'MELODY 2'` and `'PAD'`.

- [ ] **Step 3: Write the implementation**

In `src/remix/generateRemix.ts`, add near the top-level helpers (below `SECTION_ORDER`):

```ts
/** "WATER" → "Water" — a lane label reads `MELODY 2 · Water`, not `MELODY 2 · WATER`. */
const titleCase = (el: string): string => el[0] + el.slice(1).toLowerCase();
```

and change the track literal's label:

```ts
      label: `${drawn[0].rule.variant ?? category} · ${titleCase(audioElement)}`,
```

- [ ] **Step 4: Widen the label gutter — all three places**

In `src/components/remix/ResultTimeline.tsx`, change `w-36` to `w-44` at each of:

```tsx
// the tick-row spacer (~line 94)
        <span className="w-44 shrink-0" aria-hidden />

// the per-row label gutter (~line 113)
            <span className="flex w-44 shrink-0 items-center gap-1">

// the playhead overlay spacer (~line 184)
        <span className="w-44 shrink-0" aria-hidden />
```

All three must match, or the playhead drifts from the bars it is supposed to mark.

- [ ] **Step 5: Update the one label assertion in `RemixView.test.tsx`**

`RemixView.test.tsx:343` is the only place in the suite that asserts on a generated label:

```ts
// 'leaves a muted track out of the exported mix'
    await userEvent.click(screen.getByRole('button', { name: 'Mute PAD · Fire' }));
```

`ResultTimeline.test.tsx` also asserts `Mute MELODY` and several `interval-source` texts, but it
constructs its own `ArrTrack` fixtures rather than going through the generator — leave it alone.

- [ ] **Step 6: Run the full suite**

```bash
npx vitest run
npx tsc --noEmit
```

Expected: PASS, previous count + 1.

- [ ] **Step 7: Commit**

```bash
git add src/remix/generateRemix.ts src/remix/generateRemix.test.ts \
        src/components/remix/ResultTimeline.tsx src/components/remix/RemixView.test.tsx
git commit -m "feat(remix): lane labels carry their element, and the gutter fits them"
```

---

## Task 3: `lanesPerTrack` — several elements per category

The feature itself. The generator's per-category body is restructured into a lane loop; leads are drawn **without replacement** so each lane gets a different element.

The restructure is written so that `lanesPerTrack: 1` (and omitted) consumes the RNG in *exactly* today's order — lead, then per-section, then sample. That makes "the default draw is unchanged" an assertion rather than a hope, and Step 1 asserts it.

**Files:**
- Modify: `src/remix/generateRemix.ts:70-130` (the whole per-category body)
- Test: `src/remix/generateRemix.test.ts`

**Interfaces:**
- Consumes: lane ids and labels from Tasks 1–2
- Produces:
  - `generateRemix(pool, manifest, opts)` gains `opts.lanesPerTrack?: number` — how many elements the draw may take per category; `1` (and omitted) is today's behaviour.
  - An internal `Lane` shape used by Tasks 4 and 6:
    ```ts
    interface Lane {
      /** The element whose rules fill this lane — null in Borrowed, where rules come from anywhere. */
      ruleElement: ElementName | null;
      /** The element whose sample it plays. The lane's id and label carry this one. */
      audioElement: ElementName;
      /** The rule that fixed this lane. A section draw uses it directly. */
      lead: AuthoredRule;
    }
    ```
  - An internal `drawLeads(cands, rng, count): AuthoredRule[]`.

- [ ] **Step 1: Write the failing tests**

Add a new `describe` block at the end of `src/remix/generateRemix.test.ts`:

```ts
describe('generateRemix — layered lanes', () => {
  const BASE = { seed: 1, sessionSec: 1800 };

  // One category authored by three elements, so a layered draw has room to take more than one.
  const melodyFromThree = [
    rule('MELODY', 'EARTH'),
    rule('MELODY', 'WATER'),
    rule('MELODY', 'FIRE'),
  ];

  it('is byte-identical to today when it may take only one lane', () => {
    const manifest = fakeManifest();
    for (let seed = 1; seed <= 10; seed++) {
      expect(generateRemix(melodyFromThree, manifest, { ...BASE, seed, lanesPerTrack: 1 }))
        .toEqual(generateRemix(melodyFromThree, manifest, { ...BASE, seed }));
    }
  });

  it('gives a category one lane per element, each with its own sample', () => {
    const { tracks } = generateRemix(melodyFromThree, fakeManifest(), { ...BASE, lanesPerTrack: 2 });
    expect(tracks).toHaveLength(2);
    expect(new Set(tracks.map((t) => t.id)).size).toBe(2);
    for (const t of tracks) {
      const element = t.id.split('·')[1];
      expect(t.sample.name).toBe(`${element}-MELODY`);
    }
  });

  it('never draws the same element twice for one category', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const { tracks } = generateRemix(melodyFromThree, fakeManifest(), {
        ...BASE, seed, lanesPerTrack: 3,
      });
      const elements = tracks.map((t) => t.id.split('·')[1]);
      expect(new Set(elements).size).toBe(elements.length);
    }
  });

  it('stops at the elements that exist, not at lanesPerTrack', () => {
    const pool = [rule('MELODY', 'EARTH'), rule('MELODY', 'WATER')];
    const { tracks } = generateRemix(pool, fakeManifest(), { ...BASE, lanesPerTrack: 3 });
    expect(tracks).toHaveLength(2);
  });

  it('keeps every rule of a lane inside that lane’s element (§3.4, scoped to a lane)', () => {
    const pool = [
      rule('NOISE', 'EARTH', [ph(0, 600)], undefined, 'INTRODUCTION', 0),
      rule('NOISE', 'EARTH', [ph(600, 1200)], undefined, 'DEEP_RELAXATION', 600),
      rule('NOISE', 'WATER', [ph(0, 600)], undefined, 'INTRODUCTION', 0),
      rule('NOISE', 'WATER', [ph(1200, 1800)], undefined, 'RETURN', 1200),
    ];
    const { tracks, picks } = generateRemix(pool, fakeManifest(), { ...BASE, lanesPerTrack: 2 });
    expect(tracks).toHaveLength(2);
    for (const t of tracks) {
      const element = t.id.split('·')[1];
      const mine = picks.filter((p) => p.track.id === t.id);
      expect(mine.length).toBeGreaterThan(0);
      expect(mine.every((p) => p.rule.source.element === element)).toBe(true);
    }
  });

  it('orders lanes of one category by the element order', () => {
    const { tracks } = generateRemix(melodyFromThree, fakeManifest(), { ...BASE, lanesPerTrack: 3 });
    // ELEMENTS is EARTH, WATER, AIR, FIRE, ETHER — so EARTH's lane sits above WATER's, above FIRE's.
    expect(tracks.map((t) => t.id)).toEqual(['MELODY·EARTH', 'MELODY·WATER', 'MELODY·FIRE']);
  });

  it('keeps the vertical stack grammar across categories', () => {
    const pool = [
      rule('MELODY', 'EARTH'), rule('MELODY', 'WATER'),
      rule('NOISE', 'EARTH'), rule('NOISE', 'WATER'),
    ];
    const { tracks } = generateRemix(pool, fakeManifest(), { ...BASE, lanesPerTrack: 2 });
    expect(tracks.map((t) => t.category)).toEqual(['NOISE', 'NOISE', 'MELODY', 'MELODY']);
  });

  it('layers overlapping timings instead of dropping one, because a lane is a voice', () => {
    // Both elements author the same window. On one track regionAt would resolve to the first and the
    // second would never sound; on two lanes both play. This is the point of the feature (§4).
    const pool = [
      rule('PAD', 'EARTH', [ph(0, 600)]),
      rule('PAD', 'WATER', [ph(0, 600)]),
    ];
    const { regions } = generateRemix(pool, fakeManifest(), { ...BASE, lanesPerTrack: 2 });
    expect(regions).toHaveLength(2);
    expect(new Set(regions.map((r) => r.trackId)).size).toBe(2);
    expect(regions.every((r) => r.enterSec === 0 && r.exitSec === 600)).toBe(true);
  });

  it('caps Borrowed at one lane — the extra would be the same file staggered (§6.1)', () => {
    const { tracks } = generateRemix(melodyFromThree, fakeManifest(), {
      ...BASE, lanesPerTrack: 3, sampleElement: 'ETHER',
    });
    expect(tracks.map((t) => t.id)).toEqual(['MELODY·ETHER']);
  });

  it('draws lane elements in proportion to their rule count (§3.7)', () => {
    // Three WATER melodies against one FIRE: WATER should win the first lane far more often.
    const pool = [
      rule('MELODY', 'WATER'), rule('MELODY', 'WATER'), rule('MELODY', 'WATER'),
      rule('MELODY', 'FIRE'),
    ];
    let waterFirst = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const { tracks } = generateRemix(pool, fakeManifest(), { ...BASE, seed, lanesPerTrack: 1 });
      if (tracks[0].id === 'MELODY·WATER') waterFirst++;
    }
    expect(waterFirst).toBeGreaterThan(120); // ~150 expected at 3:1; well clear of 1:1's ~100
  });

  it('repeats a layered draw for a seed', () => {
    const manifest = fakeManifest();
    expect(generateRemix(melodyFromThree, manifest, { ...BASE, seed: 7, lanesPerTrack: 2 }))
      .toEqual(generateRemix(melodyFromThree, manifest, { ...BASE, seed: 7, lanesPerTrack: 2 }));
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

```bash
npx vitest run src/remix/generateRemix.test.ts -t 'layered lanes'
```

Expected: the `lanesPerTrack: 1` test passes trivially (the option is ignored); the multi-lane ones FAIL with one track where two were expected.

- [ ] **Step 3: Write the implementation**

In `src/remix/generateRemix.ts`, add the import and the two helpers, then replace the per-category body.

Imports at the top of the file:

```ts
import { ELEMENTS, type Category, type ElementName, type Manifest } from '@/types';
import { makeRng, type RNG } from '@/arrange/prng';
```

Helpers, below `titleCase`:

```ts
/** One derived lane: category × element. Rules and audio are the same element everywhere except
 *  Borrowed, where the audio is fixed by hand and the rules stay wide open (§3.4). */
interface Lane {
  ruleElement: ElementName | null;
  audioElement: ElementName;
  lead: AuthoredRule;
}

/** Lead rules for a category, one per lane, drawn WITHOUT replacement of the element: each draw is
 *  uniform over the rules still in play, so an element with more authored variants stays likelier to
 *  win a lane (§3.7), and no element wins two. */
function drawLeads(cands: AuthoredRule[], rng: RNG, count: number): AuthoredRule[] {
  const out: AuthoredRule[] = [];
  let remaining = cands;
  while (out.length < count && remaining.length > 0) {
    const lead = remaining[Math.floor(rng.float() * remaining.length)];
    out.push(lead);
    remaining = remaining.filter((r) => r.source.element !== lead.source.element);
  }
  return out;
}
```

Add the option to the signature:

```ts
    section?: Mode;
    sessionSec: number;
    /** Layered: how many elements the draw may take per category. 1 (and omitted) = one lane. */
    lanesPerTrack?: number;
```

Above the category loop:

```ts
  // Borrowed fixes every lane's audio to one element, so a second lane of a one-sample category
  // would be byte-identical audio staggered in time — a different feature (§6.1). One lane, always.
  const laneCount = opts.sampleElement ? 1 : Math.max(1, opts.lanesPerTrack ?? 1);
```

Then replace the whole body of `for (const category of categories) { … }` with:

```ts
  for (const category of categories) {
    const cands = candidates.filter((r) => r.category === category);

    // Every lead is drawn before any lane is filled, which is what lets the draw be without
    // replacement. At laneCount 1 this is one rng call followed by the same per-section and sample
    // calls as before, so a one-lane draw is bit-for-bit today's draw.
    const leads = drawLeads(cands, rng, laneCount);
    const lanes: Lane[] = opts.sampleElement
      ? [{ ruleElement: null, audioElement: opts.sampleElement, lead: leads[0] }]
      : ELEMENTS.filter((e) => leads.some((l) => l.source.element === e)).map((e) => ({
        ruleElement: e,
        audioElement: e,
        lead: leads.find((l) => l.source.element === e)!,
      }));

    for (const lane of lanes) {
      const samples = manifest[lane.audioElement]?.[category] ?? [];
      if (samples.length === 0) {
        warnings.push(`${category}: no ${lane.audioElement} sample for the picked rule — track skipped`);
        continue;
      }

      // A lane is one element's rules — §3.4, scoped from a category down to a lane. Borrowed is the
      // exception it always was: the sample is fixed by hand, so the rules need no element at all.
      const forSections = lane.ruleElement
        ? cands.filter((r) => r.source.element === lane.ruleElement)
        : cands;

      const chosen: { rule: AuthoredRule; poolSize: number }[] = [];
      if (opts.section) {
        chosen.push({ rule: lane.lead, poolSize: cands.length });
      } else {
        for (const mode of SECTION_ORDER) {
          const inSection = forSections.filter((r) => r.section === mode);
          if (inSection.length === 0) continue; // absence is allowed — no repair
          chosen.push({
            rule: inSection[Math.floor(rng.float() * inSection.length)],
            poolSize: inSection.length,
          });
        }
      }

      const drawn = chosen
        .map((c) => ({ ...c, regions: rebase(c.rule, opts.section ? c.rule.sectionStartSec : 0, totalSec) }))
        .filter((c) => c.regions.length > 0);
      if (drawn.length === 0) {
        const from = [...new Set(chosen.map((c) => c.rule.source.element))].join('/');
        warnings.push(`${category}: the ${from} rule falls outside the module — that lane skipped`);
        continue;
      }

      const sample = samples[Math.floor(rng.float() * samples.length)];
      const track: ArrTrack = {
        id: `${category}·${lane.audioElement}`,
        category,
        label: `${drawn[0].rule.variant ?? category} · ${titleCase(lane.audioElement)}`,
        sample: { name: sample.name, path: sample.path, bytes: sample.bytes },
        ceilingDb: config.audio.volume.defaultTrackDb,
        locked: false,
      };
      tracks.push(track);
      for (const c of drawn) {
        picks.push({ track, rule: c.rule, poolSize: c.poolSize });
        for (const r of c.regions) regions.push({ ...r, trackId: track.id });
      }
    }
  }
```

Note the two behaviour-preserving details: the old `audioElement` local is gone (each lane carries its own), and the section draw still reports `poolSize: cands.length`, exactly as before.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run
npx tsc --noEmit
```

Expected: PASS. The `is byte-identical to today` test is the one that matters most — if it fails, the RNG order changed and every existing seed assertion is now meaningless.

- [ ] **Step 5: Commit**

```bash
git add src/remix/generateRemix.ts src/remix/generateRemix.test.ts
git commit -m "feat(remix): lanesPerTrack — a category may sound several elements at once"
```

---

## Task 4: Collapse the missing-sample warning per category

WATER and ETHER author `ELEMENT_SUB` rules but ship no `ELEMENT_SUB` samples (§3.6). Under layering that is two skipped lanes rather than one occasionally-skipped track, and a warning per lane would make the panel noisier without saying anything new.

The warning is kept even when other lanes of the category survived — it is the only thing explaining why a chip you can see never produces a lane.

**Files:**
- Modify: `src/remix/generateRemix.ts` (the missing-sample branch)
- Test: `src/remix/generateRemix.test.ts`

**Interfaces:**
- Consumes: the `Lane` loop from Task 3
- Produces: warning text `` `${category}: no ${elements.join(', ')} sample — those lanes skipped` `` — one per category, elements in `ELEMENTS` order. The existing `toContain('MELODY')` / `toContain('EARTH')` / `not.toContain('WATER')` assertions in the suite are all satisfied by this format; do not restate them.

- [ ] **Step 1: Write the failing test**

Add to the `describe('generateRemix — layered lanes', …)` block:

```ts
  it('collapses missing samples into one warning naming every skipped element', () => {
    // WATER and ETHER author ELEMENT_SUB but ship no sample for it — the real §3.6 gap.
    const pool = [
      rule('ELEMENT_SUB', 'WATER'), rule('ELEMENT_SUB', 'ETHER'), rule('ELEMENT_SUB', 'EARTH'),
    ];
    const { tracks, warnings } = generateRemix(
      pool,
      fakeManifest({ WATER: ['ELEMENT_SUB'], ETHER: ['ELEMENT_SUB'] }),
      { ...BASE, lanesPerTrack: 3 },
    );
    expect(tracks.map((t) => t.id)).toEqual(['ELEMENT_SUB·EARTH']); // EARTH's lane survived
    expect(warnings).toEqual(['ELEMENT_SUB: no WATER, ETHER sample — those lanes skipped']);
  });
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npx vitest run src/remix/generateRemix.test.ts -t 'collapses missing samples'
```

Expected: FAIL — two separate `…for the picked rule — track skipped` warnings.

- [ ] **Step 3: Write the implementation**

In `src/remix/generateRemix.ts`, declare a collector at the top of the category body, just after `const cands = …`:

```ts
    /** Lane elements this category could not sound. Collected rather than warned per lane: under
     *  layering the same §3.6 gap would otherwise be reported once per element (§7.3). */
    const noSample: ElementName[] = [];
```

Replace the missing-sample branch inside the lane loop:

```ts
      if (samples.length === 0) {
        noSample.push(lane.audioElement);
        continue;
      }
```

And emit once, immediately after the `for (const lane of lanes)` loop closes but still inside the category loop:

```ts
    if (noSample.length > 0) {
      warnings.push(`${category}: no ${noSample.join(', ')} sample — those lanes skipped`);
    }
```

`lanes` is already in `ELEMENTS` order, so `noSample` is too.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run
npx tsc --noEmit
```

Expected: PASS. Three pre-existing tests assert on this warning's text (`skips a picked rule whose element has no sample…`, `warns with the sample element…`, and useRemix's `surfaces parser warnings and generator warnings together`) — all use `toContain`, and all still hold.

- [ ] **Step 5: Commit**

```bash
git add src/remix/generateRemix.ts src/remix/generateRemix.test.ts
git commit -m "feat(remix): one missing-sample warning per category, naming the skipped lanes"
```

---

## Task 5: `pins.ts` and the key-uniqueness guard

The whole pinning design rests on one assumption: `sessionId|track|section` identifies a rule uniquely across the pool. If two rules shared a key, a pin would be unable to tell two timings apart. The design flags this as an assumption and asks for a test — this task writes the keys and the guard, with no behaviour attached yet.

Test only against the real shipped sessions, the way `loadSessions.test.ts` already does.

**Files:**
- Create: `src/remix/pins.ts`
- Create: `src/remix/pins.test.ts`

**Interfaces:**
- Consumes: `AuthoredRule` from `./sessionRules`, `loadSessions` from `./loadSessions`
- Produces — used by Tasks 6, 7 and 8:
  ```ts
  export const ruleKey = (r: AuthoredRule) => string;                 // `${sessionId}|${track}|${section}`
  export const slotKey = (r: AuthoredRule) => string;                 // `${category}|${element}|${section}`
  export const slotKeyFor = (category: Category, element: ElementName, section: Mode) => string;
  export type Pins = Record<string, string>;                          // slotKey → ruleKey
  ```

- [ ] **Step 1: Write the failing test**

Create `src/remix/pins.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { loadSessions } from './loadSessions';
import { ruleKey, slotKey, slotKeyFor } from './pins';
import type { AuthoredRule } from './sessionRules';

const pool: AuthoredRule[] = Object.values(
  loadSessions(path.join(process.cwd(), 'config', 'sessions')).store,
).flatMap((docs) => docs.flatMap((d) => d.rules));

describe('ruleKey', () => {
  it('has something to check', () => {
    expect(pool.length).toBeGreaterThan(50); // guard the guard: an empty pool proves nothing
  });

  it('is unique across the whole shipped pool', () => {
    // A pin is a ruleKey. Two rules sharing one would be indistinguishable to it, and pinning either
    // would silently address the other. §2.4 merges repeated rows for one layer within a section,
    // and source.track keeps `MELODY 2` apart from `SUB MELODY` — this asserts that actually holds.
    const seen = new Map<string, AuthoredRule[]>();
    for (const r of pool) {
      const k = ruleKey(r);
      seen.set(k, [...(seen.get(k) ?? []), r]);
    }
    const collisions = [...seen.entries()]
      .filter(([, rs]) => rs.length > 1)
      .map(([k, rs]) => `${k} ×${rs.length}`);
    expect(collisions).toEqual([]);
  });

  it('survives a rebuild of the rule objects, which object identity does not', () => {
    // refetch() reparses the store, so every rule is a new object. A pin held by reference dies
    // there; a pin held by content does not.
    const rebuilt = pool.map((r) => structuredClone(r));
    expect(rebuilt.map(ruleKey)).toEqual(pool.map(ruleKey));
    expect(rebuilt[0]).not.toBe(pool[0]);
  });
});

describe('slotKey', () => {
  it('names the lane and the section a pin fills', () => {
    const r = pool.find((x) => x.category === 'NOISE')!;
    expect(slotKey(r)).toBe(`NOISE|${r.source.element}|${r.section}`);
    expect(slotKeyFor(r.category, r.source.element, r.section)).toBe(slotKey(r));
  });

  it('is deliberately NOT unique — a slot is what several candidates compete for', () => {
    // Several rules of one element+section+category is the normal case; choosing between them is
    // exactly what a pin does. If this ever became unique, pinning would have nothing to decide.
    const counts = new Map<string, number>();
    for (const r of pool) counts.set(slotKey(r), (counts.get(slotKey(r)) ?? 0) + 1);
    expect([...counts.values()].some((n) => n > 1)).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npx vitest run src/remix/pins.test.ts
```

Expected: FAIL — `Cannot find module './pins'`.

- [ ] **Step 3: Write the implementation**

Create `src/remix/pins.ts`:

```ts
import type { Category, ElementName } from '@/types';
import type { Mode } from '@/arrange/types';
import type { AuthoredRule } from './sessionRules';

/** Identifies a rule by CONTENT. `AuthoredRule` has no id, and `refetch()` rebuilds every rule
 *  object, so a pin held by object identity would not survive one upload. Asserted unique across the
 *  shipped pool in pins.test.ts — a collision would make two timings indistinguishable to a pin. */
export const ruleKey = (r: AuthoredRule): string =>
  `${r.source.sessionId}|${r.source.track}|${r.section}`;

/** The slot a pin fills: one lane (category × element) and one of its sections. Deliberately not
 *  unique per rule — several candidates compete for a slot, and picking one is what a pin is. */
export const slotKey = (r: AuthoredRule): string =>
  `${r.category}|${r.source.element}|${r.section}`;

/** `slotKey` from its parts, for callers that hold a lane rather than a rule. */
export const slotKeyFor = (category: Category, element: ElementName, section: Mode): string =>
  `${category}|${element}|${section}`;

/** slotKey → ruleKey. A pin whose ruleKey no longer resolves — the session was edited or removed —
 *  is dropped silently by whoever reads it. */
export type Pins = Record<string, string>;
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run src/remix/pins.test.ts
npx tsc --noEmit
```

Expected: PASS, 5 tests.

⚠️ If `is unique across the whole shipped pool` **fails**, stop and report before continuing. A real collision invalidates the pin key and Task 6 needs a different one (adding the phrase list, or a pool index, to the key) — that is a design decision, not a fix to improvise.

- [ ] **Step 5: Commit**

```bash
git add src/remix/pins.ts src/remix/pins.test.ts
git commit -m "test(remix): rule keys are unique across the shipped pool, so a pin can name one"
```

---

## Task 6: Pins in the generator

A pinned slot is not drawn — it takes the pinned rule. A pin also *creates* a lane the draw would not have made, and may push a category past `lanesPerTrack` (up to the five real elements).

**Files:**
- Modify: `src/remix/generateRemix.ts`
- Test: `src/remix/generateRemix.test.ts`

**Interfaces:**
- Consumes: `ruleKey`, `slotKey`, `Pins` from `./pins`; the `Lane` loop from Task 3
- Produces: `generateRemix` gains `opts.pins?: Pins`. A pin applies when its rule is present in the mode-and-section-filtered candidate list; it is ignored entirely when `opts.sampleElement` is set. Determinism (§3.9) becomes: same pool + manifest + seed + opts + **pins** ⇒ the same draw.

- [ ] **Step 1: Write the failing tests**

Add a new `describe` at the end of `src/remix/generateRemix.test.ts`:

```ts
describe('generateRemix — pinned timings', () => {
  const BASE = { seed: 1, sessionSec: 1800 };

  const introEarth = rule('MELODY', 'EARTH', [ph(0, 100)], undefined, 'INTRODUCTION', 0);
  const introEarth2 = rule('MELODY', 'EARTH', [ph(0, 200)], undefined, 'INTRODUCTION', 0);
  const introWater = rule('MELODY', 'WATER', [ph(0, 300)], undefined, 'INTRODUCTION', 0);

  // The two EARTH intro rules must be distinguishable by ruleKey, which means distinct source.track.
  introEarth.source = { element: 'EARTH', sessionId: 'e1', track: 'MELODY' };
  introEarth2.source = { element: 'EARTH', sessionId: 'e1', track: 'MELODY 2' };
  introWater.source = { element: 'WATER', sessionId: 'w1', track: 'MELODY' };

  const pinning = (r: AuthoredRule) => ({ [slotKey(r)]: ruleKey(r) });

  it('takes the pinned rule for that slot instead of drawing one', () => {
    const pool = [introEarth, introEarth2];
    for (let seed = 1; seed <= 10; seed++) {
      const { picks } = generateRemix(pool, fakeManifest(), {
        ...BASE, seed, pins: pinning(introEarth2),
      });
      expect(picks.map((p) => p.rule)).toEqual([introEarth2]);
    }
  });

  it('creates a lane the draw would not have made', () => {
    // lanesPerTrack 1 with a WATER-heavy pool: EARTH usually loses, but a pin gives it a lane anyway.
    const pool = [introWater, introWater, introWater, introEarth];
    const { tracks } = generateRemix(pool, fakeManifest(), {
      ...BASE, lanesPerTrack: 1, pins: pinning(introEarth),
    });
    expect(tracks.map((t) => t.id)).toContain('MELODY·EARTH');
  });

  it('may push a category past lanesPerTrack', () => {
    const pool = [introEarth, introWater, rule('MELODY', 'FIRE')];
    const { tracks } = generateRemix(pool, fakeManifest(), {
      ...BASE, lanesPerTrack: 1, pins: { ...pinning(introEarth), ...pinning(introWater) },
    });
    expect(tracks.length).toBeGreaterThanOrEqual(2);
    expect(tracks.map((t) => t.id)).toEqual(expect.arrayContaining(['MELODY·EARTH', 'MELODY·WATER']));
  });

  it('drops a pin whose rule is no longer in the pool, and draws that slot', () => {
    const { picks, tracks } = generateRemix([introWater], fakeManifest(), {
      ...BASE, pins: pinning(introEarth), // introEarth is not in this pool
    });
    expect(tracks.map((t) => t.id)).toEqual(['MELODY·WATER']);
    expect(picks.map((p) => p.rule)).toEqual([introWater]);
  });

  it('ignores a pin the current scope filters out', () => {
    // Scoped to WATER, an EARTH pin must not conjure an EARTH lane — the mode says EARTH is not
    // drawable, and a pin is a choice among drawable candidates, not an override of the scope.
    const pool = [introEarth, introWater];
    const { tracks } = generateRemix(pool, fakeManifest(), {
      ...BASE, element: 'WATER', pins: pinning(introEarth),
    });
    expect(tracks.map((t) => t.id)).toEqual(['MELODY·WATER']);
  });

  it('ignores pins in Borrowed, where no slotKey can name a lane (§6.1)', () => {
    const pool = [introEarth, introEarth2];
    const withPin = generateRemix(pool, fakeManifest(), {
      ...BASE, sampleElement: 'FIRE', pins: pinning(introEarth2),
    });
    const without = generateRemix(pool, fakeManifest(), { ...BASE, sampleElement: 'FIRE' });
    expect(withPin).toEqual(without);
  });

  it('rerolls only the unpinned slots when the seed advances', () => {
    const pinnedIntro = rule('NOISE', 'EARTH', [ph(0, 600)], undefined, 'INTRODUCTION', 0);
    pinnedIntro.source = { element: 'EARTH', sessionId: 'e1', track: 'NOISE' };
    const pool = [
      pinnedIntro,
      rule('NOISE', 'EARTH', [ph(0, 300)], undefined, 'INTRODUCTION', 0),
      rule('NOISE', 'EARTH', [ph(600, 1200)], undefined, 'DEEP_RELAXATION', 600),
      rule('NOISE', 'EARTH', [ph(700, 1200)], undefined, 'DEEP_RELAXATION', 600),
    ];
    const pins = pinning(pinnedIntro);
    const intros = new Set<number>();
    const deeps = new Set<number>();
    for (let seed = 1; seed <= 20; seed++) {
      const { picks } = generateRemix(pool, fakeManifest(), { ...BASE, seed, pins });
      intros.add(picks.find((p) => p.rule.section === 'INTRODUCTION')!.rule.phrases[0].exitSec);
      deeps.add(picks.find((p) => p.rule.section === 'DEEP_RELAXATION')!.rule.phrases[0].enterSec);
    }
    expect([...intros]).toEqual([600]); // pinned: never rerolled
    expect(deeps.size).toBeGreaterThan(1); // unpinned: rerolled
  });

  it('stays deterministic with pins as an input', () => {
    const pool = [introEarth, introEarth2, introWater];
    const pins = pinning(introEarth2);
    const manifest = fakeManifest();
    expect(generateRemix(pool, manifest, { ...BASE, seed: 5, lanesPerTrack: 2, pins }))
      .toEqual(generateRemix(pool, manifest, { ...BASE, seed: 5, lanesPerTrack: 2, pins }));
  });
});
```

Add the import at the top of the test file:

```ts
import { ruleKey, slotKey } from './pins';
```

- [ ] **Step 2: Run them to verify they fail**

```bash
npx vitest run src/remix/generateRemix.test.ts -t 'pinned timings'
```

Expected: FAIL — `pins` is not in the options type (`tsc` will flag it too), and the pinned rule is not honoured.

- [ ] **Step 3: Write the implementation**

Import in `src/remix/generateRemix.ts`:

```ts
import { ruleKey, slotKey, type Pins } from './pins';
```

Add to the options type:

```ts
    /** slotKey → ruleKey. A pinned slot is taken, not drawn; a pin may also create a lane. */
    pins?: Pins;
```

Below the `laneCount` line:

```ts
  // A slotKey names a lane by its element. A borrowed lane has no rule-element — its rules come from
  // everywhere — so no slotKey can address one, and pins simply do not apply there (§6.1).
  const pins: Pins = opts.sampleElement ? {} : (opts.pins ?? {});
  /** The pinned rule among these candidates, if one is pinned. Content-keyed, so it survives a
   *  refetch; searched within `cands`, so a pin the current scope filters out simply never matches. */
  const pinnedIn = (rules: AuthoredRule[]): AuthoredRule | undefined =>
    rules.find((r) => pins[slotKey(r)] === ruleKey(r));
```

In the category body, extend the lane set with pinned lanes. Replace the `const lanes: Lane[] = …` expression with:

```ts
    const lanes: Lane[] = opts.sampleElement
      ? [{ ruleElement: null, audioElement: opts.sampleElement, lead: leads[0] }]
      : (() => {
        const byElement = new Map<ElementName, AuthoredRule>();
        for (const l of leads) if (!byElement.has(l.source.element)) byElement.set(l.source.element, l);
        // A pin names a lane the draw need not have created, and may take the category past
        // lanesPerTrack — up to the five real elements (§7.1).
        for (const r of cands) {
          if (byElement.has(r.source.element)) continue;
          if (pins[slotKey(r)] === ruleKey(r)) byElement.set(r.source.element, r);
        }
        return ELEMENTS.filter((e) => byElement.has(e)).map((e) => ({
          ruleElement: e,
          audioElement: e,
          lead: byElement.get(e)!,
        }));
      })();
```

Then honour pins in the two draw branches:

```ts
      const chosen: { rule: AuthoredRule; poolSize: number }[] = [];
      if (opts.section) {
        chosen.push({ rule: pinnedIn(forSections) ?? lane.lead, poolSize: cands.length });
      } else {
        for (const mode of SECTION_ORDER) {
          const inSection = forSections.filter((r) => r.section === mode);
          if (inSection.length === 0) continue; // absence is allowed — no repair
          const pinned = pinnedIn(inSection);
          chosen.push({
            // A pinned slot consumes no rng at all — that is what makes Regenerate reroll the rest
            // around it rather than shifting the whole stream.
            rule: pinned ?? inSection[Math.floor(rng.float() * inSection.length)],
            poolSize: inSection.length,
          });
        }
      }
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run
npx tsc --noEmit
```

Expected: PASS. Every pre-existing test passes an `opts` with no `pins`, so `pinnedIn` never matches and the draw is unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/remix/generateRemix.ts src/remix/generateRemix.test.ts
git commit -m "feat(remix): pinned slots are taken, not drawn — and a pin can create a lane"
```

---

## Task 7: `useRemix` — the Layered mode, lanes and pins state

**Files:**
- Modify: `src/components/remix/useRemix.ts`
- Test: `src/components/remix/useRemix.test.ts`

**Interfaces:**
- Consumes: `generateRemix` with `lanesPerTrack` and `pins`; `ruleKey`/`slotKey`/`Pins` from `@/remix/pins`
- Produces — the API Task 9 wires up:
  ```ts
  export type RemixMode = 'scoped' | 'cross' | 'borrowed' | 'layered';

  interface RemixState {
    // …everything it has today, plus:
    lanesPerTrack: number;                       // 1–3, default 2; only in effect in `layered`
    setLanesPerTrack: (n: number) => void;
    pins: Pins;                                  // slotKey → ruleKey
    togglePin: (rule: AuthoredRule) => void;     // pin, repoint the slot, or unpin — see §5.1
  }
  ```

- [ ] **Step 1: Write the failing tests**

Add to `src/components/remix/useRemix.test.ts`. The existing `STORE` gives MELODY two elements (WATER and FIRE), which is exactly what layering needs.

```ts
describe('useRemix — layered lanes', () => {
  it('draws one lane per element for a category in layered mode', async () => {
    const { result } = renderHook(() => useRemix());
    await waitFor(() => expect(result.current.tracks).toHaveLength(3));

    act(() => result.current.setMode('layered'));

    // MELODY is authored by WATER and FIRE, so it gains a second lane; PAD and BASS only by FIRE.
    expect(result.current.tracks.filter((t) => t.category === 'MELODY')).toHaveLength(2);
    expect(result.current.tracks.map((t) => t.id).sort())
      .toEqual(['BASS·FIRE', 'MELODY·FIRE', 'MELODY·WATER', 'PAD·FIRE']);
  });

  it('defaults to two lanes and honours a change', async () => {
    const { result } = renderHook(() => useRemix());
    await waitFor(() => expect(result.current.tracks).toHaveLength(3));
    expect(result.current.lanesPerTrack).toBe(2);

    act(() => result.current.setMode('layered'));
    act(() => result.current.setLanesPerTrack(1));

    expect(result.current.tracks.filter((t) => t.category === 'MELODY')).toHaveLength(1);
  });

  it('leaves the other modes on one lane whatever lanesPerTrack says', async () => {
    const { result } = renderHook(() => useRemix());
    await waitFor(() => expect(result.current.tracks).toHaveLength(3));

    act(() => result.current.setLanesPerTrack(3));

    expect(result.current.mode).toBe('cross');
    expect(result.current.tracks).toHaveLength(3);
  });
});

describe('useRemix — pins', () => {
  const melodyOf = (s: RemixState, element: string) =>
    s.candidatesFor('MELODY').find((r) => r.source.element === element)!;

  it('pins a rule and holds it across Regenerate', async () => {
    const { result } = renderHook(() => useRemix());
    await waitFor(() => expect(result.current.tracks).toHaveLength(3));

    const water = melodyOf(result.current, 'WATER');
    act(() => result.current.togglePin(water));

    for (let i = 0; i < 20; i++) {
      act(() => result.current.regenerate());
      const melody = result.current.picks.filter((p) => p.track.category === 'MELODY');
      expect(melody.some((p) => p.rule.source.element === 'WATER')).toBe(true);
    }
  });

  it('unpins when the same rule is clicked again', async () => {
    const { result } = renderHook(() => useRemix());
    await waitFor(() => expect(result.current.tracks).toHaveLength(3));

    const water = melodyOf(result.current, 'WATER');
    act(() => result.current.togglePin(water));
    expect(Object.keys(result.current.pins)).toHaveLength(1);

    act(() => result.current.togglePin(water));
    expect(result.current.pins).toEqual({});
  });

  it('repoints a slot rather than stacking, when another rule of the same slot is pinned', async () => {
    const { result } = renderHook(() => useRemix());
    await waitFor(() => expect(result.current.tracks).toHaveLength(3));

    const water = melodyOf(result.current, 'WATER');
    const fire = melodyOf(result.current, 'FIRE');
    act(() => result.current.togglePin(water));
    act(() => result.current.togglePin(fire));

    // Different elements ⇒ different slots ⇒ two lanes, not a replacement.
    expect(Object.keys(result.current.pins)).toHaveLength(2);
  });

  it('keeps pins across a mode change, inert where they do not apply', async () => {
    const { result } = renderHook(() => useRemix());
    await waitFor(() => expect(result.current.tracks).toHaveLength(3));

    const water = melodyOf(result.current, 'WATER');
    act(() => result.current.togglePin(water));

    act(() => result.current.setMode('borrowed'));
    act(() => result.current.setElement('EARTH'));
    expect(result.current.pins).not.toEqual({}); // retained…
    expect(result.current.tracks.every((t) => t.sample.name.startsWith('EARTH-'))).toBe(true);

    act(() => result.current.setMode('cross'));
    expect(result.current.picks.some((p) => p.rule.source.element === 'WATER')).toBe(true); // …and back
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

```bash
npx vitest run src/components/remix/useRemix.test.ts
```

Expected: FAIL — `lanesPerTrack`, `setLanesPerTrack`, `pins`, `togglePin` are not on `RemixState`.

- [ ] **Step 3: Write the implementation**

In `src/components/remix/useRemix.ts`:

```ts
import { ruleKey, slotKey, type Pins } from '@/remix/pins';
```

Widen the mode union and its doc comment:

```ts
/** `cross` draws every track from the whole authored pool; `scoped` from one element's rules only;
 *  `borrowed` draws timings from every element but plays them all through one element's samples;
 *  `layered` is `cross` with the draw taking SEVERAL elements per category, each its own lane. */
export type RemixMode = 'scoped' | 'cross' | 'borrowed' | 'layered';
```

Add to `RemixState`:

```ts
  /** How many elements a category's draw may take, in `layered`. Every other mode is one lane. */
  lanesPerTrack: number;
  setLanesPerTrack: (n: number) => void;
  /** slotKey → ruleKey — the slots you chose by hand, which Regenerate leaves alone. */
  pins: Pins;
  /** Pin this rule into its slot, or unpin it if it is already the pin there (§5.1). */
  togglePin: (rule: AuthoredRule) => void;
```

New state, beside the others:

```ts
  const [lanesPerTrack, setLanesPerTrack] = useState(2);
  const [pins, setPins] = useState<Pins>({});
```

Below the `scopedTo` / `sampleElement` lines:

```ts
  // Layering is the only mode that takes more than one lane: Scoped is one element by definition,
  // and Borrowed is capped at one because the extra lanes would be the same file staggered (§6.1).
  const lanes = mode === 'layered' ? lanesPerTrack : 1;
```

`scopedTo` stays `mode === 'scoped' ? element : undefined` — layered draws from the whole pool, exactly like cross.

Extend the draw memo and its deps:

```ts
  const draw = useMemo(
    () => generateRemix(pool, manifest, {
      seed,
      element: scopedTo,
      sampleElement,
      section: section ?? undefined,
      sessionSec: sessionMin * 60,
      lanesPerTrack: lanes,
      pins,
    }),
    // `pins` is an input to the draw, not a decoration on it — §3.9's determinism now includes it.
    [pool, seed, scopedTo, sampleElement, section, sessionMin, lanes, pins],
  );
```

The toggle, beside `candidatesFor`:

```ts
  // One gesture, three outcomes (§5.1): a fresh slot is pinned, a slot pinned to another rule is
  // repointed, and clicking the current pin clears it. Keyed by content so it survives refetch().
  const togglePin = useCallback((rule: AuthoredRule) => {
    setPins((prev) => {
      const slot = slotKey(rule);
      const key = ruleKey(rule);
      if (prev[slot] === key) {
        const next = { ...prev };
        delete next[slot];
        return next;
      }
      return { ...prev, [slot]: key };
    });
  }, []);
```

And in the returned object:

```ts
    lanesPerTrack,
    setLanesPerTrack,
    pins,
    togglePin,
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/remix/useRemix.ts src/components/remix/useRemix.test.ts
git commit -m "feat(remix): useRemix gains layered mode, lanesPerTrack and pins"
```

---

## Task 8: `TrackPoolRow` — one row per category, clickable chips

Two changes in one component. The row's subject becomes the **category** rather than a track, because a category with two lanes would otherwise render two identical chip rows — and filtering each row to its own lane's element would hide exactly the chips §5.1 needs you to click to create a lane.

Chips become buttons where they are operable, and gain a third state: filled + ring means *you* pinned it, filled alone means the generator drew it.

**Files:**
- Modify: `src/components/remix/TrackPoolRow.tsx`
- Test: `src/components/remix/TrackPoolRow.test.tsx`

**Interfaces:**
- Consumes: `Pins`, `ruleKey`, `slotKey` from `@/remix/pins`
- Produces:
  ```tsx
  export function TrackPoolRow(props: {
    category: Category;                        // was `track: ArrTrack`
    candidates: AuthoredRule[];
    picked: ReadonlySet<AuthoredRule>;
    pins?: Pins;
    onPick?: (rule: AuthoredRule) => void;     // omitted ⇒ inert spans, keeping `cursor-help`
  }): JSX.Element
  ```

- [ ] **Step 1: Write the failing tests**

Replace the `track` constant at the top of `src/components/remix/TrackPoolRow.test.tsx` — it is no longer a prop — and update every `render` call from `track={track}` to `category="MELODY"`. Then add:

Replace the file's first two import lines with these four:

```ts
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ruleKey, slotKey } from '@/remix/pins';
```

(`vi` and `within` are the additions; `userEvent` and the pins helpers are new imports.)

```tsx
describe('TrackPoolRow — clicking a chip', () => {
  const r = () => rule([{ enterSec: 0, exitSec: 60, fadeInSec: 0, fadeOutSec: 0 }]);

  it('is inert with no onPick — a chip stays a hint, not a control', () => {
    render(<TrackPoolRow category="MELODY" candidates={[r()]} picked={new Set()} />);
    expect(screen.queryByRole('button', { name: 'Water·I' })).toBeNull();
    expect(screen.getByText('Water·I').className).toContain('cursor-help');
  });

  it('is a button when it can be picked', async () => {
    const onPick = vi.fn();
    const candidate = r();
    render(<TrackPoolRow category="MELODY" candidates={[candidate]} picked={new Set()} onPick={onPick} />);

    const chip = screen.getByRole('button', { name: 'Water·I' });
    expect(chip.className).toContain('cursor-pointer');
    await userEvent.click(chip);

    expect(onPick).toHaveBeenCalledWith(candidate);
  });

  it('rings a pinned chip, so yours is not confused with the generator’s', () => {
    const drawn = rule([{ enterSec: 0, exitSec: 60, fadeInSec: 0, fadeOutSec: 0 }], 'INTRODUCTION');
    const mine = rule([{ enterSec: 1200, exitSec: 1800, fadeInSec: 0, fadeOutSec: 0 }], 'RETURN');
    const plain = rule([{ enterSec: 600, exitSec: 1200, fadeInSec: 0, fadeOutSec: 0 }], 'DEEP_RELAXATION');
    render(
      <TrackPoolRow
        category="MELODY"
        candidates={[drawn, plain, mine]}
        picked={new Set([drawn, mine])}
        pins={{ [slotKey(mine)]: ruleKey(mine) }}
        onPick={() => {}}
      />,
    );
    const cls = (text: string) => screen.getByRole('button', { name: text }).className;
    expect(cls('Water·I')).toContain('bg-[var(--accent-ink)]');   // drawn: filled
    expect(cls('Water·I')).not.toContain('ring-2');
    expect(cls('Water·Rt')).toContain('ring-2');                  // pinned: filled + ring
    expect(cls('Water·Rx')).not.toContain('bg-[var(--accent-ink)]'); // neither: outline
  });

  it('marks the pinned chip pressed, so the state is not colour-only', () => {
    const mine = r();
    render(
      <TrackPoolRow
        category="MELODY"
        candidates={[mine]}
        picked={new Set()}
        pins={{ [slotKey(mine)]: ruleKey(mine) }}
        onPick={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: 'Water·I' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('names the category it is the pool for, and is addressable by it', () => {
    // The testid is how RemixView's tests scope a chip query to one row — `Fire·I` appears in every
    // row FIRE authored, so an unscoped getByRole would match several buttons and throw.
    render(<TrackPoolRow category="MELODY" candidates={[r()]} picked={new Set()} />);
    const row = screen.getByTestId('pool-MELODY');
    expect(row).toHaveTextContent('MELODY');
    expect(within(row).getByText('Water·I')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

```bash
npx vitest run src/components/remix/TrackPoolRow.test.tsx
```

Expected: FAIL — `category` is not a prop, and no chip is a button.

- [ ] **Step 3: Write the implementation**

Rewrite the component's export in `src/components/remix/TrackPoolRow.tsx` (the `SECTION_ABBR`, `SECTION_LABEL`, `titleCase`, `chip`, `clock` and `chipTitle` helpers above it are unchanged):

```tsx
import type { Category } from '@/types';
import type { AuthoredRule } from '@/remix/sessionRules';
import { ruleKey, slotKey, type Pins } from '@/remix/pins';

/** One row of layout A: a CATEGORY's pool of authored candidates, and the count.
 *
 *  The row is per category, not per lane. A category may now hold several lanes, and one row each
 *  would repeat the same chips; narrowing a row to its lane's element would instead hide the very
 *  chips you click to create a second lane (§5.1). So: one row, every candidate, all lanes' picks
 *  lit — a chip already names the lane it addresses.
 *
 *  Three states (§5.2): outline = not picked, filled = drawn by the generator, filled + ring =
 *  pinned by you. Omit `onPick` and the chips stay inert hints, which is what Scoped and Borrowed
 *  want — neither has a per-element lane a click could address. */
export function TrackPoolRow({ category, candidates, picked, pins, onPick }: {
  category: Category;
  candidates: AuthoredRule[];
  picked: ReadonlySet<AuthoredRule>;
  pins?: Pins;
  onPick?: (rule: AuthoredRule) => void;
}) {
  return (
    <div
      data-testid={`pool-${category}`}
      className="grid grid-cols-[140px_1fr] items-center gap-3 border-t border-border py-2"
    >
      <div className="text-sm font-medium">
        {category}
        <span className="ml-1 text-xs text-muted-foreground">{candidates.length}</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {candidates.length === 0 ? (
          <span className="text-xs text-muted-foreground opacity-60">absent — no rule</span>
        ) : (
          candidates.map((c, i) => {
            const pinned = pins?.[slotKey(c)] === ruleKey(c);
            // data-element rebinds --accent-ink to that element's brand colour (globals.css), so a
            // picked chip and its bars on the timeline read as the same element.
            const shared = {
              title: chipTitle(c),
              'data-element': c.source.element.toLowerCase(),
              className: `rounded-full border px-2 py-0.5 text-xs ${
                onPick ? 'cursor-pointer' : 'cursor-help'
              } ${
                pinned || picked.has(c)
                  ? 'border-[var(--accent-ink)] bg-[var(--accent-ink)] text-white'
                  : 'border-border text-muted-foreground opacity-70'
              } ${pinned ? 'ring-2 ring-[var(--accent-ink)] ring-offset-1' : ''}`,
            };
            return onPick ? (
              <button key={i} type="button" aria-pressed={pinned} onClick={() => onPick(c)} {...shared}>
                {chip(c)}
              </button>
            ) : (
              <span key={i} {...shared}>{chip(c)}</span>
            );
          })
        )}
      </div>
    </div>
  );
}
```

Remove the now-unused `import type { ArrTrack } from '@/arrange/types';`.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run src/components/remix/TrackPoolRow.test.tsx
npx tsc --noEmit
```

Expected: `TrackPoolRow.test.tsx` PASS. `tsc` still fails on `RemixView.tsx`, which passes `track=` — that is Task 9.

- [ ] **Step 5: Commit**

```bash
git add src/components/remix/TrackPoolRow.tsx src/components/remix/TrackPoolRow.test.tsx
git commit -m "feat(remix): a pool row is per category, and its chips are clickable"
```

Note: `tsc` and the full suite are red between this commit and Task 9's — the two halves of one interface change. If that is unacceptable for the branch's history, squash Tasks 8 and 9 into one commit at the end of Task 9.

---

## Task 9: `RemixView` — the Layered pill, the lanes control, the wiring

**Files:**
- Modify: `src/components/remix/RemixView.tsx`
- Test: `src/components/remix/RemixView.test.tsx`

**Interfaces:**
- Consumes: `useRemix`'s `lanesPerTrack` / `setLanesPerTrack` / `pins` / `togglePin`; `TrackPoolRow`'s `category` / `pins` / `onPick`
- Produces: the finished UI. No new exports.

- [ ] **Step 1: Write the failing tests**

Add to `src/components/remix/RemixView.test.tsx`:

```tsx
describe('RemixView — layered lanes', () => {
  it('offers a fourth mode with a lanes control of its own', async () => {
    render(<RemixView />);
    await screen.findByTestId(laneRegion('PAD'));

    expect(screen.queryByLabelText(/lanes per track/i)).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Layered' }));

    expect(screen.getByRole('button', { name: 'Layered' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText(/lanes per track/i)).toHaveValue('2');
  });

  it('stacks two coloured lanes for a category two elements authored', async () => {
    const { container } = render(<RemixView />);
    await screen.findByTestId(laneRegion('PAD'));

    await userEvent.click(screen.getByRole('button', { name: 'Layered' }));

    // MELODY is authored by WATER and FIRE, so both lanes exist and each keeps its own colour.
    expect(screen.getByTestId('region-MELODY·WATER-0')).toBeInTheDocument();
    expect(screen.getByTestId('region-MELODY·FIRE-0')).toBeInTheDocument();
    const melodyBars = container.querySelectorAll('[data-testid^="region-MELODY·"]');
    expect(new Set([...melodyBars].map((b) => b.getAttribute('data-element'))))
      .toEqual(new Set(['water', 'fire']));
  });

  it('mutes one lane without touching its sibling', async () => {
    render(<RemixView />);
    await screen.findByTestId(laneRegion('PAD'));
    await userEvent.click(screen.getByRole('button', { name: 'Layered' }));

    await userEvent.click(screen.getByRole('button', { name: /Mute MELODY · Water/ }));
    await userEvent.click(screen.getByRole('button', { name: /Export WAV/ }));

    await waitFor(() => expect(exportCtl.lastArgs).not.toBeNull());
    expect(exportCtl.lastArgs!.tracks.map((t) => t.id)).not.toContain('MELODY·WATER');
    expect(exportCtl.lastArgs!.tracks.map((t) => t.id)).toContain('MELODY·FIRE');
  });

  it('honours the lanes control', async () => {
    render(<RemixView />);
    await screen.findByTestId(laneRegion('PAD'));
    await userEvent.click(screen.getByRole('button', { name: 'Layered' }));
    expect(screen.getAllByTestId(/^region-MELODY·/)).toHaveLength(2);

    await userEvent.selectOptions(screen.getByLabelText(/lanes per track/i), '1');

    // Each MELODY rule here has one phrase in one section, so lanes and regions count one for one.
    expect(screen.getAllByTestId(/^region-MELODY·/)).toHaveLength(1);
  });

  it('shows one pool row per category, not one per lane', async () => {
    render(<RemixView />);
    await screen.findByTestId(laneRegion('PAD'));
    await userEvent.click(screen.getByRole('button', { name: 'Layered' }));

    // Two MELODY lanes, but the pool of MELODY candidates is one thing and is listed once.
    expect(screen.getAllByTestId(/^region-MELODY·/)).toHaveLength(2);
    expect(screen.getAllByTestId('pool-MELODY')).toHaveLength(1);
  });
});

describe('RemixView — clicking a chip', () => {
  // FIRE authored MELODY, PAD and BASS, so `Fire·I` appears in more than one row — every chip query
  // is scoped to the row it belongs to, or getByRole matches several buttons and throws.
  const melodyChip = (name: string) =>
    within(screen.getByTestId('pool-MELODY')).getByRole('button', { name });

  it('pins a timing and holds it through Regenerate', async () => {
    render(<RemixView />);
    await screen.findByTestId(laneRegion('PAD'));

    await userEvent.click(melodyChip('Water·I'));
    expect(melodyChip('Water·I')).toHaveAttribute('aria-pressed', 'true');

    for (let i = 0; i < 10; i++) {
      await userEvent.click(screen.getByRole('button', { name: /Regenerate/ }));
      expect(screen.getByTestId('region-MELODY·WATER-0')).toBeInTheDocument();
    }
  });

  it('creates the lane for an element that had none', async () => {
    render(<RemixView />);
    await screen.findByTestId(laneRegion('PAD'));
    // Cross mode draws one MELODY lane; pinning BOTH elements' chips must produce two.
    expect(screen.getAllByTestId(/^region-MELODY·/)).toHaveLength(1);

    await userEvent.click(melodyChip('Water·I'));
    await userEvent.click(melodyChip('Fire·I'));

    expect(screen.getAllByTestId(/^region-MELODY·/)).toHaveLength(2);
  });

  it('unpins on a second click', async () => {
    render(<RemixView />);
    await screen.findByTestId(laneRegion('PAD'));

    await userEvent.click(melodyChip('Water·I'));
    await userEvent.click(melodyChip('Water·I'));

    expect(melodyChip('Water·I')).toHaveAttribute('aria-pressed', 'false');
  });

  it('leaves chips inert in Scoped and Borrowed', async () => {
    render(<RemixView />);
    await screen.findByTestId(laneRegion('PAD'));

    // Scope to WATER so there IS a Water·I chip to be inert — scoped to the EARTH default there are
    // no rules at all, and the assertion would pass for the wrong reason.
    await userEvent.click(screen.getByRole('button', { name: 'Scoped' }));
    await userEvent.click(screen.getByRole('button', { name: 'WATER' }));
    expect(screen.getByText('Water·I').tagName).toBe('SPAN');

    await userEvent.click(screen.getByRole('button', { name: 'Borrowed timings' }));
    expect(screen.getByText('Water·I').tagName).toBe('SPAN');
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

```bash
npx vitest run src/components/remix/RemixView.test.tsx
```

Expected: FAIL — no `Layered` button, and `TrackPoolRow` is still being handed a `track` prop.

- [ ] **Step 3: Write the implementation**

In `src/components/remix/RemixView.tsx`:

Add the mode and its hint:

```ts
const MODES: { value: RemixMode; label: string }[] = [
  { value: 'cross', label: 'Cross-element' },
  { value: 'scoped', label: 'Scoped' },
  { value: 'borrowed', label: 'Borrowed timings' },
  { value: 'layered', label: 'Layered' },
];
```

```ts
const HINT: Record<RemixMode, (el: ElementName) => string> = {
  cross: () => 'every track draws from the whole pool — its sample follows the element it picked',
  scoped: () => "every track draws from one element's rules, and that element's samples",
  borrowed: (el) => `every track plays ${el}'s samples, on timings drawn from every element`,
  layered: () => 'a category may sound several elements at once — click a chip to pin one',
};
```

Destructure the new hook fields:

```ts
  const {
    tracks, picks, regions, totalSec, warnings, loading,
    mode, element, section, candidatesFor, setMode, setElement, setSection, regenerate, refetch,
    lanesPerTrack, setLanesPerTrack, pins, togglePin,
  } = useRemix();
```

Add, beside `pickedRules`:

```ts
  // Chips address a lane by element, so they are only operable where lanes are per element. Scoped
  // is one element by definition and Borrowed has no rule-element at all (§6).
  const chipsClickable = mode === 'cross' || mode === 'layered';
  // Tracks arrive in STACK_ORDER, so unique-in-order keeps the pool rows in the same grammar.
  const categories = [...new Set(tracks.map((t) => t.category))];
```

Insert the lanes control immediately after the mode pill group's closing `</div>`:

```tsx
        {mode === 'layered' && (
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            Lanes per track
            <select
              value={lanesPerTrack}
              onChange={(e) => setLanesPerTrack(Number(e.target.value))}
              className="rounded border border-border bg-transparent px-1 py-0.5 text-xs"
            >
              {[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        )}
```

Replace the pool-row loop:

```tsx
          categories.map((c) => (
            <TrackPoolRow
              key={c}
              category={c}
              candidates={candidatesFor(c)}
              picked={pickedRules}
              pins={pins}
              onPick={chipsClickable ? togglePin : undefined}
            />
          ))
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run
npx tsc --noEmit
npx eslint src/remix src/components/remix
```

Expected: all PASS, no type errors, no lint errors. In particular `colours every bar by the sample element while chips keep their own` must still pass — its `.cursor-help[data-element]` selector holds because borrowed chips stay inert.

- [ ] **Step 5: Commit**

```bash
git add src/components/remix/RemixView.tsx src/components/remix/RemixView.test.tsx
git commit -m "feat(remix): a Layered pill, a lanes control, and chips you can pin"
```

---

## Task 10: Update the rules reference

`docs/remix-rules.md` is the reference the design revises. Six edits.

**Files:**
- Modify: `docs/remix-rules.md`

**Interfaces:**
- Consumes: the finished behaviour of Tasks 1–9
- Produces: documentation only

- [ ] **Step 1: §3 mode table — add Layered**

In the table under `## 3. Choosing what plays`, after the Borrowed timings row:

```markdown
| **Layered**(n) | the whole pool, and up to **n elements per category** — each its own lane |
```

- [ ] **Step 2: §3.1 — one lane per category *per element***

Replace §3.1 entirely:

```markdown
**3.1 — One lane per category, per element.** `id = category·ELEMENT` — `MELODY·FIRE` — so a
category may hold several lanes, one per element the draw or your pins gave it. The id carries the
element even when there is only one lane: an id that changed shape when a sibling appeared would
lose that lane's mute state and make the engine reload it mid-session. `MELODY 2` and `SUB MELODY`
still collapse onto the `MELODY` category; the picked variant and the element become the lane's
**label** (`MELODY 2 · Fire`).

Two lanes are two `trackId`s, so overlapping timings **layer** — each lane is its own voice, and
there is nothing to resolve. Within one lane §3.2 still yields at most one rule per section and a
rule's phrases do not overlap themselves, so `regionAt`'s first-match resolution is never reached.
```

- [ ] **Step 3: §3.4 — scope it to a lane**

Change the heading line and add the closing note:

```markdown
**3.4 — Every rule of a **lane** comes from one element — *unless the sample is fixed*.**
```

and at the end of §3.4, after the Borrowed paragraph:

```markdown
Layering does not repeal this rule — it scopes it down from a category to a lane. Cross-element
mixing still never happens inside a lane; it now happens across the lanes of one category as well as
across categories.
```

- [ ] **Step 4: §3.6 — the collapsed warning**

Append to §3.6:

```markdown
**Under layering the warning is collapsed per category**, naming every element skipped —
`ELEMENT_SUB: no WATER, ETHER sample — those lanes skipped` — rather than repeating itself once per
lane. It is kept even when other lanes of the category survived, because it is the only thing
explaining why a chip you can see never produces a lane.
```

- [ ] **Step 5: §3.9 — pins join the determinism inputs**

```markdown
**3.9 — Deterministic.** Same pool + manifest + seed + element + section + lanes + **pins** ⇒ the
same draw. Regenerate advances the seed, which rerolls every slot **except** the pinned ones — a
pinned slot consumes no randomness at all, which is what lets the rest reroll around it. Seeds are
meaningful only within one mode: the modes consume the stream differently, so no seed reproduces
another mode's draw.
```

- [ ] **Step 6: §7 — the three chip states**

Replace the first bullet of `## 7. What the UI shows`:

```markdown
- **Chips** list the candidates the current scope could draw from — element **and** section
  filtered, so a chip on screen is always one the draw could have picked. One row per **category**,
  not per lane: a category's pool is one thing, and a chip already names the lane it addresses.
  Three states: **outline** = not picked, **filled** = drawn by the generator, **filled + ring** =
  pinned by you.
```

- [ ] **Step 7: Add §9, and renumber**

Insert before `## 8. Deliberately not done`, renaming that section to `## 9. Deliberately not done`:

```markdown
## 8. Clicking a chip

A chip carries both things a lane needs — its element and its section — so clicking one has an
unambiguous destination, and no modifier keys or add/replace controls are needed.

| you click | result |
|---|---|
| a chip whose element has **no lane** in that category | the lane is created, pinned with that rule |
| a chip whose element **has a lane** | that lane's section slot is set to this rule, and pinned |
| a chip **you already pinned** | unpinned — the slot reverts to the draw |

A click only ever addresses its own element's lane, so it can never delete another element's pick.

Pins are stored as `slotKey → ruleKey`, both derived from rule **content** (`category|element|section`
and `sessionId|track|section`) rather than object identity — `refetch()` rebuilds every rule object,
and a pin held by reference would not survive one upload. A pin whose rule no longer resolves is
dropped silently and that slot is drawn as usual.

A pin may create a lane the draw would not have made, and may take a category past its lanes
setting — up to the five real elements. Pins are **retained** across a change of mode or section, so
one for a section you are not looking at is simply inert until you return.

**Chips are clickable in Cross-element and Layered only.** Scoped is one element by definition, and
a Borrowed lane has no rule-element for a `slotKey` to name — so in both, chips stay inert hints and
any pins you set elsewhere are ignored while you are there.
```

- [ ] **Step 8: Update §9's "deliberately not done" list**

Two of its entries are now done. Replace the paragraph with:

```markdown
Stitching three section modules into one session · crossfading loop wraps or overlapping lanes ·
per-section separate lanes · mixing sample elements *within* one lane · invariant repair of any
kind · in-app rule editing · saving a generated result · persisting pins across a reload · layering
in Borrowed mode (§3.4) · a "solo" control to audition one lane against another.
```

- [ ] **Step 9: Commit**

```bash
git add docs/remix-rules.md
git commit -m "docs(remix): lanes per element, pinned timings, and the three chip states"
```

---

## Task 11: Full verification and manual smoke

**Files:** none — verification only.

**Interfaces:**
- Consumes: everything above
- Produces: evidence, before any claim that this is done

- [ ] **Step 1: The three checks, from inside the worktree**

```bash
npx vitest run
npx tsc --noEmit
npx eslint src/remix src/components/remix
```

Expected: all pass. Paste the vitest summary line into the completion report — do not claim green without it.

- [ ] **Step 2: Start the dev server**

```bash
npm run dev
```

Open `http://localhost:3000/remix`.

- [ ] **Step 3: Smoke the layering**

- Pick **Layered**, leave lanes at 2. Expect two coloured lanes for at least MELODY and ELEMENT.
- Press **Play**. Both lanes of a category must be audible where their bars overlap — that overlap is the feature, and the one thing no unit test can confirm.
- Mute one lane; its sibling keeps sounding.

- [ ] **Step 4: Smoke the pinning**

- Click a chip. It gains a ring, and a lane appears for its element if there was none.
- Press **Regenerate** several times. The ringed chip stays lit and its bars stay put; everything else rerolls.
- Click the same chip again. The ring clears and that slot rejoins the draw.
- Switch to **Scoped**, confirm chips are inert, switch back to **Layered**, confirm the pin returned.

- [ ] **Step 5: Smoke export**

Export a **single section** first (a full session at 2 lanes is roughly twice the decode work of today's — design §9). Then try the full session and note whether it completes.

- [ ] **Step 6: Report**

State the test count, the three command results, and anything the smoke test surfaced. If Step 3's overlap does not actually sound, that is a real defect in the feature — report it rather than closing.

---

## Risks worth knowing before you start

- **Task 1 is the widest blast radius**, and it is entirely mechanical. ~30 testids in one file. Do it with the `laneRegion` helper rather than by hand-substituting elements, or you will encode seed-dependent guesses as assertions.
- **Task 5 can invalidate Task 6.** If `ruleKey` collides on the shipped pool, stop — the key needs redesigning and that is a decision to escalate, not to patch.
- **The RNG-order property in Task 3 is load-bearing.** Every pre-existing seed assertion in the suite depends on a one-lane draw consuming the stream exactly as it does today. If `is byte-identical to today` fails, fix the ordering rather than updating the assertions around it.
- **Tasks 8 and 9 are two halves of one interface change**, so the tree is red between them. That is called out in Task 8; squash them if the branch must stay green commit-by-commit.
- **Export cost roughly doubles at 2 lanes** — ~10 lanes to ~20, with a worst case of 55. The existing "try a single section rather than the full session" failure message already covers the likely symptom, so nothing is planned for it; just do not be surprised.

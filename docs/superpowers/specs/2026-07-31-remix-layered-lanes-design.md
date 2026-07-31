# Remix — Layered lanes & click-to-set timings

**Status:** Design, not yet implemented · **Date:** 2026-07-31 · **Branch:** `worktree-additional-features-remix`
**Builds on:** [remix rules reference](../../remix-rules.md) ·
[borrowed timings](./2026-07-28-remix-borrowed-timings-design.md) ·
[scoped & cross-element](./2026-07-27-remix-scoped-and-cross-element-modes-design.md)
**Revises:** rule **§3.1** of `docs/remix-rules.md` — "one track per category" becomes one lane per
category *per element*. **§3.4** survives, scoped down from a category to a lane.

---

## 1. The idea

Two changes to `/remix`, which turn out to be one change:

1. A category may sound **several elements at once** — Earth's melody and Fire's melody layered,
   each on its own authored timing.
2. The candidate **chips become clickable**, so a timing can be chosen deliberately instead of only
   drawn.

They are the same change because a chip already names both things a lane needs: its element and its
section. `Fire·Rx` means *the Fire lane, Deep-Relaxation slot*. Once a category can hold more than one
element, clicking a chip has an unambiguous destination, and no modifier keys or add/replace controls
are needed.

## 2. Why a chip is the right thing to click

`docs/remix-rules.md` §1: an `AuthoredRule` "carries **timing only** — plus a note of which element it
came from. No audio." A chip is therefore literally a timing pattern. Clicking one to change when a
lane sounds is the most direct expression of what the data already is.

Today `TrackPoolRow` renders chips as `<span>` with `cursor-help` — the information is on screen and
inert. This design makes it operable.

## 3. The lane model

### 3.1 A lane is category × element

```
id:       "MELODY·FIRE"          (was "MELODY")
category: "MELODY"               unchanged — drives STACK_ORDER and the manifest lookup
label:    "MELODY 2 · Fire"      variant (if any) + element
sample:   manifest["FIRE"]["MELODY"] → one file, as today
```

Each lane still holds **one element, one sample, and one rule per section**. Rule §3.4 ("every rule
of a track comes from one element") is not repealed — it is scoped down from governing a *category*
to governing a *lane*. Cross-element mixing still never happens inside a lane; it now happens across
lanes of the same category as well as across categories.

### 3.2 Ids are always `category·ELEMENT`

Even for a single-lane draw, where `MELODY·EARTH` is the only melody lane.

The alternative — `MELODY` while there is one lane, `MELODY·EARTH` once a second appears — is
rejected. `id` is the key for `mutedIds`, `trackDurations`, `regionAt`, `engine.setMute` and
`engine.triggerTrack`. A track whose id changed when a sibling lane appeared would silently lose its
mute state and be reloaded by the engine mid-session.

The cost is that existing tests asserting `id: 'MELODY'` must be updated. That is a one-time edit and
is preferable to a format that shifts under the user.

### 3.3 Ordering

`STACK_ORDER` by category as today, then `ELEMENTS` order within a category. Fire's melody therefore
always sits directly under Ether's, and the vertical grammar is unchanged at the category level.

## 4. Overlap

**There is nothing to resolve.** This was the open question that shaped the whole design, so the
reasoning is recorded here.

Two lanes are two `trackId`s. `regionAt` (`src/arrange/regionEnv.ts`) resolves per track id, and the
scheduler calls `engine.triggerTrack(track.id, …)` per track id, so each lane gets its own voice.
Overlapping timings on two lanes **layer** — which is the point of the feature.

The hazard that made this worth asking about is real but confined to a single lane: `regionAt` uses
`regions.find(…)`, so two overlapping regions **on one lane** would resolve to the first and the
second would never sound, with no warning. Within a lane §3.2 still yields at most one rule per
section, and a rule's phrases do not overlap themselves, so lane-internal regions stay disjoint and
the hazard is never reached.

Had the design instead put several samples on one lane — by adding a sample field to
`TemplateRegion` — this would not hold: one voice per `trackId` means overlapping regions could not
both sound, and one would cut the other off. That is why the lane split, not the region-level sample,
is the correct structure.

## 5. Clicking a chip

### 5.1 What a click does

A chip's element selects the lane; its section selects the slot.

| you click | result |
|---|---|
| a chip whose element has **no lane** in that category | the lane is created, pinned with that rule |
| a chip whose element **has a lane** | that lane's section slot is set to this rule, and pinned |
| a chip **you already pinned** | unpinned — the slot reverts to the draw. If the lane then has no pins and no drawn rules, the lane disappears |

Clicking never deletes another element's pick, because a click only ever addresses its own element's
lane.

### 5.2 Three chip states

"Lit" currently means "picked". It now has to distinguish who picked it:

```
[Earth·I]    plain outline      not picked
[Fire·Rx]    filled             drawn by the generator
[Air·I]      filled + ring      pinned by you
```

The element colour (`data-element`) is unchanged on all three.

### 5.3 Pins are keyed, not held by reference

`AuthoredRule` has no id, and `picked` is currently a `Set<AuthoredRule>` compared by object
identity. That cannot survive `refetch()`, which rebuilds every rule object. Pins therefore key off
content:

```ts
const ruleKey = (r: AuthoredRule) => `${r.source.sessionId}|${r.source.track}|${r.section}`;
const slotKey = (r: AuthoredRule) => `${r.category}|${r.source.element}|${r.section}`;

type Pins = Record<string, string>;   // slotKey → ruleKey
```

`ruleKey` should be unique because §2.4 merges repeated rows for one layer within a section into one
rule, and `source.track` keeps `MELODY 2` distinct from `SUB MELODY`. **This is an assumption, and a
test must assert it holds across the whole authored pool** — a collision would make two different
timings indistinguishable to a pin.

A pin whose `ruleKey` no longer resolves after a refetch (the session was edited or removed) is
dropped silently.

### 5.4 Pins survive Regenerate

Regenerate advances the seed and redraws **only unpinned slots**. This is the point of pinning: keep
the melody you liked, reroll everything under it.

Pins are an input to the draw, so §3.9's determinism becomes: same pool + manifest + seed + opts +
**pins** ⇒ the same draw. `pins` joins the `useMemo` dependency list in `useRemix`.

Pins are retained, not cleared, when the mode or section changes. A pin for a section you are not
viewing is simply inert, and returns when you go back.

## 6. Modes

| mode | rule pool | audio | layering |
|---|---|---|---|
| Cross-element | whole pool | follows each lane's own element | **yes**, by clicking |
| Scoped(el) | one element | that element | n/a — one element is one lane |
| Borrowed(el) | whole pool | fixed to `el` | **no — capped to one lane** |
| **Layered** *(new)* | whole pool | follows each lane's own element | **yes**, drawn *and* clicked |

Layered is Cross-element with the generator drawing *several* elements per category rather than one.

Chips are clickable in **Cross-element** and **Layered**, and inert in **Scoped** and **Borrowed**.

### 6.1 Why Borrowed is capped to one lane

Borrowed fixes audio to `sampleElement` for every lane, so all lanes of a category draw from the same
`manifest[sampleElement][category]` list. Six of the eleven categories — NOISE, FX, DRONE, PAD, BASS
and **MELODY** — hold exactly one sample per element, so those lanes would be byte-identical audio
staggered in time.

| category | EARTH | WATER | AIR | FIRE | ETHER |
|---|---|---|---|---|---|
| NOISE | 1 | 1 | 1 | 1 | 1 |
| ELEMENT | 4 | 7 | 4 | 3 | 3 |
| ELEMENT_SUB | 4 | 0 | 4 | 4 | 0 |
| FX | 1 | 1 | 1 | 1 | 1 |
| ISO | 4 | 4 | 4 | 4 | 4 |
| PLANET | 2 | 2 | 2 | 2 | 2 |
| DRONE | 1 | 1 | 1 | 1 | 1 |
| PAD | 1 | 1 | 1 | 1 | 1 |
| BASS | 1 | 1 | 1 | 1 | 1 |
| ARP | 1 | 1 | 2 | 1 | 1 |
| MELODY | 1 | 1 | 1 | 1 | 2 |

That staggering is a real phasing effect rather than a bug, but it is a different feature from
"several elements sounding", and it was judged not worth the extra states. Borrowed stays as
[its own design](./2026-07-28-remix-borrowed-timings-design.md) specified.

### 6.2 Colour resolves itself

The borrowed design §5.1 had to split colour: bars take the sample element, chips take the rule
element, because the two disagree in that mode. Under layering in Cross and Layered they **agree** —
a lane's sample element is its rule element — so a Fire lane's bars and its chips are both Fire. No
further colour rule is needed, and the existing split stays correct for Borrowed.

## 7. Generator change

```ts
export function generateRemix(
  pool: AuthoredRule[],
  manifest: Manifest,
  opts: {
    seed: number;
    element?: ElementName;
    sampleElement?: ElementName;
    section?: Mode;
    sessionSec: number;
    /** Layered: how many elements the draw may take per category. 1 = today's behaviour. */
    lanesPerTrack?: number;
    /** slotKey → ruleKey. Pinned slots are not drawn. */
    pins?: Record<string, string>;
  },
): RemixDraw;
```

### 7.1 Choosing lane elements

Today one lead draw fixes one element per category (`src/remix/generateRemix.ts:76`). Layered repeats
it without replacement:

1. Draw a lead uniformly over the category's candidate **rules**, fixing element `E1`.
2. Draw the next lead uniformly over candidates whose element ∉ `{E1}`, fixing `E2`.
3. Stop at `lanesPerTrack` lanes, or when no elements remain.

Drawing over rules rather than over elements preserves §3.7 — an element with more authored variants
stays likelier to win a lane.

The lane set for a category is then `drawn elements ∪ elements named by that category's pins`. A
pinned lane exists even where the draw would not have created one, and it may push a category past
`lanesPerTrack` — up to the five real elements.

### 7.2 Filling a lane

Unchanged from today, per lane: one rule per section from that element's candidates, `rebase` by the
rule's own `sectionStartSec`, absence accepted without repair, clipping and fade-capping as in §4.3
and §4.4. The only difference is that a slot with a pin takes the pinned rule instead of drawing.

**The rng consumption changes**, so seeds will not reproduce other modes' draws. As the borrowed
design already noted: seeds are meaningful only within one mode, and no test should assert cross-mode
seed equality.

### 7.3 ELEMENT_SUB warnings are collapsed per category

§3.6: WATER and ETHER author `ELEMENT_SUB` rules but ship no `ELEMENT_SUB` samples. Under layering
those become two skipped lanes rather than one occasionally-skipped track, so a naive
warning-per-lane would make the panel noisier without telling the user anything new.

The generator therefore emits **one warning per category**, naming the elements skipped:

```
ELEMENT_SUB: no WATER, ETHER sample — those lanes skipped
```

The warning is kept even when other lanes in the category survived, because it is the only thing
explaining why a chip the user can see never produces a lane.

## 8. UI changes

- **`TrackPoolRow`** — chips become `<button>`, gain `onPick`, and take a third `pinned` state.
  `cursor-help` becomes `cursor-pointer` where clickable, and stays `cursor-help` in Scoped and
  Borrowed. Chips keep their existing `title` (element · session · section · intervals), which is
  load-bearing and must not be "simplified" away.
- **`RemixView`** — a fourth mode pill, and a `lanes per track` control (1–3, default 2) shown only
  in Layered.
- **`ResultTimeline`** — the label gutter is `w-36`; `MELODY 2 · Fire` will not fit. Widen it, or
  render the element as a small coloured suffix under the label. Mute already works per track id, so
  per-lane mute comes free.
- **`useRemix`** — `pins` state, `setPin`/`clearPin`, both passed into the draw memo. `candidatesFor`
  is unchanged: it already filters by element only when scoped, which stays correct.

## 9. Cost

Each lane is one live voice and, on export, one fully decoded sample — already the heavy part of
`renderFreeMix`. With `lanesPerTrack` defaulting to 2 a full session roughly doubles from ~10 lanes
to ~20; the 1–3 bound and the five-element ceiling keep the worst case at 55 rather than unbounded.
Export is the surface to watch, and the existing "try a single section rather than the full session"
failure message already covers the likely symptom.

## 10. Tasks (bite-sized, TDD)

1. **Lane ids** (`generateRemix` + tests): `id` becomes `category·ELEMENT`; update existing
   assertions. No behaviour change yet — one lane per category still. Commit.
2. **`lanesPerTrack`** (+ tests): leads drawn without replacement; lane set per category; §3.7
   preserved; deterministic by seed. Commit.
3. **Warning collapse** (+ test): one ELEMENT_SUB warning naming skipped elements. Commit.
4. **`ruleKey` uniqueness** (test only): assert no collisions across the whole authored pool. Commit.
5. **Pins in the generator** (+ tests): pinned slots not drawn; a pin creates a lane the draw would
   not have; a pin can exceed `lanesPerTrack`; unresolvable pins dropped. Commit.
6. **`useRemix`** (+ tests): `pins` state, `setPin`/`clearPin`, memo deps, Regenerate rerolls only
   unpinned slots. Commit.
7. **`TrackPoolRow`** (+ tests): clickable chips, three states, inert in Scoped/Borrowed. Commit.
8. **`RemixView`** (+ tests): Layered pill, lanes control, wiring. Commit.
9. **`ResultTimeline`**: label gutter for `CATEGORY · Element`. Commit.
10. **Docs**: `docs/remix-rules.md` — §3.1 gains the per-element lane, §3.4 is scoped to a lane, §3.6
    notes the collapsed warning, §3.9 adds pins to the determinism inputs, §7 records the three chip
    states, and a §9 covers clicking. Commit.
11. **Full check**: `npx vitest run`, `npx tsc --noEmit`,
    `npx eslint src/remix src/components/remix`.
12. **Manual smoke**: Layered + 2 lanes, confirm two coloured lanes per category with overlapping
    bars that both sound; pin a chip, Regenerate, confirm it holds; click it again to unpin; Play and
    Export.

## 11. Environment

This worktree (`.claude/worktrees/additional-features-remix`) is branched from `master` at `a33b5c5`,
where all remix work including borrowed timings is merged.

Per the borrowed design §8, a fresh worktree needs three things git does not carry. **`src/manifest.json`
is confirmed missing here** — it was absent when this design was written. Also required: a junction
for `node_modules`, and a junction for `ECOSONIC FILES` — without the last, every `/api/samples/…`
404s and both Play and Export fail silently.

Note also that `vitest` picks up `.claude/worktrees/**` from the repo root, which shows phantom
failures; run tests from inside the worktree.

## 12. Out of scope

Mixing sample elements *within* one lane — a lane is one file, and this design does not change that ·
crossfading loop wraps (§5.2) or overlapping lanes · per-section separate lanes · re-authoring any
session content · persisting pins across reload · layering in Borrowed mode (§6.1) · a "solo" control
to audition one lane against another.

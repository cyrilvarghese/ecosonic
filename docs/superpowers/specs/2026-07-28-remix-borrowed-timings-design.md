# Remix — Borrowed Timings (one element's sound, every element's timing)

**Status:** Design, not yet implemented · **Date:** 2026-07-28 · **Branch:** `master` (remix work is merged)
**Builds on:** [remix rules reference](../../remix-rules.md) ·
[scoped & cross-element](./2026-07-27-remix-scoped-and-cross-element-modes-design.md) ·
[section picker & playback](./2026-07-27-remix-section-picker-and-playback-design.md)
**Revises:** rule **§3.4** of `docs/remix-rules.md` — "every rule of a track comes from one element",
which this makes conditional rather than absolute.

---

## 1. The idea

A third draw mode: **the samples all come from one chosen element, while the timings are drawn from
every element's authored rules.**

Today you must take an element's sound *and* its timing together, or take both per-track from
whichever rule won. This lets you hear EARTH throughout while its layers enter, fade and leave on
patterns borrowed from WATER, AIR, FIRE and ETHER — five sessions' worth of authored structure
played through one palette.

## 2. Why this is possible now, and wasn't before

`docs/remix-rules.md` §3.4 says every rule of a track must come from one element, and marks it
**structural**. The reasoning: a track carries exactly one `sample.path`, and the sample follows the
picked rule's element (§3.5) — so two rules from different elements would need two samples on one
lane, which `ArrTrack` cannot express.

That argument depends entirely on §3.5. **Fix the sample element independently and the constraint
dissolves**: if the audio is chosen by the user rather than by the pick, a rule's element no longer
decides anything about audio, and rules may be drawn from anywhere. A rule becomes what it always
was on paper — pure timing.

So §3.4 is not structural after all. It is structural *given* §3.5, and this mode replaces §3.5.

## 3. The mode matrix

Two independent questions, which the existing UI conflates:

|  | rules from **one** element | rules from **all** elements |
|---|---|---|
| **sample follows the pick** | Scoped *(today)* | Cross-element *(today)* |
| **sample fixed by the user** | ≡ Scoped (same result) | **Borrowed timings — new** |

Three distinct modes, not four: fixing the sample to the same element you filtered rules to just
reproduces Scoped.

## 4. Generator change

One new option. The pool filter and the sample lookup stop being the same decision.

```ts
export function generateRemix(
  pool: AuthoredRule[],
  manifest: Manifest,
  opts: {
    seed: number;
    element?: ElementName;     // Scoped: filter the rule pool to this element
    sampleElement?: ElementName; // Borrowed: take ALL audio from this element, whatever rule wins
    section?: Mode;
    sessionSec: number;
  },
): RemixDraw;
```

`element` and `sampleElement` are mutually exclusive — the UI offers one mode at a time, and the
generator should treat both being set as Scoped (or reject it; see §9).

### 4.1 What changes inside the loop

Today (`src/remix/generateRemix.ts:60-89`) the lead draw fixes the element, and the per-section
rules are then filtered to it:

```ts
const lead = cands[Math.floor(rng.float() * cands.length)];
const element = lead.source.element;
const samples = manifest[element]?.[category] ?? [];
const ofElement = cands.filter((r) => r.source.element === element);   // ← the constraint
```

With `sampleElement` set, there is no lead draw and no filter:

```ts
const audioElement = opts.sampleElement ?? lead.source.element;
const samples = manifest[audioElement]?.[category] ?? [];
// Borrowed timings: every element's rules are candidates for every section.
const forSections = opts.sampleElement ? cands : cands.filter((r) => r.source.element === audioElement);
```

Everything downstream is unchanged: one rule per section from `forSections`, `rebase` by each rule's
own `sectionStartSec`, absence accepted, STACK_ORDER ordering, seeded determinism.

**Note the rng consumption changes** when the lead draw is skipped, so draws will not match the same
seed in other modes. That is fine — seeds are only meaningful within one mode — but do not write a
test asserting cross-mode seed equality.

### 4.2 Section rebasing already handles the mix

A borrowed section draw can take its DEEP_RELAXATION rule from AIR (window opens 9:30) while playing
EARTH audio. `rebase` already shifts by **the rule's own** `sectionStartSec`, so this needs no new
code — the existing per-rule origin is exactly what makes borrowing safe. Worth a test that pins it.

### 4.3 The ELEMENT_SUB gap narrows

`docs/remix-rules.md` §3.6: WATER and ETHER author `ELEMENT_SUB` rules but ship no `ELEMENT_SUB`
samples, so those tracks are skipped. In borrowed mode with `sampleElement = EARTH` (which has the
samples), those WATER/ETHER rules become **usable** — their timing plays through EARTH's audio. The
warning should therefore appear far less often in this mode. This is a side effect, not the goal.

## 5. UI

A third pill in the existing toggle:

```
[ Cross-element | Scoped | Borrowed timings ]
```

When **Borrowed timings** is active, show the same element chip row as Scoped, but labelled to mean
*sound*, e.g. a leading caption `Sound:` before the chips. The hint line reads something like
*"every track plays <ELEMENT>'s samples, on timings drawn from every element"*.

### 5.1 Colour — the one real UI decision

Colour currently means "the element this came from", and in this mode audio and timing disagree, so
one meaning has to win per surface:

- **Timeline bars → the sample element.** They are what you *hear*, so every bar is one colour. This
  is also a useful visual signal that the mode is on.
- **Candidate chips → the rule element.** They are where the *timing* came from, and their whole
  purpose is showing which element's pattern won each section. This is the interesting information
  in this mode.

So a borrowed draw shows an all-EARTH timeline fed by chips of five different colours. That contrast
is the mode made visible, and is worth keeping rather than smoothing away.

### 5.2 `candidatesFor`

`useRemix.candidatesFor` must mirror the generator (rules doc §7): in borrowed mode it filters by
**section only**, not by element — every element's rules are genuinely drawable. Getting this wrong
reintroduces the bug fixed on 2026-07-27 where chips were shown that the draw could never pick.

## 6. Chip hover

`TrackPoolRow`'s title already names element · session · section · intervals. In this mode the
element in that string is the *timing's* element, which is correct and now load-bearing — a user
needs to see that this NOISE window came from FIRE while the audio is EARTH. No change needed, but
do not "simplify" it away.

## 7. Tasks (bite-sized, TDD)

1. **Generator** (`src/remix/generateRemix.ts` + test): add `sampleElement`; skip the lead-element
   filter when set; audio from `sampleElement`. Tests: every track's sample is the chosen element;
   picks may span elements; a section draw borrows across elements and rebases by each rule's own
   `sectionStartSec`; `ELEMENT_SUB` from WATER now yields a track when `sampleElement` has samples;
   deterministic by seed within the mode. Commit.
2. **`useRemix`** (+ test): a third mode value; `sampleElement` passed through; `candidatesFor`
   filters by section only in this mode. Commit.
3. **UI** (`RemixView` + test): third pill, `Sound:` chip row, hint copy. Commit.
4. **Colour** (`ResultTimeline`): `trackElements` becomes the sample element in this mode — verify
   bars are uniform while chips stay varied. Commit.
5. **Docs**: update `docs/remix-rules.md` — §3.4 becomes conditional, §3.5 gains the fixed-sample
   case, the §3 mode table gains a row, and §7 records the colour split. Commit.
6. **Full check**: `npx vitest run`, `npx tsc --noEmit`, `npx eslint src/remix src/components/remix`.
7. **Manual smoke**: pick Borrowed + EARTH, regenerate a few times, confirm every bar is EARTH-green
   while chips span colours, then Play.

## 8. Environment (for a fresh session)

Remix work is **merged into `master`** and pushed to `origin/master`. The worktree
`.claude/worktrees/remix-view` still exists on `feat/remix-view` at the same commit.

A fresh worktree needs three things git does not carry: junction `node_modules`, copy
`src/manifest.json` from the main repo, and **junction `ECOSONIC FILES`** — without the last, every
`/api/samples/…` 404s and both Play and Export fail silently.

## 9. Decisions to make during implementation

- **`element` + `sampleElement` both set:** recommend the generator treats `element` as authoritative
  (it is the narrower filter) rather than throwing, since the UI never produces the combination.
- **Mode naming:** "Borrowed timings" is a placeholder. Alternatives: "One palette", "Sound from",
  "Timings from all". Pick before writing the UI test, since the label is asserted.
- **Should Borrowed remember its element separately from Scoped?** Sharing one `element` state is
  simpler; separate state means switching modes does not disturb the other's choice. Recommend
  sharing until it annoys someone.

## 10. Out of scope

Per-section separate tracks (still §3.1: one track per category) · crossfading loop wraps or distinct
picks · mixing sample elements *within* one track — the audio is one file per lane, which §2 does not
change · re-authoring any session content.

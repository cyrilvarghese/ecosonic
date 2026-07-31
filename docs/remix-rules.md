# Remix — the rules

How `/remix` turns authored session timelines into a playable mix. This is a reference for the
behaviour as built, not a proposal. Where a rule exists because of a structural constraint rather
than a preference, that is said explicitly — those are the ones that cannot simply be changed.

Related: [free-mix design](./superpowers/specs/2026-07-26-remix-view-free-mix-design.md) ·
[scoped & cross-element](./superpowers/specs/2026-07-27-remix-scoped-and-cross-element-modes-design.md) ·
[section picker & playback](./superpowers/specs/2026-07-27-remix-section-picker-and-playback-design.md) ·
[borrowed timings](./superpowers/specs/2026-07-28-remix-borrowed-timings-design.md)

---

## 1. The three things involved

Understanding these makes most of the rules inevitable rather than arbitrary.

| | what it is | key point |
|---|---|---|
| **`AuthoredRule`** | one layer's timing within one section of one element's session | carries **timing only** — plus a note of which element it came from. No audio. |
| **`ArrTrack`** | one lane of the mix | carries **exactly one sample** (`sample.path`) |
| **`TemplateRegion`** | one window on the timeline | points at a `trackId`. **There is no field for a sample.** |

A region contributes *when*; the track contributes *what*. The renderer resolves audio per region as
`byId.get(r.trackId).sample.path` — the region cannot name its own audio because no such field
exists. Rule 3.4 follows directly from this.

## 2. Building the pool

**2.1** Every `config/sessions/*.md` is parsed into rules. The element comes from the filename
prefix (`water-session-layer-timeline.md` → `WATER`).

**2.2** Section headers give both the section tag and its **window**, e.g.
`## Section 2 - Deep Relaxation (10:00-20:00)`. Each rule records the window's **start** as
`sectionStartSec`.

**2.3** Window starts are per element and they disagree:

| element | Introduction | Deep Relaxation | Return |
|---|---|---|---|
| EARTH / WATER / FIRE / ETHER | 0:00–10:00 | 10:00–20:00 | 20:00–30:00 |
| **AIR** | 0:00–**9:30** | **9:30–19:00** | 20:00–**29:30** |

So the rebase origin is authored data, never a section index × 600.

**2.4** All phrase times are **absolute** on the 0–30:00 session timeline. A rule may have several
phrases (a comma list in the Starts cell); repeated rows for one layer within a section merge into
one rule.

**2.5** The pool is every rule from every element. Unknown layer names are skipped with a warning;
all-dash rows mean the layer is absent for that section.

**2.6 — Layer names are normalised, so they need not match across elements.** `mapLayer`
(`src/remix/vocab.ts`) maps an authored layer name onto a `Category`, tolerant of case and of
runs of whitespace:

| authored as | category |
|---|---|
| `ISO`, `NOISE`, `BASS`, `PAD`, `ARP` | itself |
| `PLANET`, `PLANETS` | `PLANET` |
| `ELEMENT`, `ELEMENTS` | `ELEMENT` |
| `SUB ELEMENTS` | `ELEMENT_SUB` |
| `MELODY`, `MELODY 2`, `SUB MELODY`, `SUB MELODY 2` | `MELODY` — the last three keep a **variant** tag |

Two elements spelling a layer differently still meet on one category, so **a timing is never
stranded by naming**, and cross-element or borrowed draws never need the sessions to agree on
wording. A name outside this table maps to `null` and its row is dropped (§2.5). The five shipped
sessions currently parse with **zero** warnings.

The category is also what a rule can *reach*: a track is derived from the rules that cover a
category (§3.1), never looked up from a track list. So a rule always has a lane — what it can fail
to find is a **sample** (§3.6), which is a different thing entirely.

**2.7 — `FX` and `DRONE` can never appear in a remix.** Both are real categories in `STACK_ORDER`
and both ship a sample in all five elements, but neither has a `mapLayer` entry, so no authored
layer name can produce a rule for them. They are the mirror of the §3.6 gap: samples with no rules,
rather than rules with no samples. Adding them would mean a vocab entry plus a layer row in the
session tables.

## 3. Choosing what plays

Two independent scopes narrow the pool before anything is drawn, and a third mode fixes the audio
instead of narrowing anything:

| | |
|---|---|
| **Cross-element** (default) | the whole pool; each track's sample follows the rule it picked |
| **Scoped**(el) | only that element's rules, and that element's samples |
| **Borrowed timings**(el) | the whole pool for **timing**, and **el**'s samples for every track |
| **Full session** (default) | the whole 30-minute timeline |
| **Section**(s) | only rules tagged to that section |

Borrowed with the element you would have scoped to is the same draw as Scoped, so these are three
modes rather than four.

Then, for each category the narrowed pool covers:

**3.1 — One track per category.** `id = category`, so `MELODY 2` and `SUB MELODY` collapse into the
single `MELODY` track. The picked variant becomes the track's **label**. There is never more than
one lane per category.

**3.2 — One rule per section, for a full session.** A track takes a rule from *each* section its
element authored, so a bed sounds across the whole thirty minutes rather than only the third its
lead came from. A **section draw takes exactly one rule.**

**3.3 — Absence is allowed, and never repaired.** A category no rule covers has no track. A section
the element never authored is simply silent there. Nothing is substituted to fill a gap.

**3.4 — Every rule of a track comes from one element — *unless the sample is fixed*.**
*(structural **given §3.5**, not absolute)*
By default the draw is two-stage: a **lead** rule is drawn from the category's candidates, which
fixes the element; the per-section rules are then drawn from that element only.

The reason is §1. A track plays one file. If the Intro rule came from Fire and the Return rule from
Water, one of the two samples would have to win, and the losing rule would contribute nothing but
its clock times — while the UI lit it up as a pick. So cross-element mixing happens **across
tracks** (Fire noise under Water planets under Air bass), never within one.

That argument depends entirely on the sample being chosen *by the pick*. **Borrowed timings** fixes
the sample by hand instead (§3.5), and the constraint dissolves: a rule's element no longer decides
anything about audio, so rules may be drawn from every element for one track. A rule becomes what it
always was on paper — pure timing. In that mode there is no lead element and no filter, and one
track's three sections can come from three different elements.

**3.5 — The sample follows the element — the picked one, or the chosen one.** A track's audio is
`manifest[element][category]`, drawn at random from that list. `element` is the lead rule's element
in Cross-element and Scoped; in **Borrowed timings** it is the element you picked, for every track.

**3.6 — No sample, no track.** If the element has no sample for that category, the track is skipped
with a warning. `ELEMENT_SUB` is the **only** such gap in the shipped material — every other
category×element cell has both a rule and a sample:

| | EARTH | WATER | AIR | FIRE | ETHER |
|---|---|---|---|---|---|
| authors `ELEMENT_SUB` rules | yes | yes | yes | — | yes |
| ships `ELEMENT_SUB` samples | 4 | **0** | 4 | 4 | **0** |

**Borrowed timings turns that gap from a coin-flip into a certainty, in both directions**, because
one chosen element supplies every track's audio rather than whichever element the lead landed on:

- **Sound: EARTH / AIR / FIRE** — `ELEMENT_SUB` *always* plays, and WATER's and ETHER's
  `ELEMENT_SUB` timings become usable for the first time in any mode. FIRE is the sharpest case: it
  authors no `ELEMENT_SUB` rules at all yet ships four samples, so borrowed-FIRE plays four other
  elements' sub-element timings through FIRE audio — a combination no other mode can produce.
- **Sound: WATER / ETHER** — `ELEMENT_SUB` is *always* skipped, where before it depended on where
  the lead draw landed. The warning appears every time in those two, by construction rather than by
  bad luck.

**3.7 — Draw probability follows rule count, not elements.** The lead is drawn uniformly over
*candidate rules*, so an element with more authored variants in a category is likelier to win it —
5 Air melodies against 2 Water melodies is roughly 2.5:1, not 1:1.

**3.8 — Tracks are ordered by the vertical grammar** (`STACK_ORDER`): NOISE, ELEMENT, ELEMENT_SUB,
FX, ISO, PLANET, DRONE, PAD, BASS, ARP, MELODY.

**3.9 — Deterministic.** Same pool + manifest + seed + element + section ⇒ the same draw.
Regenerate advances the seed.

## 4. Laying it on the timeline

**4.1 — Full session:** phrase times are used **as authored**, absolute over 0–`durationMin × 60`.

**4.2 — Section draw:** every phrase is rebased by **its own rule's `sectionStartSec`**, onto a
timeline of `config.layerTwo.moduleSeconds` (600s). An Air Deep-Relaxation rule shifts by 570 and an
Earth one by 600, and both land correctly on the same 0–600 module.

**4.3 — Clipping.** After rebasing, a phrase ending past the timeline is cut to it; one starting at
or past the end is dropped. A rule whose phrases all fall outside is skipped with a warning.

**4.4 — Fades are capped at the surviving width**, so a clipped clip still fades fully instead of
being cut mid-ramp.

**4.5 — One region per phrase.** A multi-phrase rule produces several regions on its track.

## 5. Playback and export

**5.1 — Samples loop under their interval.** `loop = true` in all three paths: buffered playback,
streamed playback, and the offline render. Sources run 1–5 minutes under intervals up to 10, so most
bars are the sample cycling several times over.

**5.2 — Loop seams are hard cuts.** There is no crossfade at the wrap point. Whether that is audible
depends on how the source file was prepared.

**5.3 — Every phrase plays.** The scheduler finds the region *containing* the playhead, so later
phrases of a multi-phrase rule sound. Contiguous regions hand over without stopping the sample; a
gap between them releases and re-triggers.

**5.4 — Fades apply per region**, at the interval edges — not at internal loop wraps.

**5.5 — Export mirrors playback.** The offline renderer reproduces the same loops, envelopes and
master gain, sized to the mix rather than to a Layer Two module.

**5.6 — Mute is part of the mix.** A muted track is silenced live *and* omitted from the export.

**5.7 — Export mirrors playback musically, not byte for byte.** Live triggers land on
animation-frame boundaries (~16 ms) while the offline renderer schedules sample-exactly, and live
playback loops where an export is a single linear pass. Both predate effects; a seeded impulse
response makes the *room* identical, not the render.

## 5a. Effect sends

**5a.1 — Two sends per track**, reverb and delay, 0–100%. MELODY starts wet (reverb 20%, delay
12%); every other category starts dry. Values come from `audio.effects.defaultSends`.

**5a.2 — Sends are post-fade.** A phrase that ends still rings out. This is what smooths the gap
rule 5.3 opens when it releases and re-triggers between non-contiguous phrases — the tail covers
the seam without moving any authored entry point (rule 6.5).

**5a.3 — Sends are runtime mix state.** They are not saved with an arrangement, the same as
per-track volume.

**5a.4 — An export runs past the end of the timeline** by the effect tail length, so the final
decay completes rather than being cut. An exported file is therefore slightly longer than its
timeline, and `estimatedWavBytes` counts the difference.

**5a.5 — A chained session export overlap-adds.** Each module is rendered longer than its slot, and
the next module starts on the grid regardless — so one module's tail rings over the next module's
opening instead of becoming a gap.

**5a.6 — Effects do not smooth loop seams (rule 5.2).** A tail cannot bridge a seam in a signal
that never stopped.

## 6. Adjust intervals to whole loops (opt-in)

Off by default. When on, every interval is resized so it contains a whole number of loops and no
sample is cut part-way through a pass.

**6.1** `loops = round(intervalLength / sampleLength)` — ≥ .5 rounds up, < .5 rounds down.
`1.7×` → `2×`; `1.49×` → `1×`.

**6.2** The floor is **one whole loop**. Rounding never reaches zero, so it can never delete a track.
`0.4×` → `1×`.

**6.3** It rounds **down instead** when rounding up would run past the end of the session, or into
that track's next interval. Extending into an overlap would create a worse seam than the one being
removed.

**6.4** An interval with no room for even one whole loop is left **exactly as authored**.

**6.5** Interval **starts never move** — only the end. Authored entry points, and the fades that live
there, are preserved.

**6.6** It needs the engine's reported sample lengths, so it does nothing until those have loaded.
It applies to the timeline, playback and export together.

**Scope:** this removes the seam at the interval's *end*. It does not touch the loop wraps *inside*
the interval (§5.2) — a 10:00 bar over a 1:56 sample still wraps five times.

## 7. What the UI shows

- **Chips** list the candidates the current scope could draw from — element **and** section filtered,
  so a chip on screen is always one the draw could have picked. Lit chips are the picks; a full
  session lights up to three per row.
- **Colour** is the element's brand colour, on both chips and bars, via `data-element`. In
  **Borrowed timings** audio and timing disagree, so each surface takes the one it represents:
  **bars take the sample element** (they are what you hear — every bar one colour, which is also the
  visible signal the mode is on) and **chips keep the rule element** (they are where the timing came
  from, which is the interesting information in that mode). An all-EARTH timeline fed by chips of
  five colours is the mode made visible, not an inconsistency.
- **A bar reads** `MELODY 1:56 ×5` on the left — the **material**, sample length × repeats — and the
  **interval** length on the right. The tooltip carries the whole reading.
- **`×N` is a product**: sample × N *is* the interval, and the numbers on screen multiply out. Where
  the sample does not divide the interval evenly there is no such integer, and the count is written
  **`×N+`** — N whole passes and part of another. It is never rounded into a lie.
- **Sample lengths show a tenth** when they have one (`1:56.2`). They are floats; printing 116.2s as
  `1:56` makes `1:56 ×5` read as 9:40 when the interval is really 9:41.
- With §6 on, every interval divides evenly, so every bar reads `×N`. A bar still showing `×N+` is
  one of §6's two exceptions — worth looking at.
- **Warnings** expand to their text rather than showing only a count.

## 8. Deliberately not done

Stitching three section modules into one session · per-section separate tracks (would allow
within-track element mixing, at the cost of §3.1) · crossfading loop wraps or distinct picks ·
invariant repair of any kind · in-app rule editing · saving a generated result.

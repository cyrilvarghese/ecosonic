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

**3.1 — One lane per category, per element.** `id = category·ELEMENT` — `MELODY·FIRE`. **A drawn
category is exactly one lane**, on the element its lead landed on. A category holds several lanes
only once you take it over (§8) — one per element you chose. The id carries the
element even when there is only one lane: an id that changed shape when a sibling appeared would
lose that lane's mute state and make the engine reload it mid-session. `MELODY 2` and `SUB MELODY`
still collapse onto the `MELODY` category; the picked variant and the element become the lane's
**label** (`MELODY 2 · Fire`).

Two lanes are two `trackId`s, so overlapping timings **layer** — each lane is its own voice, and
there is nothing to resolve. Within one lane §3.2 still yields at most one rule per section and a
rule's phrases do not overlap themselves, so `regionAt`'s first-match resolution is never reached.

**3.2 — One rule per section, for a full session.** A track takes a rule from *each* section its
element authored, so a bed sounds across the whole thirty minutes rather than only the third its
lead came from. A **section draw takes exactly one rule.**

**3.3 — Absence is allowed, and never repaired.** A category no rule covers has no track. A section
the element never authored is simply silent there. Nothing is substituted to fill a gap.

**3.4 — Every rule of a *lane* comes from one element — *unless the sample is fixed*.**
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
track's three sections can come from three different elements — drawn that way, or **chosen** that
way by clicking a chip per section (§8).

Taking a category over does not repeal this rule — it scopes it down from a category to a lane.
Cross-element mixing still never happens inside a lane; it happens across the lanes of a taken
category as well as across categories.

**3.5 — The sample follows the element — the picked one, or the chosen one.** A track's audio is
`manifest[element][category]`, drawn at random from that list. `element` is the lead rule's element
in Cross-element and Scoped; in **Borrowed timings** it is the element you picked, for every track.

**3.5a — PLANET sounds every sample its element ships.** One category is exempt from "drawn at
random from that list": `PLANET` takes **both** files rather than one, as two lanes on one timing.
Its samples are distinct celestial bodies — EARTH ships MERCURY and SUN, ETHER ships NEPTUNE and
PLUTO — authored to be heard together, so drawing one silently silenced half the library. Every
other multi-sample category (ISO's four, ELEMENT's three to seven) is a set of **alternates** to
choose between, and fanning those out would double the voice count.

A fanning lane's id carries the sample: `PLANET·EARTH·MERCURY`. Keyed on the body rather than on a
slot, your mute and level follow *that planet* across a redraw; keyed on a slot they would follow
whichever body the seed happened to put first. The id carries it even where an element ships one
sample, so the shape never depends on the count (§3.1). Capped at two — a lane is a voice.

This applies in **Borrowed timings** too. The §6.1 argument against extra lanes was that they would
be the same file staggered in time; two planets are two different files, so it does not reach them.

**3.6 — No sample, no lead.** A rule can only sound through an element that ships a sample for its
category, and **the draw does not pick a lead it could not play.** The pool row already strikes those
chips through and refuses a click on them; the generator holds to the same rule, so a dead candidate
costs nothing. A category is skipped — with a warning — only when *every* candidate is dead.

`ELEMENT_SUB` is the **only** such gap in the shipped material; every other category×element cell
that has a rule also has a sample:

| | EARTH | WATER | AIR | FIRE | ETHER |
|---|---|---|---|---|---|
| authors `ELEMENT_SUB` rules | Intro + Rx | Rx | Rx | — | Rx |
| ships `ELEMENT_SUB` samples | 5 | 3 | 4 | 4 | **0** |

Only ETHER's rule is unplayable, and because the draw skips it, `ELEMENT_SUB` now sounds in **every**
cross-element draw — roughly half of them on EARTH, carrying both an Introduction and a Deep
Relaxation. No element authors an `ELEMENT_SUB` rule for **Return**, so it never sounds there; that
is missing material, not a rule.

*(Historical note: this table read `WATER: 0` until 2026-08-15. `src/manifest.json` held WATER's
three sub samples under `ELEMENT`, at paths whose folder segment was `SUB` followed by an invisible
`U+F028` — a Private Use character. That defeats the `parts[2] === 'SUB'` test in `categoryOf`, so
they were classified as `ELEMENT`, and any URL built from those paths would 404. Rebuilding the
manifest off the now-clean folder name fixed both. Worth knowing that a path can be wrong in a way
no amount of reading the JSON will show you — compare code points, and re-run `verify:r2` after any
path changes.)*

**Borrowed timings decides the question by hand**, because one chosen element supplies every track's
audio rather than whichever element the lead landed on:

- **Sound: EARTH / WATER / AIR / FIRE** — `ELEMENT_SUB` always plays, and ETHER's timing becomes
  usable for the first time in any mode. FIRE is the sharpest case: it authors no `ELEMENT_SUB` rule
  at all yet ships four samples, so borrowed-FIRE plays other elements' sub-element timings through
  FIRE audio — a combination no other mode can produce.
- **Sound: ETHER** — `ELEMENT_SUB` is always skipped, by construction rather than by bad luck, and
  the warning names ETHER: it is the element that would have sounded, not the one that wrote the
  rule.

**The warning is collapsed per category**, naming every element skipped —
`ELEMENT_SUB: no WATER, ETHER sample — those lanes skipped` — rather than repeating itself once per
lane. A category you have taken over can still hit it, since choosing a timing by hand bypasses the
draw's filter.

**3.7 — Draw probability follows rule count, not elements.** The lead is drawn uniformly over
*candidate rules*, so an element with more authored variants in a category is likelier to win it —
5 Air melodies against 2 Water melodies is roughly 2.5:1, not 1:1.

**3.8 — Tracks are ordered by the vertical grammar** (`STACK_ORDER`): NOISE, ELEMENT, ELEMENT_SUB,
FX, ISO, PLANET, DRONE, PAD, BASS, ARP, MELODY.

**3.9 — Deterministic, and local.** Same pool + manifest + seed + element + section + the locks + the
manual choices ⇒ the same draw. Regenerate advances the seed and rerolls every **generated,
unlocked** track; a track you took over (§8) does not move, and neither does a locked one.

Each **lane owns its own random stream**, seeded from `(seed, category, element)` rather than drawn
from one shared sequence. This is what makes an edit local: taking one track over cannot disturb
what any other lane already chose, and the lane you were listening to survives a change to its
neighbours. A single shared stream couples everything — change how many values one lane consumes and
every later lane shifts.

**3.9a — Locking holds a category's draw.** A lock records the seed that was current when you set
it; that category then draws from the recorded seed while Regenerate advances the one everything
else uses. So a locked track redraws to bit-for-bit what you were hearing, and the lanes around it
reroll.

It stays **generated**, which is what separates a lock from taking a track over: its rules still
govern it, its chips still read as a draw rather than as pins, and it redraws — identically — if the
mode or section around it changes. `ArrTrack.locked` carries the state onto the drawn track, so the
timeline reads its own rows rather than a second, parallel record of the same fact.

Locks are held per **category**, the grain the random streams run at. A generated category is one
lane, so the two coincide; `PLANET`'s pair (§3.5a) shares one rule and therefore locks and releases
together. A category you have taken over already ignores the seed, so locking it changes nothing.

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

**4.6 — The fade shape is set per category, not inherited.** The authored sessions disagree wildly
about fades — ISO ramps in over 180s in one element and not at all in another, NOISE carries seven
different fade-outs — so `audio.remix.categoryFades` decides the shape instead:

| category | fade in | fade out |
|---|---|---|
| `ISO`, `NOISE`, `PLANET`, `PAD`, `ELEMENT` | 30s | 30s |
| `BASS`, `ARP`, `MELODY` | *as authored* | 3s |
| `ELEMENT_SUB` | *as authored* | *as authored* |

The beds get a long, even breath in and out. The rhythmic and melodic layers get a short tail so
they stop cleanly, and keep whatever entry the session wrote — `BASS` authors no fade-in anywhere,
which is grammar rule R4: bass enters directly.

A side the config omits keeps what the session wrote; a category it omits is untouched. Every value
is still capped at the region's surviving width (§4.4), so a 30-second shape cannot outlast a
20-second region.

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

**5a.1 — Two sends per lane**, reverb and delay, 0–100%. MELODY starts wet (reverb 75%, delay
30%); every other category starts dry. Values come from `audio.effects.defaultSends`.

**They are stored per lane but driven per category.** `arrangementStore.trackSends` is keyed by
lane id, and both exporters read it that way, so the model is per lane throughout. The only control
is on the pool row — and a pool row is a **category** (§7), which may cover several lanes — so
moving a slider writes the same level to every lane of that category, and the row shows the level
they share. This is deliberately the coarser of the two: per-lane sends exist in the store and would
need a per-lane control (the timeline rows are the obvious home) before they could be set apart.

These levels are deliberately high, and were tuned by ear after the feature worked. The subtle
settings the design started from (20% / 12% into a 2.5-second room) were inaudible over a full
ambient bed — the tail has to compete with continuity layers that never stop. A melody phrase
ending is meant to *dissolve*, not to be dabbed with a hint of room.

**5a.2 — Sends are post-fade.** A phrase that ends still rings out. This is what smooths the gap
rule 5.3 opens when it releases and re-triggers between non-contiguous phrases — the tail covers
the seam without moving any authored entry point (rule 6.5).

**5a.3 — Sends are runtime mix state.** They are not saved with an arrangement, the same as
per-track volume.

**5a.4 — An export runs past the end of the timeline** by the effect tail length, so the final
decay completes rather than being cut. As shipped the reverb is a 30-second room, so an exported
file is 30 seconds longer than its timeline (~5 MB at 16-bit stereo). `estimatedWavBytes` counts
the difference, so the pre-render size warning is honest about it.

**5a.5 — A chained session export overlap-adds.** Each module is rendered longer than its slot, and
the next module starts on the grid regardless — so one module's tail rings over the next module's
opening instead of becoming a gap. With a 30-second tail against a 600-second module, roughly the
first 5% of every module has the previous module still ringing under it. That is the intent: it is
what live playback does, where the context runs continuously across `advanceSession()`.

**5a.6 — Effects do not smooth loop seams (rule 5.2).** A tail cannot bridge a seam in a signal
that never stopped.

**5a.7 — Where a track starts, before you touch it.** A freshly drawn track sits at
`audio.volume.defaultTrackDb` — unity — unless its category is listed in `audio.volume.categoryDb`,
which mirrors `defaultSends` for level. `NOISE` starts at **−20 dB**: it is a bed and belongs under
the rest from the first bar, rather than at unity waiting to be pulled down.

The per-track slider runs `trackMinDb`…`trackMaxDb`, **−30 to +20 dB** — deeper than it is tall,
because burying a bed is a routine mix move and boosting one past +20 is not. Level is part of the
draw, so the WAV export carries it; it is not saved with an arrangement (rule 5a.3).

## 6. Adjust intervals to whole loops

**On by default.** Every interval is resized so it contains a whole number of loops and no sample is
cut part-way through a pass — a seam mid-pass is audible, and wanting one is the rarer choice. Clear
the box to hear intervals exactly as authored.

The trim needs sample lengths the engine only reports after loading, so a mix played immediately
starts on authored intervals and re-trims the moment those lengths arrive.

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

## 6a. Long samples play once

**Not a checkbox.** Unlike §6 this always applies: it is a fact about the material rather than a
preference about seams.

**6a.1 — A long sample plays exactly one pass per interval.** Longer than
`audio.remix.longSampleSec` (3:00), a file stops being a loop and becomes a composed passage; heard
twice in a row it reads as a repeat rather than as a bed. The interval ends when the pass does.

**6a.2 — Beds are exempt.** Categories in `audio.remix.alwaysLoopCategories` — `NOISE` and `BASS` —
keep cycling however long their file is. Being continuous is their job, and a long file there is a
long bed, not a passage.

**6a.3 — Only ever shorter.** The start never moves (§6.5) and fades cap to the surviving width. An
interval already shorter than one pass is left exactly as authored, as in §6.4.

**6a.4 — Applied after the whole-loop trim**, so that trim cannot extend a long sample back out to
two passes. Like §6 it needs sample lengths the engine reports only after loading, so it lands a
moment into playback and re-installs itself through the same path (§3.9a).

## 7. What the UI shows

- **Chips** list the candidates the current scope could draw from — element **and** section
  filtered, so a chip on screen is always one the draw could have picked. One row per **category**,
  not per lane: a category's pool is one thing, and a chip already names the lane it addresses.
  Four states: **outline** = not chosen, **filled** = drawn by the generator, **filled + ring** =
  chosen by you on a **manual** track (§8), and **struck through** = this timing can never sound,
  because the element it would play through ships no sample for the category (§3.6). A struck chip
  is inert — it would otherwise take a click, light up and produce nothing. It stays listed because
  it is a real authored timing, and **Borrowed timings can still play it** through an element that
  does have the sample. A generated row lights up to three chips per lane.
- **A manual row** carries a `manual` tag and an `↺ auto` control, because what a click means
  depends on it: on a generated row a click takes the track over; on a manual one it simply switches
  a timing on or off. A manual row stays on screen even when you have switched everything off.
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

## 8. Clicking a chip — the rules govern the draw, not you

**Every rule in §3 is a rule about generation.** They describe how `/remix` composes a track when it
is composing it, and they exist because an automatic draw with no constraints produces incoherence.
None of them is a constraint on *you*.

So a category has two states:

| | |
|---|---|
| **generated** (default) | drawn by the current mode, under every rule in §3 |
| **manual** | you took it over. It is not drawn, and §3 no longer applies to it |

**The first click on a row takes that category manual**, and *freezes what it was already playing* as
explicit choices — so an edit builds on what you were hearing instead of wiping the row. From then on
every chip is a plain on/off and **what is lit is exactly what sounds**. The row says `manual`, and
`↺ auto` hands it back to the generator.

A manual category may break any of the composition rules, which is the point:

- **§3.1** — several lanes in Cross-element, or in any mode. One lane per element you chose.
- **§3.2** — a section nobody chose is simply silent; a track may sound in the Introduction only.
- **§3.9** — Regenerate does not touch it. The seed moves; a manual track does not.

The one rule that survives is that **a lane is one file** — a fact about audio, not a rule of
composition — so each element you choose gets its own lane. Under Borrowed the sample is already
fixed by hand, so the category collapses to a single lane and its slots are sections rather than
element×sections: choosing an Introduction timing replaces whatever Introduction was there, because
two on one voice would overlap and one would never be heard.

Turning every chip off leaves the category **silent**, not regenerated — wanting a track gone is a
legitimate thing to want, and the row says `manual` so nothing is hidden. Its row stays on screen
even with no lanes, or the chips you would click to bring it back would vanish with it.

Choices are stored as `slotKey → ruleKey`, both derived from rule **content**
(`category|element|section` and `sessionId|track|section`) rather than object identity — `refetch()`
rebuilds every rule object, and a choice held by reference would not survive one upload. A choice
whose rule no longer resolves is dropped silently.

### 8.1 The one thing a click cannot do

A chip whose element ships **no sample** for the category can never become a lane (§3.6). It is shown
struck through and refuses the click, rather than lighting up and producing nothing. It stays listed
because it is a real authored timing, and **Borrowed timings can play it** through an element that
does have the sample — so the same chip is dead in Cross-element and alive under Borrowed.

**Chips are inert in Scoped**, the one mode where a click could decide nothing: it narrows the pool
to a single element and takes that element's samples, so every chip in the row is already the lane's
own element.

## 9. Deliberately not done

Stitching three section modules into one session · crossfading loop wraps or overlapping lanes ·
per-section separate lanes · mixing sample elements *within* one lane · invariant repair of any
kind · in-app rule editing · saving a generated result · persisting manual tracks across a reload ·
layering in Borrowed mode (§3.4) · a "solo" control to audition one lane against another.

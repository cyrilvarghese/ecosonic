# Gen-B (Live Scheduler) — Rationale, Provenance & Deprioritization

**Status:** Decision record · **Created:** 2026-07-09
**Related:** [03-generation-framework.md](./03-generation-framework.md) (§Part B) ·
[01-brief-analysis.md](./01-brief-analysis.md) · [ROADMAP §5](../ROADMAP.md) · [PRD §6.3](../PRD.md)

This note answers four questions raised on 2026-07-09 — *why did the live-scheduler path exist, what
does it add, what in the source material led to it, and how is a system with no LLM "live" or
"varying"* — and records the resulting decision: **Gen-B is deprioritized below ROADMAP Phases B and
C.** It stays in the docs as an option, not a "next."

---

## 1. Provenance — what was said vs. what was extrapolated

The scheduler was **not a stated requirement**. The trail:

1. **The brief's language is probabilistic.** The production brief specifies ranges, not clock
   times — *"approximately five minutes," "between 6 and 7 minutes," "once the ISO reaches its
   maximum level, PLANETS begins,"* and crucially *"may vary depending on the software's
   selection."* That justified making the system **generative at all** (the "core realisation,"
   [01-brief-analysis.md §4](./01-brief-analysis.md)).
2. **The framework split the work in two.** Part A: roll all the dice up front, emit a timing
   table. Part B: roll the dice during playback. Part B's only recorded justification is that a
   live engine is *"the fullest reading of 'generative'"*
   ([03-generation-framework.md §Part B](./03-generation-framework.md)) — an **extrapolation from
   the word "generative," not from a user requirement.**
3. **One user-anchored decision exists.** In the 2026-07-09 brainstorm, when pushed on *why* a live
   scheduler, the purpose that survived was **live-steerable playback** (change drift / steer
   upcoming entrances mid-session without stopping). Two other candidate purposes — endless radio,
   fixed-length replay — were explicitly set aside. The brainstorm was parked one decision in,
   which is why the direction felt under-motivated: it was.

## 2. What a live scheduler actually adds

The *only* thing it changes is **when the random draws happen**:

| | **Gen-A (built)** | **Gen-B (parked)** |
|---|---|---|
| Draws happen | at Generate-click, all up front | just-in-time, shortly before each event |
| During playback | arrangement is **frozen** | the **future is still undecided** |
| Changing drift mid-session | stop → regenerate → restart (whole new session; the minutes you liked are lost) | affects only what hasn't played yet |
| Variation source | seeded PRNG in `canon ± half` ranges | **identical** — same rules, same PRNG |
| Scrubbable / auditionable | yes — the whole table exists | no — you can't scrub into an undrawn future |

That's the entire delta. No new variation, no new musicality. The one problem Gen-B solves is
**steering without stopping**. The "one rule set, two resolvers" seam
([03 §B.1](./03-generation-framework.md)) makes this precise: batch resolver vs. incremental
resolver over identical `GenLayerRule` data. A Gen-B session with a fixed seed and no mid-session
input would produce *exactly* what Gen-A produces.

## 3. "There's no LLM — how is it live, and how does it vary?"

Generative music predates LLMs by decades and never needed them:

- **Eno's *Music for Airports*** — tape loops of co-prime lengths drifting in and out of phase.
- **Xenakis (1950s)** — note onsets drawn from probability distributions.
- **A wind chime** — a generative system with zero intelligence that never plays the same twice.

The "intelligence" lives in the **constraints** (rules R1–R9 distilled from the brief), not in the
decision-maker. Concretely, in this codebase:

- **Variation source = a seeded PRNG** (`mulberry32`) drawing inside `canon ± half` ranges, with
  ordering constraints (bottom-up stack, `after` + `minGapSec`) clamping every draw into legality.
  Each Generate click is a different seed → a different *legal* table. Dice, inside fences.
- **"Live" describes *when* the dice are rolled, not how smart the roller is.** A music box is
  composed — every decision made before playback. A wind chime is live — each strike decided at the
  moment the wind blows. Both are equally unintelligent. Gen-A is the music box (with dice at
  build time); Gen-B would be the wind chime (dice during playback).

## 4. Assessment & decision

The case for Gen-B is thin *for the current product*:

- The **designer flow** (the primary user, PRD §3) is better served by Gen-A: precomputed tables
  are scrubbable, auditionable, repeatable — the re-audition loop the PRD names as a success
  criterion. A live scheduler actively fights that.
- **Live steering is a listener-facing feature** — someone meditating who wants the session to
  respond without interruption. That user is explicitly "eventual" in PRD §3.
- **Nothing built depends on Gen-B.** It is design-only, parked, and cleanly droppable; the §B.1
  seam was kept deliberately so Part A is complete without it.

> **Decision (2026-07-09):** Gen-B is **deprioritized below ROADMAP Phase B** (per-mode edit
> persistence) **and Phase C** (composition view) — both serve the designer that exists today.
> Gen-B remains recorded (here and in [03 §Part B](./03-generation-framework.md)) as an option to
> revisit if/when a listener-facing, steer-while-listening use case becomes a real goal. Its one
> locked purpose (live-steerable playback) and inherited decisions (envelope fades, drift names,
> internal seed) carry forward unchanged.

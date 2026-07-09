# Domain Research — generative / meditation / psychoacoustic music

**Status:** Research note · **Created:** 2026-07-09
**Related:** [01-brief-analysis.md](./01-brief-analysis.md) · [03-generation-framework.md](./03-generation-framework.md)

Web research into the traditions the sample brief draws on. The brief's odd layer names (**ISO**,
**PLANETS**) are not arbitrary — they map onto real sound-healing and generative-music practice.
Each finding gives a *principled reason* behind one of the rules R1–R9, and several give usable math.

---

## 1. Findings, mapped to the rules

| Domain finding | What it explains / contributes | Rule |
|---|---|---|
| **Eno's generative music** — simple rules → "ever-different, ever-changing" output; tape loops of *different lengths that never re-sync*. *"Very simple rules clustering together produce very complex and rather beautiful results."* | The whole thesis of **R9**. Variation = coprime loop lengths + rules, not noise for its own sake. Justifies a **seeded, rule-driven generator** over hardcoded tables. | R9 |
| **The ISO Principle** (music therapy; Altshuler, 1944) — match the listener's *current* state, then *gradually* shift them to the target state. | This **is** the macro-arch **R6**, and the likely origin of the "ISO" layer name. Introduction = meet the listener; Deep Relaxation = the target (deep/slow); Return = re-surface. | R6 |
| **Isochronic tones / brainwave entrainment** — pulsed tones entrain brainwaves: delta 1–4 Hz (deep sleep), theta 4–8 Hz (deep relaxation), alpha 8–13 Hz. | *Why ISO peaks in Section 2.* The entrainment layer should be **strongest in the trough** (deepest target brain-state). Rule: ISO intensity tracks the target state, maximal in Deep Relaxation. | R6, R8 |
| **Cousto's Cosmic Octave** — planetary orbital periods folded into audible pitch via `f · 2ⁿ` (octave doubling). | *What the PLANETS layer is*, and a concrete **tuning formula** — a future hook for the currently-inert `tuningHz` ([PRD §8](../PRD.md)). | (tuning) |
| **Xenakis, stochastic composition** — probability distributions for musical events: **Poisson** for event counts, **exponential** for inter-onset gaps, **Gaussian** for continuous parameters. Textures *"unpredictable in detail, structured in aggregate."* | The formal tool for **R3 / R9**: sample entrance times and per-category counts from **bounded distributions** instead of fixed constants. Directly informs the grammar's "range → draw" step. | R3, R9 |
| **Endel** — a curated sound library + an algorithm that assembles **layers + modulations + effects**; phases shift ≈every 20 min tracking circadian rhythm; intensity adapts to context (light, HR, weather). | Validates the *exact* ECOSONIC architecture (curated samples + rules assemble them) and previews a later axis: **context-adaptivity**. Confirms "pre-designed library, algorithm arranges." | R9 |
| **Ambient form = A-B-C story arc**; tension comes from **density / filter / drone evolution**, not beats. *"Part C peels layers back to the core."* | Independent confirmation of **R5 / R6** from the ambient-production world — the same three-part shape, arrived at separately. | R5, R6 |
| **Pink / brown noise beds** — mask sudden sounds, synchronize brainwaves, sound like rain/wind; a neutral floor for relaxation. | *Why NOISE never breaks* (**R7**): it is the psychoacoustic floor that hides every transition and stabilizes the listener. | R7 |

---

## 2. The key convergence

**Two independent traditions land on the same three-part arch.** Music therapy (the ISO principle:
*match → shift → arrive*) and ambient production (*establish → develop → resolve*) describe the same
shape the brief uses for its three sections. That is strong evidence **R6 (the macro arch) is a real
invariant** worth enforcing in the generator, not one composer's preference.

**The brief's vagueness is a specification, not sloppiness.** *"Around 4:30–5:00," "between 6 and 7
minutes," "may vary"* are Xenakis-style **bounded ranges**. A generator that samples within them —
while respecting the ordering constraints (R1–R2) — produces exactly the "ever-different,
same-system" quality Eno describes. The research effectively hands us the probability model the
framework needs.

**Why the psychoacoustic layers behave as they do.** ISO (entrainment) peaking in the trough and
NOISE never breaking are not arbitrary mixing choices — entrainment wants maximal presence at the
deepest target state, and a continuous noise floor is what makes minute-long fades *imperceptible*.
These become **hard invariants** in the validator (see framework doc §Validator).

---

## 3. Sources

- Eno / generative music: [reverbmachine](https://reverbmachine.com/blog/deconstructing-brian-eno-music-for-airports/) ·
  [teropa — How Generative Music Works](https://teropa.info/loop/) ·
  [Wikipedia — Music for Airports](https://en.wikipedia.org/wiki/Ambient_1:_Music_for_Airports)
- ISO principle (music therapy): [healthandbass](https://www.healthandbass.com/post/the-iso-principle-alter-your-mood-with-music) ·
  [MDPI controlled study](https://www.mdpi.com/1660-4601/18/23/12486)
- Isochronic tones / entrainment: [DIY Genius](https://www.diygenius.com/isochronic-tones/) ·
  [Healthline](https://www.healthline.com/health/isochronic-tones) ·
  [SciELO literature review](https://www.scielo.org.mx/scielo.php?script=sci_arttext&pid=S1665-50442021000600238)
- Cosmic Octave / planetary frequencies: [Gongs Unlimited](https://gongs-unlimited.com/blogs/unlimited-blog/the-cosmic-octave-part-1) ·
  [Planetware](https://www.planetware.de/octave/intro.html)
- Stochastic / algorithmic composition (Xenakis): [Algorithmic Composition: Paradigms of Automated Music Generation](https://www.researchgate.net/publication/263963883_Algorithmic_Composition_Paradigms_of_Automated_Music_Generation)
- Endel: [How Endel Works](https://endel.zendesk.com/hc/en-us/articles/360012517639-How-Endel-Works) ·
  [endel.io/technology](https://endel.io/technology)
- Ambient form & layering: [Point Blank](https://www.pointblankmusicschool.com/blog/how-to-create-rich-layered-textures-in-ambient-music/) ·
  [StrongMocha — 10 layers](https://strongmocha.com/vendor/soundescape/decoding-the-soundscapes-top-10-layers-to-master-in-ambient-music/)
- Noise beds: [Soundly — white/pink/brown](https://www.soundly.com/blog/white-noise-and-alternatives) ·
  [Calm — calming sounds](https://www.calm.com/blog/calming-sounds-for-anxiety)

# Sample Brief — Analysis (what the production document shows)

**Status:** Analysis note · **Created:** 2026-07-09
**Source:** `sample-track.pdf` — "Production Structure" (a 3-section, ~30-min meditation production)
**Related:** [02-domain-research.md](./02-domain-research.md) · [03-generation-framework.md](./03-generation-framework.md) · [PRD](../PRD.md) · [ROADMAP](../ROADMAP.md)

This note records what the sample production brief actually describes, distilled into a **layer
grammar**, the **timing signatures** per section, and a set of **rules (R1–R9)** — the boundaries a
generator must respect. It also maps each observation onto the code that already exists.

---

## 1. The layer grammar (a fixed vertical stack)

The whole composition is assembled from **nine layer types** in a strict bottom-to-top order. This
is the single most important structure in the document — it is a *grammar*, not a track list.

| # | Layer | Function | Group |
|---|-------|----------|-------|
| 1 | **NOISE** | continuity floor — *never stops* | **Bed** (continuity) |
| 2 | **ELEMENT / SUB-ELEMENT / FX** | identity: river, birds, wind, gong, fire | **Bed** |
| 3 | **ISO** | psychoacoustic entrainment (pulsed tones) | **Bed** |
| 4 | **PLANET(S)** | psychoacoustic tuning (planetary frequencies) | **Bed** |
| 5 | **PAD** | first musical / harmonic layer | **Driver** |
| 6 | **BASS** | low-end foundation | **Driver** |
| 7 | **ARP** | arpeggiated movement | **Driver** |
| 8 | **MELODY** | top-line, completes the harmony | **Driver** |

This matches the codebase's own glossary exactly ([PRD §7](../PRD.md)):
**Bed / continuity = NOISE / ISO / PLANET / ELEMENT** (see `BED_CATEGORIES` in
[`src/arrange/types.ts`](../../src/arrange/types.ts)); **Drivers = BASS / PAD / ARP / MELODY / FX**.
The element identities per session are exactly the brief's examples:

- flowing river → **WATER** · birds → **EARTH** · wind → **AIR** · gong → **ETHER** ·
  synthesized fire FX → **FIRE** (so **FX is Fire's Element**, treated as an element-type layer).

---

## 2. The timing signatures (extracted section by section)

### Section 1 — Introduction (build-up)

```
0:00 ─ ELEMENT (main) ─────────────────────────────────────────► 10:00
0:00 ─ NOISE (continuous — never fades out) ───────────────────► 10:00
1:00 ─ ISO ▲1min ──────────────────────── 7:00 ▼fade ── 9:00
2:00 ─ PLANETS ▲ (after ISO peaks) ─────── 7:00 ▼fade ── 9:00
3:00 ─ PAD ▲1min ─────────────────────────────── 9:00 ▼
4:00 ─ BASS (⚡ NO fade-in — enters directly) ── 9:00 ▼
4:30 ─ ARP ▲ ──────────────────────────────────── 9:00 ▼
5:00 ─ 2nd ELEMENT ▲ ──────────────────────────────────────────► 10:00
6:30 ─ MELODY ▲ (between 6:00–7:00) ───────────── 9:00 ▼
                                          [peak / hold ≈ 6:30–8:30]
9:00 ─► ISO / PLANETS start a NEW 1-min fade-in to bridge into Section 2
```

Key phrases that define behaviour: *"once the ISO reaches its maximum level, PLANETS begins"* (a
**dependency**, not a clock time); *"the Bass enters directly, without a fade-in"* (the one
exception); *"all musical layers remain active until ≈8:30–9:00"*; *"ISO and PLANETS begin their
fade-out around minute seven"* (drivers and bed have **different lifecycles**).

### Section 2 — Deep Relaxation (rarefaction / trough)

- The main **ELEMENT is replaced by SUB-ELEMENTS** (imperceptible crossfade); **ISO + PLANETS rise
  to maximum**.
- Only **Sub-Elements + Noise + ISO + Planets** play. **No PAD / Bass / ARP / Melody at all.**
- ≈7:00 ISO / Planets / Noise begin a 1-min fade-out; the **final 2 minutes are Sub-Elements alone**.

### Section 3 — Return (mirror of Section 1)

- Sub-Elements → main Elements; layers re-enter in the **same order** (Element → Noise → ISO →
  Planets → PAD → Bass → ARP → Melody), then everything fades to close.
- **The elements chosen may differ** — *"depending on the software's selection"* — so each session
  is different in content while identical in structure.

The three tables above are already transcribed into
[`config/ecosonic.config.json → layerTwo.modeRules`](../../config/ecosonic.config.json) and consumed
by [`buildModeTemplate`](../../src/arrange/buildModeTemplate.ts).

---

## 3. The rules I distilled (R1–R9) — the boundaries a generator must respect

| Rule | Statement | In code today |
|---|---|---|
| **R1 · Fixed stack** | Layers occupy a fixed vertical order; each has a defined role. | `Category` union; `BED_CATEGORIES` |
| **R2 · Bottom-up entrance** | Layers enter *upward*; a layer waits until the one below has established. A **dependency chain**, not free placement. | Implicit in the hand-authored `enter` values |
| **R3 · Slow cadence** | Entrances spaced ≈1 min; fades default ≈1 min. Minutes, never beats. | `fadeIn/fadeOut: 60`; `secondElementEnterSec: 300` |
| **R4 · The Bass exception** | One hard onset (no fade) in an all-fade world — the rule set needs *exceptions*. | `BASS.fadeIn: 0` |
| **R5 · Density arch** | Within a module: **growth → peak/hold → decrease**. Density = # overlapping layers = *the arrangement itself*. | [ADR-0001]; `peakFrac: 0.5` |
| **R6 · Macro arch (A-B-A′)** | Across the session: **build (S1) → trough (S2) → resolve (S3)**. Contrast in S2 is by **subtraction** (remove drivers), not addition. | 3 modes; DEEP_RELAXATION nulls all drivers |
| **R7 · Unbroken continuity** | NOISE never breaks across all 30 min; ISO / Planets are **bridge-carriers** that re-fade-in at seams so there is never silence. | `NOISE.fadeOut: 0`; bed carries through bridges in `trackScalarAt` |
| **R8 · Asymmetric lifecycles** | Not all exits are equal — drivers exit together (≈9:00) but ISO / Planets exit *early* (≈7:00) to take up their bridge role. | Per-category `exit` values differ |
| **R9 · Structure-invariant, content-variable** | The *timing grammar* is fixed; the *samples / elements* are re-rolled per session → every session differs but is recognizably the same form. | `selection` min/max; regenerate + lock |

---

## 4. The core realisation

**The current engine replays *one* transcribed table; the brief describes a *generative
grammar*.** [`buildModeTemplate`](../../src/arrange/buildModeTemplate.ts) reads a fixed
`{ enter, exit, fadeIn, fadeOut }` per category from config. But the brief's own language —
*"approximately five minutes," "around 4:30–5:00," "between 6 and 7 minutes," "may vary depending on
the software's selection"* — is **probabilistic**: it defines **ordered ranges**, not fixed numbers.

The generative task (steps 3–4) is therefore to turn those fixed tables into **rules that *emit*
tables**: bounded ranges + ordering constraints that produce valid `modeRules`-shaped timing tables,
with controlled variation. That design is in
[03-generation-framework.md](./03-generation-framework.md).

**Two structural facts make this cheap:**
1. **Density is already the arrangement** ([ADR-0001]) — a generator never draws a curve; it places
   `[enter, exit]` windows legally and the arch *emerges*.
2. **The volume-envelope + crossfade machinery already exists** (parked): `regionEnvAt` renders
   `fadeIn/fadeOut` as cosine ramps, `crossfade` handles bridges, `trackScalarAt` +
   `useArrangementScheduler` drive `engine.setTrackEnvelope`. The generator only has to produce good
   tables; the engine already plays them.

[ADR-0001]: ../adr/0001-density-is-the-arrangement.md

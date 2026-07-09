# Generative Framework — Grammar + Scheduler (design)

**Status:** Design spec (awaiting review) · **Created:** 2026-07-09
**Related:** [01-brief-analysis.md](./01-brief-analysis.md) · [02-domain-research.md](./02-domain-research.md) · [PRD](../PRD.md) · [ROADMAP](../ROADMAP.md) · [ADR-0004 (mode-rules-as-config-data)](../adr/0004-mode-rules-as-config-data.md)

This spec turns the sample brief's rules (R1–R9, see [01](./01-brief-analysis.md)) and the domain
research ([02](./02-domain-research.md)) into a **generative mechanism** for ECOSONIC. It has **two
parts**, built in order:

- **Part A — the Grammar** (Phase 1, build now): pure, seeded rules that **emit timing tables** in
  the `modeRules`/`ModeTemplate` shape the existing engine already plays.
- **Part B — the Scheduler** (Phase 2, design only for now): a **live** generative engine that
  decides transitions at playback time, reusing the *same* rule data.

The distance a generated session may stray from the sample is a **3-mode drift control**:
`STRICT` / `MODERATE` / `EXPLORATORY`.

---

## 0. Design goals & non-goals

**Goals**
- Emit **valid** module timing tables that obey the brief's invariants, with controlled variation.
- Be **pure and seedable** — same `(mode, drift, seed)` → identical table (Eno's "same system,
  ever-different output," but reproducible for auditioning/tuning).
- **Drop into the existing engine** — output is `ModeTemplate` (or a `modeRules` table), consumed by
  [`buildComposition`](../../src/arrange/buildComposition.ts) → [`trackScalarAt`](../../src/arrange/trackScalar.ts) → [`useArrangementScheduler`](../../src/arrange/useArrangementScheduler.ts). No engine rewrite.
- Keep the rules as **pure config data** ([ADR-0004]) so tuning stays in JSON, validated by zod.

**Non-goals (now)**
- No new fade/crossfade code — reuse [`regionEnvAt`](../../src/arrange/regionEnv.ts) / [`crossfade`](../../src/arrange/bridges.ts).
- No context-adaptivity (time-of-day/HR à la Endel) — a later axis.
- No live scheduler implementation yet — Part B is design only.

---

## Part A — The Grammar (rules → timing tables)

### A.1 The shared rule model (`GenLayerRule`)

Today [`config.layerTwo.modeRules[mode][category]`](../../config/ecosonic.config.json) is a **fixed**
`{ enter, exit, fadeIn, fadeOut } | null`. We replace the fixed numbers with a **generative spec**
per category per mode — a canonical value plus a half-width the drift control opens up:

```ts
// pure data (JSON, zod-validated) — NOT computed at runtime
interface GenRange { canon: number; half: number }   // canon ± (half × driftScale)

interface GenLayerRule {
  present: number;          // P(layer appears): 1 = always (NOISE), <1 = optional
  enter:   GenRange;        // entrance window, seconds
  exit:    GenRange | 'MODULE_END';
  fadeIn:  GenRange;        // ≈60 ± … ; BASS = { canon: 0, half: 0 } (R4 exception)
  fadeOut: GenRange;        // ≈60 ± … ; NOISE continuous = { canon: 0, half: 0 } (R7)
  after?:  Category;        // ordering constraint (R2): enter ≥ enter[after] + minGapSec
}

type GenModeRule = Partial<Record<Category, GenLayerRule>>;   // omit = absent in this mode
```

Example (Introduction, drawn from the current fixed table as the `canon`):

```jsonc
"ISO":    { "present": 1, "enter": {"canon": 60,  "half": 20}, "exit": {"canon": 540, "half": 30},
            "fadeIn": {"canon": 60, "half": 15}, "fadeOut": {"canon": 120, "half": 20}, "after": "ELEMENT" },
"BASS":   { "present": 1, "enter": {"canon": 240, "half": 30}, "exit": {"canon": 540, "half": 30},
            "fadeIn": {"canon": 0, "half": 0},  "fadeOut": {"canon": 60, "half": 15},  "after": "PAD" },
"MELODY": { "present": 0.85, "enter": {"canon": 390, "half": 45}, "exit": {"canon": 540, "half": 30},
            "fadeIn": {"canon": 60, "half": 15}, "fadeOut": {"canon": 60, "half": 15}, "after": "ARP" }
```

### A.2 The 3-mode drift control (how far from the sample)

Drift is a single scalar per mode that scales **every** range's half-width and pulls optional
layers' presence toward/away from certain:

```ts
type Drift = 'STRICT' | 'MODERATE' | 'EXPLORATORY';
const driftScale: Record<Drift, number> = { STRICT: 0.15, MODERATE: 0.5, EXPLORATORY: 1.0 };
```

- **STRICT** — half-widths collapse (~±3–9 s); every output is clearly "the sample, slightly
  varied"; optional layers forced present. Highest fidelity to the brief.
- **MODERATE** — half-widths open to ~50 %; optional layers roll their `present`; spacing jitters.
  Sessions feel distinct while always legal. *(Recommended default.)*
- **EXPLORATORY** — full half-widths; optional layers freely drop; structural variants unlocked
  (e.g. ISO⇄PLANET alternation, dropping a driver). Most variety, still invariant-safe.

Storing `canon + half` once and letting drift pick the fraction keeps the config DRY: one table
serves all three modes. `STRICT` is *not* zero-width (still seed-varied), so even the tightest mode
is generative, not a replay.

### A.3 Generation algorithm (`generateModeTemplate`)

```
generateModeTemplate(tracks, mode, drift, seed, cfg) -> ModeTemplate
```

1. **PRNG** — seed a small deterministic PRNG (e.g. mulberry32). All draws come from it → pure.
2. **Presence** — for each category in the mode's `GenModeRule`, roll `present × f(drift)` → include?
   NOISE/ELEMENT/ISO/PLANET forced present (bed). DEEP_RELAXATION never includes drivers.
3. **Draw timings** — for each included category, sample `enter/exit/fadeIn/fadeOut` uniformly (or
   triangular, peaked at `canon`) within `canon ± half × driftScale`, clamped to `[0, moduleSeconds]`.
4. **Enforce ordering (R2) — the key invariant.** Process categories **bottom-up** by the fixed
   stack order; for any rule with `after`, clamp `enter ≥ enter[after] + minGapSec`. This
   *guarantees* bottom-up entrance no matter what the random draws were — the arch can't invert.
5. **Exceptions** — `BASS.fadeIn = 0` (R4); `NOISE.fadeOut = 0` when it spans the module (R7).
6. **2nd-element stagger** — later ELEMENT/ELEMENT_SUB tracks enter ≥ `secondElementEnterSec`
   (already implemented in [`buildModeTemplate`](../../src/arrange/buildModeTemplate.ts:27)).
7. **Cap fades** to half the clip width (as `buildModeTemplate` already does).
8. **Assign to tracks** — multiple tracks of a category share its timing (except later elements).
9. **Validate & repair** — run the validator (§A.5); clamp any soft violation to the nearest legal
   value so the output is *always* playable. Emit `ModeTemplate { mode, regions }`.

The staggered enters + shared exits make **density rise then fall on their own** — the arch (R5)
emerges from placement, no curve is imposed ([ADR-0001]).

### A.4 Session-level generation (`generateComposition`)

Reuse the parked, tested sequencing:

- [`buildSequence(totalSec, cfg)`](../../src/arrange/buildSequence.ts) lays out module instances that
  **cycle Introduction → Deep Relaxation → Return** and overlap by `bridgeSeconds` (R6 + R7).
- For **each instance**, call `generateModeTemplate` with a **per-instance seed** (`seed + index`) →
  every Introduction instance differs (R9), yet all share the grammar.
- Assemble a [`Composition`](../../src/arrange/types.ts:48) — same shape
  [`buildComposition`](../../src/arrange/buildComposition.ts) returns, so playback is unchanged.

`generateComposition` is therefore a thin variant of `buildComposition` that swaps
`buildModeTemplate` (fixed) for `generateModeTemplate` (generative), per instance.

### A.5 The Validator (the boundaries)

A standalone pure function — the enforceable form of R1–R9, usable both as an in-generator repair
step and as a test oracle:

```
validateTemplate(template, mode, cfg) -> { ok: boolean; violations: Violation[] }
```

| # | Invariant | Check |
|---|---|---|
| **I1 · Continuity** | NOISE present; in Introduction/Return it spans the module with no fade-out. | R7 |
| **I2 · Bottom-up order** | For every present pair (lower, upper) in the stack, `enter[upper] ≥ enter[lower]`. | R2 |
| **I3 · Single-peaked density** | The count of active layers over time rises to one peak then falls — no premature collapse, no double-hump. | R5 |
| **I4 · Mode constraints** | DEEP_RELAXATION has **no** PAD/BASS/ARP/MELODY/FX; Introduction/Return may. | R6 |
| **I5 · Bounds** | Every region ⊆ `[0, moduleSeconds]`; `fadeIn+fadeOut ≤ exit−enter`. | R3 |
| **I6 · No silent gap** | The bed covers every instant (≥1 layer active at all t). | R7 |

Hard invariants (I1, I2, I4, I6) are repaired by clamping during generation; soft ones (I3, I5) are
clamped too, and the validator doubles as the unit-test oracle across many seeds.

### A.6 Fades & the volume-envelope decision ✅ (resolved 2026-07-09 — envelope path)

Your directive — **"volume should have a ~1-min fade in and fade out"** — is satisfied *for free* by
the parked envelope path: [`regionEnvAt`](../../src/arrange/regionEnv.ts) already renders a region's
`fadeInSec`/`fadeOutSec` as a **cosine volume ramp** (fade-in → hold at 1 → fade-out). The generator
just emits `fadeIn/fadeOut ≈ 60` and routes through `trackScalarAt` → `engine.setTrackEnvelope`.

**But this is a deliberate move away from a stated principle.** [PRD §6.2 / §8](../PRD.md) and
[ADR-0002] say the shipping single-module designer treats **a clip as playback trigger, not volume**
— *"the sample's own baked fades are the only fades."* The envelope path (`regionEnvAt`, already
built and tested but parked) instead applies a Layer-Two volume envelope. Your instruction points at
the **envelope path**. That is a clean, low-risk choice (the code exists), but it **supersedes
"baked fades only" for generated/composition playback** — so PRD §8 and ADR-0002 must be updated to
record the decision.

> **Decided (2026-07-09):** generated/composition playback uses the **volume-envelope path**
> (`regionEnvAt`). Layer Two now applies a ~1-min cosine volume fade per region (with R4/R7
> exceptions). PRD §8 and ADR-0002 are to be amended (or a superseding ADR added) as part of build
> task **A1**. The shipping single-module *trigger/release* designer is unaffected.

### A.7 Config extension

Add `layerTwo.generation` (pure data, zod-validated in [`src/config.ts`](../../src/config.ts)):

```jsonc
"generation": {
  "minGapSec": 20,
  "driftScales": { "STRICT": 0.15, "MODERATE": 0.5, "EXPLORATORY": 1.0 },
  "modeRules": { "INTRODUCTION": { /* GenModeRule */ }, "DEEP_RELAXATION": {…}, "RETURN": {…} }
}
```

The existing fixed `modeRules` stays (it seeds the `canon` values and remains the STRICT fallback),
so nothing breaks; `generation.modeRules` is additive.

---

## Part B — The Scheduler (Phase 2, live — design only)

"Scheduler" here means a **live generative engine**, distinct from today's
[`useArrangementScheduler`](../../src/arrange/useArrangementScheduler.ts) (which merely *plays* a
fixed composition's envelopes in real time). Phase 2 decides transitions **as the session plays**, so
a session can be unbounded and never precomputed — the fullest reading of "generative."

### B.1 The clean seam: one rule set, two resolvers

The `GenLayerRule` data (Part A) is the **shared core**. Two ways to evaluate it:

- **Batch resolver** (Phase 1) — materialize *all* regions up front → a `ModeTemplate`. Auditionable,
  scrubbable, drops into the current engine.
- **Incremental resolver** (Phase 2) — on each tick, given elapsed time + current density + the same
  rules + PRNG, decide the *next* eligible transition (trigger the next in-order layer when its
  drawn `enter` arrives; release at `exit`). Xenakis-style: inter-onset gaps drawn from the ranges;
  ordering (R2) enforced by only ever considering the next-up layer.

Same rules, two strategies — Phase 2 is additive, not a rewrite. It reuses `regionEnvAt`/`crossfade`
for the actual ramps and `engine.setTrackEnvelope` for output.

### B.2 Sketch

```
useGenerativeScheduler(engine, rules, seed):
  each tick (schedulerTickMs):
    t = now - sessionStart
    for each layer eligible (its 'after' already active):
      if t ≥ layer.drawnEnter and not active:  trigger(layer)     // respects R2, R3
      if t ≥ layer.drawnExit  and active:       release(layer)
    enforce I1/I4/I6 live (bed always on; no drivers in Deep Relaxation)
```

Details (how far ahead to draw, how bridges work live, sample regeneration between modules) are
deferred to the Phase-2 spec; recorded here only to prove the seam holds.

---

## Integration map (data flow)

```
Layer One selection ─► snapshotSelection ─► ArrTrack[]
                                              │
                 seed, drift, mode ───────────┤
                                              ▼
   Part A:  generateModeTemplate ─► ModeTemplate  (drop-in for buildModeTemplate)
                                              │
              generateComposition (uses buildSequence) ─► Composition
                                              ▼
   Existing:  trackScalarAt ─► regionEnvAt / crossfade ─► setTrackEnvelope
              (driven by useArrangementScheduler; ~1-min fades rendered here)

   Part B (later):  useGenerativeScheduler ─► same regionEnvAt/crossfade ─► setTrackEnvelope
```

Everything below the "Part A" line already exists and is unit-tested.

---

## Decisions (resolved 2026-07-09)

1. **Envelope vs baked fades (§A.6)** — ✅ **envelope path.** The generator targets the
   volume-envelope path so the 1-min fades are real; PRD §8 / ADR-0002 to be amended in task **A1**.
2. **Drift naming** — ✅ keep `STRICT / MODERATE / EXPLORATORY`.
3. **Determinism surface** — ✅ **seed internal** for now; a UI "shuffle" / reproducible session id
   is a later enhancement (not in Phase A).

---

## Build phases

| Phase | Scope | Notes |
|---|---|---|
| **A1** | `GenLayerRule` config + zod schema; port current tables into `canon` values | pure data |
| **A2** | `generateModeTemplate` (PRNG, presence, draw, order-enforce, exceptions, assign) | core |
| **A3** | `validateTemplate` (I1–I6) + seed-sweep tests | the boundaries |
| **A4** | `generateComposition` (per-instance seeds via `buildSequence`) | session-level |
| **A5** | Wire into Layer Two: "Generate" + drift picker + seed/shuffle; play via existing scheduler | UI |
| **B**  | `useGenerativeScheduler` (live, incremental resolver) | later, own spec |

[ADR-0001]: ../adr/0001-density-is-the-arrangement.md
[ADR-0002]: ../adr/0002-clips-control-playback-not-gain.md
[ADR-0004]: ../adr/0004-mode-rules-as-config-data.md

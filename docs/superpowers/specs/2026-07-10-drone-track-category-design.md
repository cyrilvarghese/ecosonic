# DRONE track category — design

**Status:** Approved 2026-07-10 · **Related:** [PRD](../../PRD.md) · [ROADMAP](../../ROADMAP.md) ·
[ADR-0004 (mode rules as config)](../../adr/0004-mode-rules-as-config-data.md)

## Problem

The sample library gained a new top-level folder per element — `<ELEMENT>/DRONE/` — holding one
sustained "drone" sample each (`DRONE EARTH (PAD)`, `DRONE AIR (FX)`, `DRONE WATER/FIRE/ETHER`).
Today `categoryOf()` in `manifestBuild.ts` returns `null` for any unrecognized top-level folder, so
these files are **silently dropped** and never reach the app. We want DRONE to become a first-class
track category so it is selected in Layer One and arranged in Layer Two like any other track.

## Decisions (from brainstorm 2026-07-10)

- **Role: driver-like swell, not a continuity bed.** DRONE appears as its own lane, enters
  mid-module, holds, and fades out — it comes and goes like PAD/BASS, it does *not* span the module
  as a bed.
- **One per element.** `selection.DRONE = { min: 1, max: 1 }` (there is exactly one drone file each).
- **Enters early, near PAD (~3:00)**, and sits **just below PAD** in the vertical `STACK_ORDER`
  (a low sustained tone the melodic layers build on top of).
- **Deep Relaxation: no fixed rule → randomized.** Absent on a plain (deterministic) mode-pick, but
  the generative grammar rolls it in with `present: 0.5`.

## Design

### 1. Category spine (types + config schema)

`DRONE` becomes a `Category`, threaded through every enumerating site. The type system enforces
completeness (`BASE_LABEL: Record<Category, string>` and the Zod `ModeRule` fail the build until all
agree — a useful guardrail).

| File | Change |
|---|---|
| `src/types.ts` | Add `'DRONE'` to the `Category` union; add `DRONE: SampleEntry[]` to `ElementManifest`. |
| `src/session/manifestBuild.ts` | `categoryOf()`: recognize the **top-level** `DRONE/` folder → `'DRONE'`; add `DRONE: []` to `emptyElement()`. |
| `src/config.ts` | Add `DRONE` to `CATEGORY_VALUES`, `ModeRule` (`Timing.nullable()`), `GenModeRuleSchema` (`.optional()`), and the `selection` object (`Count`). |
| `src/session/selectionRules.ts` | Add `DRONE` to `SELECTION_ORDER` (after `PAD`) and `BASE_LABEL` (`'DRONE'`). |
| `src/arrange/types.ts` | Insert `DRONE` into `STACK_ORDER` **just below PAD**: `…ISO, PLANET, DRONE, PAD, BASS, ARP, MELODY`. **Not** added to `BED_CATEGORIES` — it crossfades at bridges like a driver. |
| `src/manifest.json` | Regenerate via `npm run build:manifest` so the five drone files are indexed. |

The UI needs no changes: `ModuleDesigner.tsx` renders `track.category` as text, so a "DRONE" lane
appears automatically.

### 2. Behavior (config data)

**Static mode tables** (`config.layerTwo.modeRules`) — deterministic, used on mode-pick, mirroring PAD:

| Mode | `DRONE` |
|---|---|
| `INTRODUCTION` | `{ enter: 180, exit: 540, fadeIn: 60, fadeOut: 60 }` |
| `DEEP_RELAXATION` | `null` (absent on a plain pick — keeps the deterministic bed pure) |
| `RETURN` | `{ enter: 180, exit: 570, fadeIn: 60, fadeOut: 60 }` |

**Generative grammar** (`config.layerTwo.generation.modeRules`):

| Mode | `DRONE` |
|---|---|
| `INTRODUCTION` | `present: 1`, `enter {canon:180, half:30}`, `exit {canon:540, half:30}`, fades `{60,15}`, `after: "PLANET"` |
| `RETURN` | `present: 1`, `enter {canon:180, half:30}`, `exit {canon:570, half:20}`, fades `{60,15}`, `after: "PLANET"` |
| `DEEP_RELAXATION` | **`present: 0.5`** (the randomizer), `enter {canon:0, half:0}`, `exit "MODULE_END"`, fades `{60,15}`, **no `after`** (may span from 0:00 as a sustained drone) |

**Ordering chain.** To keep the generator's bottom-up invariant (I2) robust under drift, DRONE is
spliced into the existing `after` chain rather than left as a free sibling of PAD:
`PLANET → DRONE → PAD → BASS → …`. Concretely, `DRONE.after = "PLANET"` and **`PAD.after` changes
from `"PLANET"` to `"DRONE"`** (in `INTRODUCTION` and `RETURN`). This guarantees
`PLANET.enter < DRONE.enter < PAD.enter` for every seed/drift (each step ≥ `minGapSec`), so DRONE can
never invert past PAD. Side effect: a generated PAD entrance is nudged ~20 s later than its canon
(180 → ~200) — immaterial for a randomized draw.

### 3. The one invariant carve-out

`validateTemplate.ts`'s `DRIVERS` list (`PAD, BASS, ARP, MELODY, FX`) drives invariant **I4**
("no drivers in Deep Relaxation"). Because we *deliberately* allow DRONE in Deep Relaxation, DRONE
is **left out** of that list — it is driver-like for staggering and bridge crossfades, but exempt
from the Deep-Relaxation strip. A code comment records this as intentional.

### 4. Known behavior to document

Under **STRICT** drift the generator forces every listed layer present
(`present = drift === 'STRICT' ? true : …`), so a generated Deep Relaxation always includes DRONE
under STRICT, and is a ~50/50 coin flip under MODERATE/EXPLORATORY. Accepted.

## Testing (TDD)

- `manifestBuild.test.ts` — a `<ELEMENT>/DRONE/x.wav` path classifies as `DRONE`.
- `config.test.ts` — extend the `valid` fixture with `DRONE` in all three static `modeRules`; schema
  parses.
- `buildSelection.test.ts` — one `DRONE` track is selected when the pool has a drone.
- `buildModeTemplate.test.ts` — INTRODUCTION places DRONE (~180, at/just under PAD); DEEP_RELAXATION
  omits it (static `null`).
- `validateTemplate.test.ts` — add a `DRONE` track to the "passes every generated template" sweep so
  I2 ordering and Deep-Relaxation-with-DRONE validity are guarded across modes × drifts × seeds.

## Out of scope

Per-category colors/icons (none exist today), tuning/`playbackRate` (inert project-wide), and any
change to how the five existing drivers behave beyond PAD's `after` retargeting.

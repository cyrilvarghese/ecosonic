# Layer Two — Part 1: Foundation + Pure Builders — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the config, types, and pure functions that turn a Layer One selection into a Layer Two `Composition` (mode templates + module sequence + bridges) whose density curve *is* the arrangement.

**Architecture:** Pure, side-effect-free modules under `src/arrange/`, mirroring Layer One's `buildSelection` pattern. No React, no Web Audio, no DOM — everything is a function of data + config, fully unit-tested with Vitest. Later parts add the store, scheduler, route, and UI on top.

**Tech Stack:** TypeScript, Zod (config validation), Vitest.

## Global Constraints

- Design spec: `docs/superpowers/specs/2026-07-03-layer-two-arrangement-engine-design.md` (authoritative).
- The density curve **is** the arrangement — no global volume/session envelope; per-clip fades only.
- Never exceed a track's Layer One `ceilingDb`; master is read-only passthrough.
- Modes: exactly `RELAXATION`, `IMMERSION`, `RETURN`. Bed categories: `NOISE, ISO, PLANET, ELEMENT`. Driver categories: `BASS, PAD, MELODY, FX`.
- `Category` values are singular: `ISO | PLANET | NOISE | ELEMENT | BASS | PAD | MELODY | FX` (from `src/types.ts`).
- Mode rules + presence bands are a **tunable config starter set** — read them from config, never hardcode.
- Determinism: no `Math.random` in builders (staggering uses track index).
- Follow existing repo conventions: `@/` path alias, `vitest run`, `npx tsc --noEmit`, Conventional Commits, `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` trailer.

---

### Task 1: Config — `layerTwo` block + Zod schema

**Files:**
- Modify: `config/ecosonic.config.json` (add top-level `layerTwo`)
- Modify: `src/config.ts` (extend `ConfigSchema`)
- Test: `src/config.test.ts` (extend the valid fixture; add a rejection case)

**Interfaces:**
- Consumes: existing `ConfigSchema`, `config` export.
- Produces: `config.layerTwo` typed as `{ moduleSeconds, bridgeSeconds, regionFadeSeconds, peakFrac, schedulerTickMs, durationPresetsMin: number[], modes: Mode[], presenceBands: { continuous:[number,number], active:[number,number], sparse:[number,number] }, modeRules: Record<Mode, Record<Category, Presence>> }`.

- [ ] **Step 1: Add the `layerTwo` block to `config/ecosonic.config.json`** (as a new top-level key, sibling of `audio`/`selection`/`motion`):

```json
  "layerTwo": {
    "moduleSeconds": 600,
    "bridgeSeconds": 120,
    "regionFadeSeconds": 12,
    "peakFrac": 0.5,
    "schedulerTickMs": 250,
    "durationPresetsMin": [10, 20, 30, 40],
    "modes": ["RELAXATION", "IMMERSION", "RETURN"],
    "presenceBands": {
      "continuous": [0.0, 1.0],
      "active": [0.18, 0.82],
      "sparse": [0.4, 0.6]
    },
    "modeRules": {
      "RELAXATION": { "NOISE": "continuous", "ISO": "active", "PLANET": "active", "ELEMENT": "active", "BASS": "sparse", "PAD": "active", "MELODY": "sparse", "FX": "sparse" },
      "IMMERSION":  { "NOISE": "continuous", "ISO": "sparse", "PLANET": "sparse", "ELEMENT": "sparse", "BASS": "absent", "PAD": "absent", "MELODY": "absent", "FX": "absent" },
      "RETURN":     { "NOISE": "continuous", "ISO": "active", "PLANET": "active", "ELEMENT": "active", "BASS": "active", "PAD": "active", "MELODY": "sparse", "FX": "active" }
    }
  }
```

- [ ] **Step 2: Extend `src/config.ts`.** Add these schemas before `ConfigSchema`, and a `layerTwo` field inside the `z.object({...})`:

```ts
const Presence = z.enum(['continuous', 'active', 'sparse', 'absent']);
const Band = z.tuple([z.number(), z.number()]);
const ModeRule = z.object({
  NOISE: Presence, ISO: Presence, PLANET: Presence, ELEMENT: Presence,
  BASS: Presence, PAD: Presence, MELODY: Presence, FX: Presence,
});
const LayerTwo = z.object({
  moduleSeconds: z.number().positive(),
  bridgeSeconds: z.number().nonnegative(),
  regionFadeSeconds: z.number().nonnegative(),
  peakFrac: z.number().min(0).max(1),
  schedulerTickMs: z.number().positive(),
  durationPresetsMin: z.array(z.number().positive()),
  modes: z.array(z.enum(['RELAXATION', 'IMMERSION', 'RETURN'])),
  presenceBands: z.object({ continuous: Band, active: Band, sparse: Band }),
  modeRules: z.object({ RELAXATION: ModeRule, IMMERSION: ModeRule, RETURN: ModeRule }),
});
```

Then add `layerTwo: LayerTwo,` as a field of the top-level `z.object({ audio, selection, motion, ... })`.

- [ ] **Step 3: Extend the fixture in `src/config.test.ts`.** Add this `layerTwo` key to the `valid` object (the top-level schema now requires it, so the existing tests fail without it):

```ts
    layerTwo: {
      moduleSeconds: 600, bridgeSeconds: 120, regionFadeSeconds: 12, peakFrac: 0.5,
      schedulerTickMs: 250, durationPresetsMin: [10, 20, 30, 40],
      modes: ['RELAXATION', 'IMMERSION', 'RETURN'] as const,
      presenceBands: { continuous: [0, 1], active: [0.18, 0.82], sparse: [0.4, 0.6] },
      modeRules: {
        RELAXATION: { NOISE: 'continuous', ISO: 'active', PLANET: 'active', ELEMENT: 'active', BASS: 'sparse', PAD: 'active', MELODY: 'sparse', FX: 'sparse' },
        IMMERSION:  { NOISE: 'continuous', ISO: 'sparse', PLANET: 'sparse', ELEMENT: 'sparse', BASS: 'absent', PAD: 'absent', MELODY: 'absent', FX: 'absent' },
        RETURN:     { NOISE: 'continuous', ISO: 'active', PLANET: 'active', ELEMENT: 'active', BASS: 'active', PAD: 'active', MELODY: 'sparse', FX: 'active' },
      },
    },
```

Then add a rejection test:

```ts
  it('rejects a layerTwo config with a bad presence value', () => {
    const bad = {
      ...valid,
      layerTwo: {
        ...valid.layerTwo,
        modeRules: { ...valid.layerTwo.modeRules,
          RELAXATION: { ...valid.layerTwo.modeRules.RELAXATION, NOISE: 'loud' } },
      },
    };
    expect(ConfigSchema.safeParse(bad).success).toBe(false);
  });
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/config.test.ts`
Expected: PASS (existing tests + the new rejection test).

- [ ] **Step 5: Typecheck + commit**

```powershell
npx tsc --noEmit
git add config/ecosonic.config.json src/config.ts src/config.test.ts
git commit -m "feat(layer2): config layerTwo block + zod schema"
```

---

### Task 2: Arrangement types + `regionEnv`

**Files:**
- Create: `src/arrange/types.ts`
- Create: `src/arrange/regionEnv.ts`
- Test: `src/arrange/regionEnv.test.ts`

**Interfaces:**
- Consumes: `Category` from `@/types`; `Presence`, `Mode` conceptually from config.
- Produces: types `Mode`, `Presence`, `ArrTrack`, `RegionTiming`, `TemplateRegion`, `ModeTemplate`, `ModuleInstance`, `Bridge`, `Composition`; function `regionEnvAt(r: RegionTiming, s: number): number` returning `0..1`.

- [ ] **Step 1: Create `src/arrange/types.ts`**

```ts
import type { Category } from '@/types';

export type Mode = 'RELAXATION' | 'IMMERSION' | 'RETURN';
export type Presence = 'continuous' | 'active' | 'sparse' | 'absent';

export const BED_CATEGORIES: Category[] = ['NOISE', 'ISO', 'PLANET', 'ELEMENT'];
export const isBed = (c: Category): boolean => BED_CATEGORIES.includes(c);

export interface ArrTrack {
  id: string;
  category: Category;
  label: string;
  sample: { name: string; path: string; bytes: number };
  ceilingDb: number;
  locked: boolean;
}

/** Minimal timing shape shared by template (module-relative) and absolute regions. */
export interface RegionTiming {
  enterSec: number;
  exitSec: number;
  fadeInSec: number;
  fadeOutSec: number;
}

export interface TemplateRegion extends RegionTiming {
  trackId: string;
}

export interface ModeTemplate {
  mode: Mode;
  regions: TemplateRegion[];
}

export interface ModuleInstance {
  id: string;
  mode: Mode;
  startSec: number;
  durationSec: number;
}

export interface Bridge {
  id: string;
  fromInstanceId: string;
  toInstanceId: string;
  overlapSec: number;
}

export interface Composition {
  tracks: ArrTrack[];
  templates: Record<Mode, ModeTemplate>;
  sequence: ModuleInstance[];
  bridges: Bridge[];
  totalSec: number;
  tuningHz: number;
  masterDb: number;
}
```

- [ ] **Step 2: Write the failing test `src/arrange/regionEnv.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { regionEnvAt } from '@/arrange/regionEnv';

const r = { enterSec: 10, exitSec: 30, fadeInSec: 4, fadeOutSec: 4 };

describe('regionEnvAt', () => {
  it('is 0 outside the region', () => {
    expect(regionEnvAt(r, 5)).toBe(0);
    expect(regionEnvAt(r, 35)).toBe(0);
  });
  it('holds at 1 in the sustain', () => {
    expect(regionEnvAt(r, 20)).toBeCloseTo(1, 6);
  });
  it('ramps smoothly 0→1 over fade-in and 1→0 over fade-out', () => {
    expect(regionEnvAt(r, 10)).toBeCloseTo(0, 6);      // entry
    expect(regionEnvAt(r, 12)).toBeCloseTo(0.5, 6);    // half fade-in
    expect(regionEnvAt(r, 30)).toBeCloseTo(0, 6);      // exit
    expect(regionEnvAt(r, 28)).toBeCloseTo(0.5, 6);    // half fade-out
  });
  it('never exceeds 1', () => {
    for (let s = 9; s <= 31; s += 0.5) expect(regionEnvAt(r, s)).toBeLessThanOrEqual(1);
  });
});
```

- [ ] **Step 3: Run it to verify failure**

Run: `npx vitest run src/arrange/regionEnv.test.ts`
Expected: FAIL — cannot import `@/arrange/regionEnv`.

- [ ] **Step 4: Implement `src/arrange/regionEnv.ts`**

```ts
import type { RegionTiming } from '@/arrange/types';

const cosRamp = (x: number) => 0.5 * (1 - Math.cos(Math.PI * x)); // x in [0,1] → 0..1

/** Per-clip envelope: fade-in → hold at 1 → fade-out; 0 outside [enter, exit]. */
export function regionEnvAt(r: RegionTiming, s: number): number {
  if (s <= r.enterSec || s >= r.exitSec) return 0;
  const fromStart = s - r.enterSec;
  const toEnd = r.exitSec - s;
  if (r.fadeInSec > 0 && fromStart < r.fadeInSec) return cosRamp(fromStart / r.fadeInSec);
  if (r.fadeOutSec > 0 && toEnd < r.fadeOutSec) return cosRamp(toEnd / r.fadeOutSec);
  return 1;
}
```

- [ ] **Step 5: Run tests + typecheck + commit**

Run: `npx vitest run src/arrange/regionEnv.test.ts` → PASS

```powershell
npx tsc --noEmit
git add src/arrange/types.ts src/arrange/regionEnv.ts src/arrange/regionEnv.test.ts
git commit -m "feat(layer2): arrangement types + per-clip regionEnv"
```

---

### Task 3: Timeline geometry helpers

**Files:**
- Create: `src/arrange/geometry.ts`
- Test: `src/arrange/geometry.test.ts`

**Interfaces:**
- Consumes: `RegionTiming` from `@/arrange/types`.
- Produces: `secToPx(sec, pxPerSec): number`, `pxToSec(px, pxPerSec): number`, `clampRegion(r, bounds, minWidthSec): RegionTiming`, `clampOverlap(overlapSec, maxOverlapSec): number`.

- [ ] **Step 1: Write the failing test `src/arrange/geometry.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { secToPx, pxToSec, clampRegion, clampOverlap } from '@/arrange/geometry';

describe('geometry', () => {
  it('round-trips sec↔px', () => {
    expect(secToPx(30, 4)).toBe(120);
    expect(pxToSec(120, 4)).toBe(30);
  });
  it('clamps a region into bounds keeping min width', () => {
    const r = { enterSec: -5, exitSec: 3, fadeInSec: 1, fadeOutSec: 1 };
    const c = clampRegion(r, { min: 0, max: 100 }, 2);
    expect(c.enterSec).toBe(0);
    expect(c.exitSec).toBeGreaterThanOrEqual(c.enterSec + 2);
  });
  it('keeps at least min width when exit is dragged below enter', () => {
    const r = { enterSec: 50, exitSec: 51, fadeInSec: 1, fadeOutSec: 1 };
    const c = clampRegion(r, { min: 0, max: 100 }, 5);
    expect(c.exitSec - c.enterSec).toBeGreaterThanOrEqual(5);
  });
  it('clamps overlap into [0, maxOverlap]', () => {
    expect(clampOverlap(-10, 120)).toBe(0);
    expect(clampOverlap(999, 120)).toBe(120);
    expect(clampOverlap(60, 120)).toBe(60);
  });
});
```

- [ ] **Step 2: Run it to verify failure**

Run: `npx vitest run src/arrange/geometry.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/arrange/geometry.ts`**

```ts
import type { RegionTiming } from '@/arrange/types';

export const secToPx = (sec: number, pxPerSec: number): number => sec * pxPerSec;
export const pxToSec = (px: number, pxPerSec: number): number => px / pxPerSec;

export const clampOverlap = (overlapSec: number, maxOverlapSec: number): number =>
  Math.min(maxOverlapSec, Math.max(0, overlapSec));

/** Clamp a region into [bounds.min, bounds.max], preserving at least minWidthSec. */
export function clampRegion(
  r: RegionTiming,
  bounds: { min: number; max: number },
  minWidthSec: number,
): RegionTiming {
  const enterSec = Math.min(Math.max(r.enterSec, bounds.min), bounds.max - minWidthSec);
  const exitSec = Math.min(Math.max(r.exitSec, enterSec + minWidthSec), bounds.max);
  return { ...r, enterSec, exitSec };
}
```

- [ ] **Step 4: Run tests → PASS**

Run: `npx vitest run src/arrange/geometry.test.ts`

- [ ] **Step 5: Typecheck + commit**

```powershell
npx tsc --noEmit
git add src/arrange/geometry.ts src/arrange/geometry.test.ts
git commit -m "feat(layer2): timeline geometry helpers"
```

---

### Task 4: Bridge crossfade

**Files:**
- Create: `src/arrange/bridges.ts`
- Test: `src/arrange/bridges.test.ts`

**Interfaces:**
- Produces: `crossfade(tInBridgeSec: number, overlapSec: number): { out: number; in: number }` — cosine crossfade for non-continuity tracks across a bridge overlap window. Continuity tracks are handled by the caller (never crossfaded).

- [ ] **Step 1: Write the failing test `src/arrange/bridges.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { crossfade } from '@/arrange/bridges';

describe('crossfade', () => {
  it('is fully outgoing at the start of the bridge', () => {
    expect(crossfade(0, 120)).toEqual({ out: 1, in: 0 });
  });
  it('is balanced at the midpoint', () => {
    const { out, in: inc } = crossfade(60, 120);
    expect(out).toBeCloseTo(0.5, 6);
    expect(inc).toBeCloseTo(0.5, 6);
  });
  it('is fully incoming at the end', () => {
    const { out, in: inc } = crossfade(120, 120);
    expect(out).toBeCloseTo(0, 6);
    expect(inc).toBeCloseTo(1, 6);
  });
  it('out + in always equals 1 across the window', () => {
    for (let t = 0; t <= 120; t += 10) {
      const { out, in: inc } = crossfade(t, 120);
      expect(out + inc).toBeCloseTo(1, 6);
    }
  });
  it('degenerate overlap of 0 is a hard switch to incoming', () => {
    expect(crossfade(0, 0)).toEqual({ out: 0, in: 1 });
  });
});
```

- [ ] **Step 2: Run it to verify failure**

Run: `npx vitest run src/arrange/bridges.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/arrange/bridges.ts`**

```ts
/** Equal-ish-power cosine crossfade across a bridge overlap window [0, overlapSec]. */
export function crossfade(tInBridgeSec: number, overlapSec: number): { out: number; in: number } {
  if (overlapSec <= 0) return { out: 0, in: 1 };
  const x = Math.min(1, Math.max(0, tInBridgeSec / overlapSec));
  const inc = 0.5 * (1 - Math.cos(Math.PI * x)); // 0→1
  return { out: 1 - inc, in: inc };
}
```

- [ ] **Step 4: Run tests → PASS**

Run: `npx vitest run src/arrange/bridges.test.ts`

- [ ] **Step 5: Typecheck + commit**

```powershell
npx tsc --noEmit
git add src/arrange/bridges.ts src/arrange/bridges.test.ts
git commit -m "feat(layer2): bridge crossfade"
```

---

### Task 5: `buildModeTemplate` — mode rules → density-peaked regions

**Files:**
- Create: `src/arrange/buildModeTemplate.ts`
- Test: `src/arrange/buildModeTemplate.test.ts`

**Interfaces:**
- Consumes: `config.layerTwo` (`moduleSeconds`, `presenceBands`, `modeRules`, `regionFadeSeconds`), `ArrTrack`, `Mode`, `ModeTemplate`, `TemplateRegion`.
- Produces: `buildModeTemplate(tracks: ArrTrack[], mode: Mode, cfg = config): ModeTemplate`. Regions are module-relative (`0..moduleSeconds`). `continuous` → full module; `active`/`sparse` → the config band; `absent` → omitted. Density (overlap count) is maximal near `moduleSeconds/2`.

- [ ] **Step 1: Write the failing test `src/arrange/buildModeTemplate.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { buildModeTemplate } from '@/arrange/buildModeTemplate';
import type { ArrTrack } from '@/arrange/types';
import { config } from '@/config';

const D = config.layerTwo.moduleSeconds;
const t = (id: string, category: ArrTrack['category']): ArrTrack => ({
  id, category, label: id, sample: { name: id, path: id, bytes: 1 }, ceilingDb: 0, locked: false,
});
const tracks: ArrTrack[] = [
  t('n', 'NOISE'), t('i', 'ISO'), t('pad', 'PAD'), t('bass', 'BASS'), t('fx', 'FX'),
];
const byTrack = (tpl: ReturnType<typeof buildModeTemplate>, id: string) =>
  tpl.regions.find((r) => r.trackId === id);

describe('buildModeTemplate', () => {
  it('gives continuous (bed) tracks a full-module region', () => {
    const tpl = buildModeTemplate(tracks, 'RETURN');
    const noise = byTrack(tpl, 'n')!;
    expect(noise.enterSec).toBeCloseTo(0, 6);
    expect(noise.exitSec).toBeCloseTo(D, 6);
  });
  it('omits absent categories (IMMERSION drops BASS/PAD/FX)', () => {
    const tpl = buildModeTemplate(tracks, 'IMMERSION');
    expect(byTrack(tpl, 'pad')).toBeUndefined();
    expect(byTrack(tpl, 'bass')).toBeUndefined();
    expect(byTrack(tpl, 'fx')).toBeUndefined();
    expect(byTrack(tpl, 'n')).toBeDefined(); // bed stays
  });
  it('places sparse regions narrower and nearer the peak than active', () => {
    const tpl = buildModeTemplate(tracks, 'RETURN');
    const pad = byTrack(tpl, 'pad')!;   // active
    const fx = byTrack(tpl, 'fx')!;     // active in RETURN
    const widthPad = pad.exitSec - pad.enterSec;
    // sparse example via RELAXATION (MELODY sparse) — use a MELODY track
    const relax = buildModeTemplate([t('mel', 'MELODY'), t('n', 'NOISE')], 'RELAXATION');
    const mel = relax.regions.find((r) => r.trackId === 'mel')!;
    expect(mel.exitSec - mel.enterSec).toBeLessThan(widthPad);
    expect(fx).toBeDefined();
  });
  it('density (overlapping regions) peaks near the module midpoint', () => {
    const tpl = buildModeTemplate(tracks, 'RETURN');
    const count = (s: number) =>
      tpl.regions.filter((r) => s > r.enterSec && s < r.exitSec).length;
    expect(count(D / 2)).toBeGreaterThan(count(D * 0.05));
    expect(count(D / 2)).toBeGreaterThan(count(D * 0.95));
  });
});
```

- [ ] **Step 2: Run it to verify failure**

Run: `npx vitest run src/arrange/buildModeTemplate.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/arrange/buildModeTemplate.ts`**

```ts
import { config as defaultConfig, type EcosonicConfig } from '@/config';
import type { ArrTrack, Mode, ModeTemplate, Presence, TemplateRegion } from '@/arrange/types';

/** Build one reusable Wave Module template from the config mode rules. Regions are
 *  module-relative [0, moduleSeconds]; overlap peaks near the midpoint by construction. */
export function buildModeTemplate(
  tracks: ArrTrack[],
  mode: Mode,
  cfg: EcosonicConfig = defaultConfig,
): ModeTemplate {
  const { moduleSeconds: D, presenceBands, modeRules, regionFadeSeconds } = cfg.layerTwo;
  const rule = modeRules[mode];
  const regions: TemplateRegion[] = [];

  tracks.forEach((track, i) => {
    const presence = rule[track.category] as Presence;
    if (presence === 'absent') return;
    const [lo, hi] = presenceBands[presence];
    // Small per-index offset so equal-tier tracks don't stack identically (deterministic).
    const jitter = (((i % 5) - 2) / 2) * 0.02 * D; // ±2% of D
    let enterSec = Math.max(0, lo * D + jitter);
    let exitSec = Math.min(D, hi * D + jitter);
    if (exitSec <= enterSec) { enterSec = lo * D; exitSec = hi * D; }
    const width = exitSec - enterSec;
    const fade = Math.min(regionFadeSeconds, width / 2);
    regions.push({ trackId: track.id, enterSec, exitSec, fadeInSec: fade, fadeOutSec: fade });
  });

  return { mode, regions };
}
```

- [ ] **Step 4: Run tests → PASS**

Run: `npx vitest run src/arrange/buildModeTemplate.test.ts`

- [ ] **Step 5: Typecheck + commit**

```powershell
npx tsc --noEmit
git add src/arrange/buildModeTemplate.ts src/arrange/buildModeTemplate.test.ts
git commit -m "feat(layer2): buildModeTemplate from config mode rules"
```

---

### Task 6: `buildSequence` — duration → module instances + bridges

**Files:**
- Create: `src/arrange/buildSequence.ts`
- Test: `src/arrange/buildSequence.test.ts`

**Interfaces:**
- Consumes: `config.layerTwo` (`moduleSeconds`, `bridgeSeconds`, `modes`), `ModuleInstance`, `Bridge`, `Mode`.
- Produces: `buildSequence(totalSecTarget: number, cfg = config): { sequence: ModuleInstance[]; bridges: Bridge[]; totalSec: number }`. Count = `max(1, round(totalSecTarget / moduleSeconds))`; modes cycle `cfg.layerTwo.modes`; instances overlap by `bridgeSeconds`; `totalSec = n·moduleSeconds − (n−1)·bridgeSeconds`.

- [ ] **Step 1: Write the failing test `src/arrange/buildSequence.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { buildSequence } from '@/arrange/buildSequence';
import { config } from '@/config';

const { moduleSeconds: M, bridgeSeconds: B } = config.layerTwo;

describe('buildSequence', () => {
  it('rounds duration to a module count (30 min → 3)', () => {
    const { sequence } = buildSequence(30 * 60);
    expect(sequence).toHaveLength(3);
  });
  it('always has at least one module', () => {
    expect(buildSequence(1).sequence).toHaveLength(1);
  });
  it('cycles the mode palette', () => {
    const { sequence } = buildSequence(40 * 60); // 4 modules
    expect(sequence.map((m) => m.mode)).toEqual(['RELAXATION', 'IMMERSION', 'RETURN', 'RELAXATION']);
  });
  it('overlaps consecutive modules by bridgeSeconds and reports totalSec', () => {
    const { sequence, bridges, totalSec } = buildSequence(30 * 60);
    expect(sequence[1].startSec).toBeCloseTo(M - B, 6);
    expect(bridges).toHaveLength(2);
    expect(bridges[0].overlapSec).toBe(B);
    expect(totalSec).toBeCloseTo(3 * M - 2 * B, 6);
  });
});
```

- [ ] **Step 2: Run it to verify failure**

Run: `npx vitest run src/arrange/buildSequence.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/arrange/buildSequence.ts`**

```ts
import { config as defaultConfig, type EcosonicConfig } from '@/config';
import type { Bridge, Mode, ModuleInstance } from '@/arrange/types';

export function buildSequence(
  totalSecTarget: number,
  cfg: EcosonicConfig = defaultConfig,
): { sequence: ModuleInstance[]; bridges: Bridge[]; totalSec: number } {
  const { moduleSeconds: M, bridgeSeconds: B, modes } = cfg.layerTwo;
  const n = Math.max(1, Math.round(totalSecTarget / M));

  const sequence: ModuleInstance[] = [];
  for (let i = 0; i < n; i++) {
    sequence.push({
      id: `mod-${i}`,
      mode: modes[i % modes.length] as Mode,
      startSec: i * (M - B),
      durationSec: M,
    });
  }

  const bridges: Bridge[] = [];
  for (let i = 0; i < n - 1; i++) {
    bridges.push({
      id: `bridge-${i}`,
      fromInstanceId: sequence[i].id,
      toInstanceId: sequence[i + 1].id,
      overlapSec: B,
    });
  }

  const totalSec = n * M - (n - 1) * B;
  return { sequence, bridges, totalSec };
}
```

- [ ] **Step 4: Run tests → PASS**

Run: `npx vitest run src/arrange/buildSequence.test.ts`

- [ ] **Step 5: Typecheck + commit**

```powershell
npx tsc --noEmit
git add src/arrange/buildSequence.ts src/arrange/buildSequence.test.ts
git commit -m "feat(layer2): buildSequence duration→instances+bridges"
```

---

### Task 7: `buildComposition` — assemble the whole thing

**Files:**
- Create: `src/arrange/buildComposition.ts`
- Test: `src/arrange/buildComposition.test.ts`

**Interfaces:**
- Consumes: `buildModeTemplate`, `buildSequence`, `config.layerTwo.modes`, `ArrTrack`, `Composition`.
- Produces: `buildComposition(input: { tracks: ArrTrack[]; tuningHz: number; masterDb: number }, totalSecTarget: number, cfg = config): Composition`. Templates built for all 3 modes; sequence + bridges from `buildSequence`; `totalSec` from the sequence.

- [ ] **Step 1: Write the failing test `src/arrange/buildComposition.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { buildComposition } from '@/arrange/buildComposition';
import type { ArrTrack } from '@/arrange/types';

const t = (id: string, category: ArrTrack['category']): ArrTrack => ({
  id, category, label: id, sample: { name: id, path: id, bytes: 1 }, ceilingDb: 0, locked: false,
});
const input = {
  tracks: [t('n', 'NOISE'), t('pad', 'PAD')],
  tuningHz: 440,
  masterDb: 0,
};

describe('buildComposition', () => {
  it('builds a template for every mode', () => {
    const c = buildComposition(input, 30 * 60);
    expect(Object.keys(c.templates).sort()).toEqual(['IMMERSION', 'RELAXATION', 'RETURN']);
  });
  it('carries the selection and passthrough values', () => {
    const c = buildComposition(input, 30 * 60);
    expect(c.tracks).toHaveLength(2);
    expect(c.tuningHz).toBe(440);
    expect(c.masterDb).toBe(0);
  });
  it('has a sequence, bridges, and a positive totalSec', () => {
    const c = buildComposition(input, 30 * 60);
    expect(c.sequence.length).toBeGreaterThan(0);
    expect(c.bridges.length).toBe(c.sequence.length - 1);
    expect(c.totalSec).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run it to verify failure**

Run: `npx vitest run src/arrange/buildComposition.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/arrange/buildComposition.ts`**

```ts
import { config as defaultConfig, type EcosonicConfig } from '@/config';
import type { ArrTrack, Composition, Mode, ModeTemplate } from '@/arrange/types';
import { buildModeTemplate } from '@/arrange/buildModeTemplate';
import { buildSequence } from '@/arrange/buildSequence';

export function buildComposition(
  input: { tracks: ArrTrack[]; tuningHz: number; masterDb: number },
  totalSecTarget: number,
  cfg: EcosonicConfig = defaultConfig,
): Composition {
  const templates = {} as Record<Mode, ModeTemplate>;
  for (const mode of cfg.layerTwo.modes) {
    templates[mode] = buildModeTemplate(input.tracks, mode, cfg);
  }
  const { sequence, bridges, totalSec } = buildSequence(totalSecTarget, cfg);
  return {
    tracks: input.tracks,
    templates,
    sequence,
    bridges,
    totalSec,
    tuningHz: input.tuningHz,
    masterDb: input.masterDb,
  };
}
```

- [ ] **Step 4: Run tests → PASS**

Run: `npx vitest run src/arrange/buildComposition.test.ts`

- [ ] **Step 5: Full suite + typecheck + commit**

```powershell
npx vitest run
npx tsc --noEmit
git add src/arrange/buildComposition.ts src/arrange/buildComposition.test.ts
git commit -m "feat(layer2): buildComposition assembles templates+sequence"
```

---

## Part 1 done — what's next

Part 1 delivers the pure, fully-tested arrangement core. Later parts (separate plans):
- **Part 2:** `Layer.setEnvelope` / `AudioEngine.setTrackEnvelope`, `arrangementStore`, `ArrangementScheduler` (runtime; browser-verified).
- **Part 3:** `/layer2` route + handoff snapshot + Module Designer UI (draggable clips).
- **Part 4:** Composition view (module track, bridge handles, density summary) + transport.

# Gen-B Live Scheduler (Module Scale) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the module designer's playback live-steerable — change drift / nudge upcoming entrances mid-play without stopping — plus snapshot export (JSON arrangement + WAV render), per [the spec](../specs/2026-07-10-gen-b-live-scheduler-design.md).

**Architecture:** A pure seeded splice function (`steerModule`) redraws only the un-played future of `moduleRegions` at the playhead; played history is kept verbatim. The store gains `live`/`steer`; the existing `useModuleScheduler` needs **zero changes** (it already follows region data per tick — a steer is just a bigger version of a drag-while-playing). Export is snapshot-only: JSON serializes the region table; WAV renders offline in an `OfflineAudioContext` mirroring live playback (looping source per region, envelope × ceiling × master), never touching the live graph.

**Tech Stack:** TypeScript 5, Zod 4 (file-format validation), Vitest 4 (`npx vitest run <file>`, jsdom env — **no** `OfflineAudioContext`, so render glue is manually verified), Zustand 5, Next.js 16 + React 19. Path alias `@` → `src`.

## Global Constraints

- **Determinism:** no `Math.random()` / `Date.now()` anywhere in `src/arrange/**` generator/steer code. Steer seeds are internal counters.
- **Drift labels are exactly** `STRICT | MODERATE | EXPLORATORY`; modes exactly `INTRODUCTION | DEEP_RELAXATION | RETURN`.
- **Stack order (bottom→top) is exactly** the existing `STACK_ORDER` in `src/arrange/types.ts`: `NOISE, ELEMENT, ELEMENT_SUB, FX, ISO, PLANET, PAD, BASS, ARP, MELODY`.
- **Reuse, don't duplicate:** draws use the existing `sampleRange` (exported from `generateModeTemplate.ts` in Task 1), `makeRng`, `regionEnvAt`, `validateTemplate`, `dbToGain`, `resolveSampleUrl`. Do **not** modify `useModuleScheduler.ts` or `Layer.ts`.
- **Grammar exceptions stay data-driven:** BASS `fadeIn {canon:0, half:0}` and spanning NOISE `exit:'MODULE_END', fadeOut {canon:0, half:0}` come from `config.layerTwo.generation.modeRules` — never hardcode them in steer logic.
- **Next.js guard (AGENTS.md):** before editing any component in `src/components/**` (Tasks 3, 4, 6), read the relevant guide in `node_modules/next/dist/docs/`. All other tasks are framework-agnostic TS.
- **Snapshot semantics:** export never mutates store state and never pauses/steers playback.

## File Structure

| File | Responsibility |
|---|---|
| `src/arrange/generate/generateModeTemplate.ts` | **Modify** — export the existing `sampleRange` helper. |
| `src/arrange/generate/steerModule.ts` | **Create** — pure seeded splice: `steerModule`, `nudgeOptions`, `SteerNudge`, steer constants. |
| `src/arrange/arrangementStore.ts` | **Modify** — `live`, `setLive`, `steer`, drift-routing, `importArrangement`. |
| `src/arrange/arrangementFile.ts` | **Create** — JSON arrangement format: `serializeArrangement`, `parseArrangement` (zod-validated). |
| `src/audio/wavEncode.ts` | **Create** — `encodeWavPcm16` (pure PCM16 WAV encoder). |
| `src/arrange/render/envelopeCurve.ts` | **Create** — `envelopeCurve` (pure gain-curve sampler for `setValueCurveAtTime`). |
| `src/arrange/render/renderModuleWav.ts` | **Create** — `renderModuleToWav` (OfflineAudioContext glue → WAV Blob). |
| `src/components/layer2/ArrangeScreen.tsx` | **Modify** — Live toggle, scrub disable, Export/Import buttons, WAV render button. |
| `src/components/layer2/ModuleDesigner.tsx` | **Modify** — per-lane nudge buttons while live. |
| `docs/ROADMAP.md`, `docs/PRD.md` | **Modify** (Task 7) — record Gen-B module scale as built. |

---

### Task 1: `steerModule` — the pure seeded splice

**Files:**
- Modify: `src/arrange/generate/generateModeTemplate.ts:10` (export `sampleRange`)
- Create: `src/arrange/generate/steerModule.ts`
- Test: `src/arrange/generate/steerModule.test.ts`

**Interfaces:**
- Consumes: `sampleRange(r: GenRange, scale: number, rng: RNG, D: number): number` (exported this task); `makeRng(seed): RNG`; `validateTemplate(template, tracks, cfg?)` (tests); `STACK_ORDER`, `BED_CATEGORIES`, types from `@/arrange/types`; `config.layerTwo.{moduleSeconds, secondElementEnterSec, generation}`.
- Produces (used by Tasks 2–3):
  - `type SteerNudge = { kind: 'IN_NEXT'; trackId: string } | { kind: 'HOLD_BACK'; trackId: string }`
  - `steerModule(regions: TemplateRegion[], playheadSec: number, tracks: ArrTrack[], mode: Mode, drift: Drift, seed: number, nudge?: SteerNudge, cfg?: EcosonicConfig): TemplateRegion[]`
  - `nudgeOptions(track: ArrTrack, regions: TemplateRegion[], tracks: ArrTrack[], mode: Mode, playheadSec: number, cfg?: EcosonicConfig): { inNext: boolean; holdBack: boolean }`
  - Constants: `IN_NEXT_DELAY_SEC = 1`, `HOLD_BACK_STEP_SEC = 60`, `SQUEEZE_MIN_WIDTH_SEC = 30`

- [ ] **Step 1: Export `sampleRange`** — in `src/arrange/generate/generateModeTemplate.ts`, change line 10 from `function sampleRange(` to `export function sampleRange(` (JSDoc stays).

- [ ] **Step 2: Write the failing test** — create `src/arrange/generate/steerModule.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { steerModule, nudgeOptions, IN_NEXT_DELAY_SEC } from '@/arrange/generate/steerModule';
import { generateModeTemplate } from '@/arrange/generate/generateModeTemplate';
import { validateTemplate } from '@/arrange/generate/validateTemplate';
import type { ArrTrack } from '@/arrange/types';
import { config } from '@/config';

const D = config.layerTwo.moduleSeconds;
const t = (id: string, category: ArrTrack['category']): ArrTrack => ({
  id, category, label: id, sample: { name: id, path: id, bytes: 1 }, ceilingDb: 0, locked: false,
});
const introTracks: ArrTrack[] = [
  t('n', 'NOISE'), t('e', 'ELEMENT'), t('iso', 'ISO'), t('pl', 'PLANET'),
  t('pad', 'PAD'), t('bass', 'BASS'), t('arp', 'ARP'), t('mel', 'MELODY'),
];
const base = (seed = 1) => generateModeTemplate(introTracks, 'INTRODUCTION', 'MODERATE', seed).regions;
const find = (rs: ReturnType<typeof base>, id: string) => rs.find((r) => r.trackId === id);

describe('steerModule', () => {
  it('is deterministic — same inputs yield the same splice', () => {
    const rs = base(3);
    const a = steerModule(rs, 300, introTracks, 'INTRODUCTION', 'MODERATE', 42);
    const b = steerModule(rs, 300, introTracks, 'INTRODUCTION', 'MODERATE', 42);
    expect(a).toEqual(b);
  });
  it('preserves the past verbatim and keeps active entrances/fade-ins', () => {
    const rs = base(5);
    const out = steerModule(rs, 300, introTracks, 'INTRODUCTION', 'EXPLORATORY', 7);
    for (const r of rs) {
      const o = find(out, r.trackId);
      if (r.exitSec <= 300) expect(o).toEqual(r); // fully past: untouched
      else if (r.enterSec <= 300) {               // active: entrance history kept
        expect(o!.enterSec).toBe(r.enterSec);
        expect(o!.fadeInSec).toBe(r.fadeInSec);
        expect(o!.exitSec).toBeGreaterThanOrEqual(300);
      }
    }
  });
  it('pending layers redraw with enter strictly after the playhead', () => {
    const rs = base(2);
    const out = steerModule(rs, 200, introTracks, 'INTRODUCTION', 'MODERATE', 11);
    for (const r of rs) {
      if (r.enterSec > 200) expect(find(out, r.trackId)!.enterSec).toBeGreaterThan(200);
    }
  });
  it('spliced results stay invariant-legal (I1–I6) across seeds and playheads', () => {
    for (let s = 0; s < 30; s++) {
      const rs = base(s);
      for (const at of [90, 240, 420]) {
        const out = steerModule(rs, at, introTracks, 'INTRODUCTION', 'MODERATE', s + 100);
        const res = validateTemplate({ mode: 'INTRODUCTION', regions: out }, introTracks);
        expect(res.ok, `seed ${s} @ ${at}s: ${JSON.stringify(res.violations)}`).toBe(true);
      }
    }
  });
  it('a plain steer never adds a layer that was not in the arrangement', () => {
    const rs = base(4).filter((r) => r.trackId !== 'mel');
    const out = steerModule(rs, 200, introTracks, 'INTRODUCTION', 'EXPLORATORY', 9);
    expect(find(out, 'mel')).toBeUndefined();
  });
  it('IN_NEXT brings an eligible pending layer in near now — even a dropped one', () => {
    const rs = base(4).filter((r) => r.trackId !== 'mel'); // MELODY dropped
    const out = steerModule(rs, 480, introTracks, 'INTRODUCTION', 'MODERATE', 9, { kind: 'IN_NEXT', trackId: 'mel' });
    const mel = find(out, 'mel')!;
    expect(mel.enterSec).toBeCloseTo(480 + IN_NEXT_DELAY_SEC, 5);
    expect(mel.exitSec).toBeGreaterThan(mel.enterSec);
  });
  it('HOLD_BACK pushes a pending entrance later than any un-nudged draw', () => {
    const rs = base(6);
    const at = 300; // MELODY (canon 390) is pending here
    const plain = steerModule(rs, at, introTracks, 'INTRODUCTION', 'MODERATE', 21);
    const held = steerModule(rs, at, introTracks, 'INTRODUCTION', 'MODERATE', 21, { kind: 'HOLD_BACK', trackId: 'mel' });
    expect(find(held, 'mel')!.enterSec).toBeGreaterThan(find(plain, 'mel')!.enterSec);
  });
  it('squeeze rule: a pending non-bed layer with no room left is dropped; the bed survives', () => {
    const rs = base(8);
    const out = steerModule(rs, D - 10, introTracks, 'INTRODUCTION', 'MODERATE', 13);
    const melIn = rs.find((r) => r.trackId === 'mel');
    if (melIn && melIn.enterSec > D - 10) expect(find(out, 'mel')).toBeUndefined();
    expect(find(out, 'n')).toBeDefined(); // NOISE (bed) always present
  });
  it('BASS still enters with no fade-in after a steer (data-driven R4)', () => {
    // Steer early enough that BASS (canon 240) is still pending.
    const rs = base(7);
    const out = steerModule(rs, 60, introTracks, 'INTRODUCTION', 'MODERATE', 17);
    expect(find(out, 'bass')!.fadeInSec).toBe(0);
  });
});

describe('nudgeOptions', () => {
  it('an entered layer gets no nudges', () => {
    const rs = base(1); // NOISE enters at 0
    expect(nudgeOptions(introTracks[0], rs, introTracks, 'INTRODUCTION', 100)).toEqual({ inNext: false, holdBack: false });
  });
  it('a pending layer whose `after` is active can come in; one whose `after` is pending cannot', () => {
    const rs = base(1);
    const iso = find(rs, 'iso')!;
    const beforeIso = Math.max(0, iso.enterSec - 30); // ISO not yet entered
    const pl = introTracks.find((x) => x.id === 'pl')!; // PLANET.after = ISO
    expect(nudgeOptions(pl, rs, introTracks, 'INTRODUCTION', beforeIso).inNext).toBe(false);
    const afterIso = iso.enterSec + 10; // ISO active now
    if (find(rs, 'pl')!.enterSec > afterIso) {
      expect(nudgeOptions(pl, rs, introTracks, 'INTRODUCTION', afterIso).inNext).toBe(true);
    }
  });
  it('holdBack requires an existing pending region', () => {
    const rs = base(1).filter((r) => r.trackId !== 'mel');
    const mel = introTracks.find((x) => x.id === 'mel')!;
    expect(nudgeOptions(mel, rs, introTracks, 'INTRODUCTION', 300).holdBack).toBe(false);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/arrange/generate/steerModule.test.ts`
Expected: FAIL — cannot find module `@/arrange/generate/steerModule`.

- [ ] **Step 4: Write the implementation** — create `src/arrange/generate/steerModule.ts`:

```ts
import { config as defaultConfig, type EcosonicConfig } from '@/config';
import type { Category } from '@/types';
import type { ArrTrack, Drift, Mode, TemplateRegion } from '@/arrange/types';
import { STACK_ORDER, BED_CATEGORIES } from '@/arrange/types';
import { makeRng } from '@/arrange/prng';
import { sampleRange } from '@/arrange/generate/generateModeTemplate';

/** Steering verbs (spec §3): bring an eligible layer in ~now, or push a pending one later. */
export type SteerNudge =
  | { kind: 'IN_NEXT'; trackId: string }
  | { kind: 'HOLD_BACK'; trackId: string };

/** How soon an IN_NEXT entrance lands after the nudge (sec). */
export const IN_NEXT_DELAY_SEC = 1;
/** How far a HOLD_BACK pushes a pending entrance (sec) — the brief's minute-scale cadence. */
export const HOLD_BACK_STEP_SEC = 60;
/** A pending layer needs at least this much room left, or it is dropped for the pass (non-bed). */
export const SQUEEZE_MIN_WIDTH_SEC = 30;

/** Splice a live steer into the module at the playhead. Pure and seeded.
 *  Past regions are verbatim; active regions keep their entrance and redraw exit/fadeOut;
 *  pending layers redraw fully at the current drift (ordering enforced against the actual,
 *  possibly historical, entrances). A plain steer never adds a layer; IN_NEXT can. */
export function steerModule(
  regions: TemplateRegion[],
  playheadSec: number,
  tracks: ArrTrack[],
  mode: Mode,
  drift: Drift,
  seed: number,
  nudge?: SteerNudge,
  cfg: EcosonicConfig = defaultConfig,
): TemplateRegion[] {
  const rng = makeRng(seed);
  const D = cfg.layerTwo.moduleSeconds;
  const t = Math.max(0, Math.min(playheadSec, D));
  const gen = cfg.layerTwo.generation;
  const rule = gen.modeRules[mode];
  const scale = gen.driftScales[drift];
  const minGap = gen.minGapSec;
  const secondEnter = cfg.layerTwo.secondElementEnterSec;

  const byTrack = new Map(regions.map((r) => [r.trackId, r]));
  const out = new Map<string, TemplateRegion>();

  // Earliest committed entrance per category — the history redraws must respect (R2).
  const earliestEnter = new Map<Category, number>();
  const note = (cat: Category, enter: number) =>
    earliestEnter.set(cat, Math.min(earliestEnter.get(cat) ?? Infinity, enter));

  // 1. Keep the past verbatim; keep active regions' entrances (their exits redraw below).
  for (const tr of tracks) {
    const r = byTrack.get(tr.id);
    if (!r || r.enterSec > t) continue;
    out.set(tr.id, { ...r });
    note(tr.category, r.enterSec);
  }

  // 2. Redraw active regions' future events (exit + fadeOut) within the grammar, clamped ≥ t.
  for (const tr of tracks) {
    const r = out.get(tr.id);
    const lr = rule[tr.category];
    if (!r || !lr || r.exitSec <= t) continue; // past stays byte-for-byte
    const exit = lr.exit === 'MODULE_END' ? D : Math.min(D, Math.max(t, sampleRange(lr.exit, scale, rng, D)));
    const fadeOut = sampleRange(lr.fadeOut, scale, rng, D);
    const half = (exit - r.enterSec) / 2;
    out.set(tr.id, { ...r, exitSec: Math.max(r.enterSec, exit), fadeOutSec: Math.min(fadeOut, half) });
  }

  // 3. Redraw pending layers bottom-up so `after` references (historical or freshly drawn) exist.
  const seenElementish: Partial<Record<Category, number>> = {};
  for (const tr of tracks) {
    if ((tr.category === 'ELEMENT' || tr.category === 'ELEMENT_SUB') && out.has(tr.id)) {
      seenElementish[tr.category] = (seenElementish[tr.category] ?? 0) + 1;
    }
  }
  for (const cat of STACK_ORDER) {
    for (const tr of tracks) {
      if (tr.category !== cat || out.has(tr.id)) continue;
      const lr = rule[cat];
      if (!lr) continue;
      const isInNext = nudge?.kind === 'IN_NEXT' && nudge.trackId === tr.id;
      if (!byTrack.has(tr.id) && !isInNext) continue; // plain steers never add layers

      let enter: number;
      if (isInNext) {
        enter = t + IN_NEXT_DELAY_SEC; // pinned — eligibility is nudgeOptions' job
      } else {
        enter = Math.max(t + IN_NEXT_DELAY_SEC, sampleRange(lr.enter, scale, rng, D));
        const ref = lr.after ? earliestEnter.get(lr.after) : undefined;
        if (ref !== undefined) enter = Math.max(enter, ref + minGap);
        if (nudge?.kind === 'HOLD_BACK' && nudge.trackId === tr.id) enter += HOLD_BACK_STEP_SEC;
        const isElementish = cat === 'ELEMENT' || cat === 'ELEMENT_SUB';
        if (isElementish && (seenElementish[cat] ?? 0) >= 1) enter = Math.max(enter, secondEnter);
      }

      const exitDrawn = lr.exit === 'MODULE_END' ? D : Math.min(D, sampleRange(lr.exit, scale, rng, D));
      const exit = Math.max(enter, exitDrawn);
      // Squeeze rule: too little room left → drop (non-bed) or clamp to the minimum window (bed).
      if (exit - enter < SQUEEZE_MIN_WIDTH_SEC) {
        if (!BED_CATEGORIES.includes(cat)) continue;
        enter = Math.max(t, Math.min(enter, D - SQUEEZE_MIN_WIDTH_SEC));
      }
      const fadeIn = sampleRange(lr.fadeIn, scale, rng, D);
      const fadeOut = sampleRange(lr.fadeOut, scale, rng, D);
      const width = Math.max(0, (lr.exit === 'MODULE_END' ? D : exit) - enter);
      if (cat === 'ELEMENT' || cat === 'ELEMENT_SUB') seenElementish[cat] = (seenElementish[cat] ?? 0) + 1;
      note(cat, enter);
      out.set(tr.id, {
        trackId: tr.id,
        enterSec: enter,
        exitSec: Math.max(enter, lr.exit === 'MODULE_END' ? D : exit),
        fadeInSec: Math.min(fadeIn, width / 2),
        fadeOutSec: Math.min(fadeOut, width / 2),
      });
    }
  }

  // Stable output order: keep the input's region order, append newly added layers at the end.
  const order = new Map(regions.map((r, i) => [r.trackId, i]));
  return [...out.values()].sort(
    (a, b) => (order.get(a.trackId) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.trackId) ?? Number.MAX_SAFE_INTEGER),
  );
}

/** Which nudges are legal for a track right now (drives the UI buttons and guards the store). */
export function nudgeOptions(
  track: ArrTrack,
  regions: TemplateRegion[],
  tracks: ArrTrack[],
  mode: Mode,
  playheadSec: number,
  cfg: EcosonicConfig = defaultConfig,
): { inNext: boolean; holdBack: boolean } {
  const lr = cfg.layerTwo.generation.modeRules[mode][track.category];
  if (!lr) return { inNext: false, holdBack: false };
  const r = regions.find((x) => x.trackId === track.id);
  if (r && r.enterSec <= playheadSec) return { inNext: false, holdBack: false }; // already in (or done)
  const room = playheadSec + IN_NEXT_DELAY_SEC <= cfg.layerTwo.moduleSeconds - SQUEEZE_MIN_WIDTH_SEC;
  let afterOk = true;
  if (lr.after) {
    const catOf = new Map(tracks.map((tr) => [tr.id, tr.category]));
    afterOk = regions.some((x) => catOf.get(x.trackId) === lr.after && x.enterSec <= playheadSec);
  }
  return { inNext: room && afterOk, holdBack: room && !!r };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/arrange/generate/steerModule.test.ts`
Expected: PASS (all 12 tests). If the invariant sweep fails on some seed, fix `steerModule` (usually an ordering or squeeze clamp), never the assertion.

- [ ] **Step 6: Run the neighboring suites to catch regressions from the `sampleRange` export**

Run: `npx vitest run src/arrange/generate`
Expected: PASS (generateModeTemplate / validateTemplate / generateComposition suites unchanged).

- [ ] **Step 7: Commit**

```bash
git add src/arrange/generate/generateModeTemplate.ts src/arrange/generate/steerModule.ts src/arrange/generate/steerModule.test.ts
git commit -m "feat(arrange): steerModule — pure seeded splice for live steering (drift + nudges)"
```

---

### Task 2: Store — `live`, `steer`, drift routing

**Files:**
- Modify: `src/arrange/arrangementStore.ts`
- Test: `src/arrange/arrangementStore.test.ts` (append)

**Interfaces:**
- Consumes: `steerModule`, `SteerNudge` (Task 1).
- Produces (used by Tasks 3–4 UI): state `live: boolean`; actions `setLive(b: boolean): void`, `steer(nudge?: SteerNudge): void`. `setDrift(d)` now also steers when `live && playing`.

- [ ] **Step 1: Write the failing test** — append inside the `describe('arrangementStore', …)` block of `src/arrange/arrangementStore.test.ts`. Also add `t('mel', 'MELODY')` to a local selection so a pending layer exists mid-module:

```ts
  const selLive = { element: 'WATER' as const, tracks: [t('n', 'NOISE'), t('pad', 'PAD'), t('mel', 'MELODY')], tuningHz: 440, masterDb: 0 };

  it('live defaults to false and toggles', () => {
    expect(store.getState().live).toBe(false);
    store.getState().setLive(true);
    expect(store.getState().live).toBe(true);
  });
  it('steer redraws only the future and leaves position/playing untouched', () => {
    store.getState().initFrom(selLive, 30);
    store.getState().play();
    store.getState().seek(300);
    const before = store.getState().moduleRegions;
    const noiseBefore = before.find((r) => r.trackId === 'n')!;
    store.getState().steer();
    const after = store.getState().moduleRegions;
    expect(store.getState().positionSec).toBe(300);
    expect(store.getState().playing).toBe(true);
    const noiseAfter = after.find((r) => r.trackId === 'n')!;
    expect(noiseAfter.enterSec).toBe(noiseBefore.enterSec); // active bed keeps its entrance
    const mel = after.find((r) => r.trackId === 'mel');
    if (mel) expect(mel.enterSec).toBeGreaterThan(300); // pending layer redrew into the future
  });
  it('setDrift while live+playing steers; while not live it only sets drift', () => {
    store.getState().initFrom(selLive, 30);
    store.getState().seek(120);
    const frozen = store.getState().moduleRegions;
    store.getState().setDrift('EXPLORATORY'); // not live, not playing → regions untouched
    expect(store.getState().moduleRegions).toBe(frozen);
    store.getState().play();
    store.getState().setLive(true);
    store.getState().setDrift('STRICT'); // live steer
    expect(store.getState().drift).toBe('STRICT');
    expect(store.getState().moduleRegions).not.toBe(frozen);
  });
  it('steer accepts an IN_NEXT nudge', () => {
    store.getState().initFrom(selLive, 30);
    store.getState().play();
    store.getState().seek(60);
    store.getState().steer({ kind: 'IN_NEXT', trackId: 'mel' });
    const mel = store.getState().moduleRegions.find((r) => r.trackId === 'mel')!;
    expect(mel.enterSec).toBeCloseTo(61, 5); // t + IN_NEXT_DELAY_SEC
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/arrange/arrangementStore.test.ts`
Expected: FAIL — `live` is undefined / `steer` is not a function.

- [ ] **Step 3: Extend the store** — in `src/arrange/arrangementStore.ts`:

(a) Add to the imports:

```ts
import { steerModule, type SteerNudge } from '@/arrange/generate/steerModule';
```

(b) In the `ArrangementState` interface, after `drift: Drift;` add:

```ts
  live: boolean;
```

and after `generateModule: () => void;` add:

```ts
  setLive: (b: boolean) => void;
  /** Live steering: redraw the un-played future (optionally with a nudge), spliced at the playhead. */
  steer: (nudge?: SteerNudge) => void;
```

(c) Inside `createArrangementStore`, next to `let genSeed = 1;` add:

```ts
    let steerSeed = 1;
```

(d) Add `live: false,` to the initial state (after `drift: 'MODERATE',`).

(e) Replace `setDrift: (d) => set({ drift: d }),` with:

```ts
      setDrift: (d) => {
        set({ drift: d });
        const s = get();
        if (s.live && s.playing) s.steer(); // a live drift change is itself a steer (spec §3)
      },
```

and add after `generateModule: …`:

```ts
      setLive: (b) => set({ live: b }),
      steer: (nudge) =>
        set((s) => ({
          moduleRegions: steerModule(s.moduleRegions, s.positionSec, s.tracks, s.activeMode, s.drift, steerSeed++, nudge),
        })),
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/arrange/arrangementStore.test.ts`
Expected: PASS (all store tests, old and new).

- [ ] **Step 5: Commit**

```bash
git add src/arrange/arrangementStore.ts src/arrange/arrangementStore.test.ts
git commit -m "feat(arrange): live mode + steer action — drift changes steer while live"
```

---

### Task 3: UI — Live toggle, scrub disable, per-lane nudges

**Files:**
- Modify: `src/components/layer2/ArrangeScreen.tsx`
- Modify: `src/components/layer2/ModuleDesigner.tsx`

**Interfaces:**
- Consumes: store `live/setLive/steer` (Task 2); `nudgeOptions`, `SteerNudge` (Task 1).
- Produces: `ModuleDesigner` gains a `live: boolean` prop (steering UI shows only when true).

> **AGENTS.md guard:** before editing, read the client-components guide in `node_modules/next/dist/docs/`. Both files are already `'use client'` components; this task adds only standard React state/props.

- [ ] **Step 1: ArrangeScreen — selectors + Live toggle + scrub disable.** In `src/components/layer2/ArrangeScreen.tsx`:

(a) Add selectors next to the existing `useArrangement` calls:

```ts
  const live = useArrangement((s) => s.live);
  const setLive = useArrangement((s) => s.setLive);
```

(b) In the header transport `<div className="flex items-center gap-4">`, insert **before** the play/pause button:

```tsx
          <button
            type="button"
            onClick={() => setLive(!live)}
            aria-pressed={live}
            title="Live: steer drift and upcoming entrances while playing; off = the arrangement is frozen"
            className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs transition-calm ${
              live ? 'text-white' : 'bg-card text-muted-foreground hover:text-foreground'
            }`}
            style={live ? { background: 'var(--accent-ink)' } : undefined}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${live ? 'animate-pulse bg-white' : 'bg-muted-foreground'}`} aria-hidden />
            Live
          </button>
```

(c) On the scrub `<input type="range" …>`, add:

```tsx
            disabled={live && playing}
            title={live && playing ? 'Scrubbing is off while Live — the past is committed' : undefined}
```

and extend its className with ` disabled:cursor-not-allowed disabled:opacity-40`.

(d) Pass live-ness to the designer — replace the `<ModuleDesigner …/>` call with:

```tsx
        <ModuleDesigner
          tracks={tracks}
          regions={moduleRegions}
          trackDurations={trackDurations}
          positionSec={positionSec}
          showVolume={showVolume}
          live={live && playing}
        />
```

- [ ] **Step 2: ModuleDesigner — nudge buttons.** In `src/components/layer2/ModuleDesigner.tsx`:

(a) Add imports:

```ts
import { nudgeOptions } from '@/arrange/generate/steerModule';
```

(b) Add `live = false` to `ModuleDesigner`'s props (type `live?: boolean;` with the JSDoc `/** Steering active: show in-next / hold nudges on eligible pending lanes. */`).

(c) In `ModuleDesigner`, read what the nudge computation needs:

```ts
  const activeMode = useArrangement((s) => s.activeMode);
```

(d) Pass per-row options — replace the `<ClipRow …/>` call with:

```tsx
        <ClipRow
          key={track.id}
          track={track}
          region={regions.find((r) => r.trackId === track.id) ?? null}
          total={trackDurations[track.id]}
          D={D}
          showVolume={showVolume}
          nudges={live ? nudgeOptions(track, regions, tracks, activeMode, positionSec) : null}
        />
```

(e) In `ClipRow`, add to the props type and destructuring: `nudges: { inNext: boolean; holdBack: boolean } | null;`, read the steer action next to `updateModuleRegion`:

```ts
  const steer = useArrangement((s) => s.steer);
```

and inside the left label `<div className="w-28 shrink-0">`, after the sample-name div, add:

```tsx
        {nudges && (nudges.inNext || nudges.holdBack) && (
          <div className="mt-1 flex gap-1">
            {nudges.inNext && (
              <button
                type="button"
                onClick={() => steer({ kind: 'IN_NEXT', trackId: track.id })}
                title="Bring this layer in on the next beat of the grammar"
                className="rounded-full border border-border px-2 py-0.5 text-[10px] transition-calm hover:text-foreground"
              >
                in next
              </button>
            )}
            {nudges.holdBack && (
              <button
                type="button"
                onClick={() => steer({ kind: 'HOLD_BACK', trackId: track.id })}
                title="Push this layer's entrance later"
                className="rounded-full border border-border px-2 py-0.5 text-[10px] transition-calm hover:text-foreground"
              >
                hold
              </button>
            )}
          </div>
        )}
```

- [ ] **Step 3: Type-check and run the full arrange suites**

Run: `npx tsc --noEmit && npx vitest run src/arrange`
Expected: clean type-check; all arrange tests PASS.

- [ ] **Step 4: Manual verification**

Run: `npm run dev` → `/` → pick an element → Layer One → Continue to Layer Two.
Expected:
- A **Live** pill appears in the transport; toggling it while playing disables the scrub slider (dimmed).
- While Live + playing: switching drift makes upcoming clips visibly rearrange without an audio glitch; lanes whose layer hasn't entered show tiny **in next** / **hold** buttons; *in next* makes that layer enter ~now (audibly, with its fade; BASS enters hard); *hold* pushes its clip right.
- Toggling Live off mid-module: clips stay exactly where they are; playback continues; loop repeats the same arrangement; clips are still drag-editable.

- [ ] **Step 5: Commit**

```bash
git add src/components/layer2/ArrangeScreen.tsx src/components/layer2/ModuleDesigner.tsx
git commit -m "feat(layer2): Live toggle + per-lane in-next/hold nudges; scrub disabled while live"
```

---

### Task 4: JSON arrangement export/import

**Files:**
- Create: `src/arrange/arrangementFile.ts`
- Test: `src/arrange/arrangementFile.test.ts`
- Modify: `src/arrange/arrangementStore.ts` (+ test append), `src/components/layer2/ArrangeScreen.tsx`

**Interfaces:**
- Consumes: `Mode`, `Drift`, `TemplateRegion`, `ArrTrack` types; zod (`import { z } from 'zod'` — same dependency `src/config.ts` uses).
- Produces:
  - `type ArrangementFile = { version: 1; kind: 'ecosonic-arrangement'; mode: Mode; drift: Drift; regions: TemplateRegion[]; tracks: Array<{ id: string; category: string; sampleName: string; samplePath: string }> }`
  - `serializeArrangement(args: { mode: Mode; drift: Drift; regions: TemplateRegion[]; tracks: ArrTrack[] }): string`
  - `parseArrangement(json: string): ArrangementFile` (throws on shape mismatch)
  - Store action `importArrangement(file: ArrangementFile): void`

- [ ] **Step 1: Write the failing test** — create `src/arrange/arrangementFile.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { serializeArrangement, parseArrangement } from '@/arrange/arrangementFile';
import type { ArrTrack, TemplateRegion } from '@/arrange/types';

const tracks: ArrTrack[] = [
  { id: 'n', category: 'NOISE', label: 'n', sample: { name: 'noise.wav', path: 'w/noise.wav', bytes: 1 }, ceilingDb: 0, locked: false },
];
const regions: TemplateRegion[] = [{ trackId: 'n', enterSec: 0, exitSec: 600, fadeInSec: 60, fadeOutSec: 0 }];

describe('arrangement file', () => {
  it('round-trips through serialize → parse', () => {
    const text = serializeArrangement({ mode: 'INTRODUCTION', drift: 'MODERATE', regions, tracks });
    const file = parseArrangement(text);
    expect(file.version).toBe(1);
    expect(file.mode).toBe('INTRODUCTION');
    expect(file.drift).toBe('MODERATE');
    expect(file.regions).toEqual(regions);
    expect(file.tracks[0]).toEqual({ id: 'n', category: 'NOISE', sampleName: 'noise.wav', samplePath: 'w/noise.wav' });
  });
  it('rejects non-arrangement JSON and bad shapes', () => {
    expect(() => parseArrangement('{"hello":1}')).toThrow();
    expect(() => parseArrangement('not json at all')).toThrow();
    const wrongKind = JSON.stringify({ version: 1, kind: 'other', mode: 'INTRODUCTION', drift: 'MODERATE', regions: [], tracks: [] });
    expect(() => parseArrangement(wrongKind)).toThrow();
  });
});
```

And append to `src/arrange/arrangementStore.test.ts` (inside the describe):

```ts
  it('importArrangement applies mode, drift and known-track regions, resetting position', () => {
    store.getState().initFrom(sel, 30);
    store.getState().seek(200);
    store.getState().importArrangement({
      version: 1, kind: 'ecosonic-arrangement', mode: 'RETURN', drift: 'STRICT',
      regions: [
        { trackId: 'n', enterSec: 0, exitSec: 600, fadeInSec: 60, fadeOutSec: 60 },
        { trackId: 'ghost', enterSec: 10, exitSec: 20, fadeInSec: 0, fadeOutSec: 0 }, // unknown track: dropped
      ],
      tracks: [],
    });
    const s = store.getState();
    expect(s.activeMode).toBe('RETURN');
    expect(s.drift).toBe('STRICT');
    expect(s.positionSec).toBe(0);
    expect(s.moduleRegions.map((r) => r.trackId)).toEqual(['n']);
  });
```

- [ ] **Step 2: Run to verify both fail**

Run: `npx vitest run src/arrange/arrangementFile.test.ts src/arrange/arrangementStore.test.ts`
Expected: FAIL — module not found / `importArrangement` is not a function.

- [ ] **Step 3: Implement the file module** — create `src/arrange/arrangementFile.ts`:

```ts
import { z } from 'zod';
import type { ArrTrack, Drift, Mode, TemplateRegion } from '@/arrange/types';

const RegionSchema = z.object({
  trackId: z.string(),
  enterSec: z.number().nonnegative(),
  exitSec: z.number().nonnegative(),
  fadeInSec: z.number().nonnegative(),
  fadeOutSec: z.number().nonnegative(),
});
const FileSchema = z.object({
  version: z.literal(1),
  kind: z.literal('ecosonic-arrangement'),
  mode: z.enum(['INTRODUCTION', 'DEEP_RELAXATION', 'RETURN']),
  drift: z.enum(['STRICT', 'MODERATE', 'EXPLORATORY']),
  regions: z.array(RegionSchema),
  tracks: z.array(z.object({ id: z.string(), category: z.string(), sampleName: z.string(), samplePath: z.string() })),
});

export type ArrangementFile = z.infer<typeof FileSchema>;

/** Snapshot the current arrangement as a pretty-printed JSON string (spec §6). */
export function serializeArrangement(args: {
  mode: Mode; drift: Drift; regions: TemplateRegion[]; tracks: ArrTrack[];
}): string {
  const file: ArrangementFile = {
    version: 1,
    kind: 'ecosonic-arrangement',
    mode: args.mode,
    drift: args.drift,
    regions: args.regions,
    tracks: args.tracks.map((t) => ({ id: t.id, category: t.category, sampleName: t.sample.name, samplePath: t.sample.path })),
  };
  return JSON.stringify(file, null, 2);
}

/** Parse an exported arrangement; throws (zod/JSON error) on anything malformed. */
export function parseArrangement(json: string): ArrangementFile {
  return FileSchema.parse(JSON.parse(json));
}
```

- [ ] **Step 4: Store action** — in `src/arrange/arrangementStore.ts`, import the type:

```ts
import type { ArrangementFile } from '@/arrange/arrangementFile';
```

add to the interface (after `steer: …;`):

```ts
  /** Load a previously exported arrangement (regions filtered to the current tracks). */
  importArrangement: (file: ArrangementFile) => void;
```

and to the actions (after `steer: …,`):

```ts
      importArrangement: (file) =>
        set((s) => {
          const known = new Set(s.tracks.map((tr) => tr.id));
          return {
            activeMode: file.mode,
            drift: file.drift,
            moduleRegions: file.regions.filter((r) => known.has(r.trackId)),
            positionSec: 0,
          };
        }),
```

- [ ] **Step 5: Run to verify both pass**

Run: `npx vitest run src/arrange/arrangementFile.test.ts src/arrange/arrangementStore.test.ts`
Expected: PASS.

- [ ] **Step 6: UI buttons** — in `src/components/layer2/ArrangeScreen.tsx`:

(a) Imports:

```ts
import { useRef, useState, type CSSProperties } from 'react';
import { serializeArrangement, parseArrangement } from '@/arrange/arrangementFile';
```

(replace the existing `import { useState, type CSSProperties } from 'react';`).

(b) Selectors + handlers inside the component:

```ts
  const importArrangement = useArrangement((s) => s.importArrangement);
  const fileInput = useRef<HTMLInputElement>(null);

  const downloadBlob = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };
  const exportJson = () => {
    const text = serializeArrangement({ mode: activeMode, drift, regions: moduleRegions, tracks });
    downloadBlob(new Blob([text], { type: 'application/json' }), `ecosonic-${activeMode.toLowerCase()}.json`);
  };
  const importJson = async (f: File) => {
    try {
      importArrangement(parseArrangement(await f.text()));
    } catch {
      window.alert('Not a valid ECOSONIC arrangement file.');
    }
  };
```

(c) In the mode row, after the Volume `<label>…</label>`, add:

```tsx
          <span className="mx-2 h-4 w-px bg-border" aria-hidden />
          <button
            type="button"
            onClick={exportJson}
            className="rounded-full border border-border px-3 py-1 text-xs transition-calm hover:text-foreground"
          >
            Export JSON
          </button>
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="rounded-full border border-border px-3 py-1 text-xs transition-calm hover:text-foreground"
          >
            Import
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importJson(f);
              e.target.value = '';
            }}
          />
```

- [ ] **Step 7: Type-check + manual verification**

Run: `npx tsc --noEmit`
Then `npm run dev`: Export JSON downloads a file; editing a clip and re-importing the file restores the exported layout (mode + drift + clips); importing a random JSON shows the alert; exporting while Live+playing does not interrupt playback.

- [ ] **Step 8: Commit**

```bash
git add src/arrange/arrangementFile.ts src/arrange/arrangementFile.test.ts src/arrange/arrangementStore.ts src/arrange/arrangementStore.test.ts src/components/layer2/ArrangeScreen.tsx
git commit -m "feat(layer2): JSON arrangement export/import — snapshot semantics"
```

---

### Task 5: WAV building blocks — `envelopeCurve` + `encodeWavPcm16` (pure)

**Files:**
- Create: `src/arrange/render/envelopeCurve.ts`
- Create: `src/audio/wavEncode.ts`
- Tests: `src/arrange/render/envelopeCurve.test.ts`, `src/audio/wavEncode.test.ts`

**Interfaces:**
- Consumes: `regionEnvAt(r: RegionTiming, s: number): number` (existing).
- Produces (used by Task 6):
  - `envelopeCurve(region: RegionTiming, ceilingGain: number, stepSec?: number): Float32Array` — gain curve spanning `[enterSec, exitSec]` for `setValueCurveAtTime`.
  - `encodeWavPcm16(channels: Float32Array[], sampleRate: number): ArrayBuffer` — 16-bit PCM RIFF/WAVE.

- [ ] **Step 1: Write the failing tests** — create `src/arrange/render/envelopeCurve.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { envelopeCurve } from '@/arrange/render/envelopeCurve';

const region = { enterSec: 100, exitSec: 220, fadeInSec: 60, fadeOutSec: 60 };

describe('envelopeCurve', () => {
  it('starts and ends at ~0 and holds the ceiling between fades', () => {
    const c = envelopeCurve(region, 0.5, 0.05);
    expect(c[0]).toBeCloseTo(0, 5);
    expect(c[c.length - 1]).toBeCloseTo(0, 2);
    const mid = c[Math.floor(c.length / 2)]; // s = 160: past fadeIn, before fadeOut → hold
    expect(mid).toBeCloseTo(0.5, 5);
  });
  it('hits half the ceiling at the cosine midpoint of the fade-in', () => {
    const c = envelopeCurve(region, 1, 0.05);
    const idxAt30s = Math.round(((130 - 100) / (220 - 100)) * (c.length - 1)); // s = 130 = half fade
    expect(c[idxAt30s]).toBeCloseTo(0.5, 1);
  });
  it('zero-fade regions jump to the ceiling by the second sample (hard entry stays hard)', () => {
    const c = envelopeCurve({ enterSec: 0, exitSec: 100, fadeInSec: 0, fadeOutSec: 0 }, 1, 0.05);
    expect(c[1]).toBeCloseTo(1, 5);
    expect(c[c.length - 2]).toBeCloseTo(1, 5);
  });
});
```

and `src/audio/wavEncode.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { encodeWavPcm16 } from '@/audio/wavEncode';

describe('encodeWavPcm16', () => {
  it('writes a correct RIFF/WAVE header and PCM16 payload', () => {
    const left = new Float32Array([0, 1, -1]);
    const right = new Float32Array([0.5, 2, -2]); // out-of-range values clamp
    const buf = encodeWavPcm16([left, right], 44100);
    const v = new DataView(buf);
    const tag = (off: number) => String.fromCharCode(v.getUint8(off), v.getUint8(off + 1), v.getUint8(off + 2), v.getUint8(off + 3));
    expect(tag(0)).toBe('RIFF');
    expect(tag(8)).toBe('WAVE');
    expect(tag(12)).toBe('fmt ');
    expect(tag(36)).toBe('data');
    expect(v.getUint16(22, true)).toBe(2);        // channels
    expect(v.getUint32(24, true)).toBe(44100);    // sample rate
    expect(v.getUint32(40, true)).toBe(3 * 2 * 2); // data bytes = frames × ch × 2
    expect(buf.byteLength).toBe(44 + 12);
    expect(v.getInt16(44, true)).toBe(0);          // L frame 0
    expect(v.getInt16(46, true)).toBe(16383);      // R frame 0 ≈ 0.5 × 0x7fff
    expect(v.getInt16(48, true)).toBe(32767);      // L frame 1 (1 → max)
    expect(v.getInt16(50, true)).toBe(32767);      // R frame 1 (2 clamps to max)
    expect(v.getInt16(52, true)).toBe(-32768);     // L frame 2 (−1 → min)
    expect(v.getInt16(54, true)).toBe(-32768);     // R frame 2 (−2 clamps to min)
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/arrange/render/envelopeCurve.test.ts src/audio/wavEncode.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement** — create `src/arrange/render/envelopeCurve.ts`:

```ts
import type { RegionTiming } from '@/arrange/types';
import { regionEnvAt } from '@/arrange/regionEnv';

/** Sample a region's audible gain (volume envelope × ceiling gain) across [enterSec, exitSec]
 *  for OfflineAudioContext setValueCurveAtTime. The first sample sits exactly at enterSec where
 *  regionEnvAt is 0, so even a zero-fade (BASS) entry gets a one-step anti-click ramp — the same
 *  behavior as live playback's short trigger ramp. */
export function envelopeCurve(region: RegionTiming, ceilingGain: number, stepSec = 0.05): Float32Array {
  const dur = region.exitSec - region.enterSec;
  const n = Math.max(2, Math.ceil(dur / stepSec) + 1);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const s = region.enterSec + (i / (n - 1)) * dur;
    out[i] = regionEnvAt(region, Math.min(s, region.exitSec - 1e-6)) * ceilingGain;
  }
  return out;
}
```

and `src/audio/wavEncode.ts`:

```ts
/** Encode per-channel float samples as a 16-bit PCM WAV file (values clamped to [−1, 1]).
 *  All channels must share the same length; they are interleaved frame by frame. */
export function encodeWavPcm16(channels: Float32Array[], sampleRate: number): ArrayBuffer {
  const numCh = channels.length;
  const frames = channels[0]?.length ?? 0;
  const dataBytes = frames * numCh * 2;
  const buf = new ArrayBuffer(44 + dataBytes);
  const v = new DataView(buf);
  const w4 = (off: number, s: string) => { for (let i = 0; i < 4; i++) v.setUint8(off + i, s.charCodeAt(i)); };
  w4(0, 'RIFF'); v.setUint32(4, 36 + dataBytes, true); w4(8, 'WAVE');
  w4(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, numCh, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * numCh * 2, true);
  v.setUint16(32, numCh * 2, true); v.setUint16(34, 16, true);
  w4(36, 'data'); v.setUint32(40, dataBytes, true);
  let off = 44;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < numCh; c++) {
      const x = Math.max(-1, Math.min(1, channels[c][i]));
      v.setInt16(off, Math.round(x < 0 ? x * 0x8000 : x * 0x7fff), true);
      off += 2;
    }
  }
  return buf;
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run src/arrange/render/envelopeCurve.test.ts src/audio/wavEncode.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/arrange/render/envelopeCurve.ts src/arrange/render/envelopeCurve.test.ts src/audio/wavEncode.ts src/audio/wavEncode.test.ts
git commit -m "feat(render): pure envelope-curve sampler + PCM16 WAV encoder"
```

---

### Task 6: WAV offline render + Export WAV button

**Files:**
- Create: `src/arrange/render/renderModuleWav.ts`
- Modify: `src/components/layer2/ArrangeScreen.tsx`

**Interfaces:**
- Consumes: `envelopeCurve`, `encodeWavPcm16` (Task 5); `dbToGain(db, minDb)`; `resolveSampleUrl(relPath)`; `config.layerTwo.moduleSeconds`, `config.audio.volume.minDb`.
- Produces: `renderModuleToWav(args: { tracks: ArrTrack[]; regions: TemplateRegion[]; masterDb: number; sampleRate?: number; onProgress?: (frac: number) => void }, cfg?: EcosonicConfig): Promise<Blob>`

> **No unit test for the glue:** jsdom has no `OfflineAudioContext`. The pure math is covered by Task 5; this task is verified manually (Step 3). Do not add a mocked-WebAudio test — it would only test the mock.

- [ ] **Step 1: Implement the renderer** — create `src/arrange/render/renderModuleWav.ts`:

```ts
import { config as defaultConfig, type EcosonicConfig } from '@/config';
import type { ArrTrack, TemplateRegion } from '@/arrange/types';
import { resolveSampleUrl } from '@/samples';
import { dbToGain } from '@/audio/dsp';
import { envelopeCurve } from '@/arrange/render/envelopeCurve';
import { encodeWavPcm16 } from '@/audio/wavEncode';

/** Offline-render the module to a WAV Blob, mirroring live playback: one looping buffer source
 *  per region started at enterSec and stopped at exitSec (the sample loops from 0 under the clip,
 *  as Layer.trigger does), the region's volume envelope × Layer One ceiling on its gain node,
 *  and the master gain on top. Runs in its own OfflineAudioContext — never touches the live
 *  graph, so a running live session is unaffected (spec §6 snapshot semantics). */
export async function renderModuleToWav(
  args: {
    tracks: ArrTrack[];
    regions: TemplateRegion[];
    masterDb: number;
    sampleRate?: number;
    onProgress?: (frac: number) => void;
  },
  cfg: EcosonicConfig = defaultConfig,
): Promise<Blob> {
  const sr = args.sampleRate ?? 44100;
  const D = cfg.layerTwo.moduleSeconds;
  const minDb = cfg.audio.volume.minDb;
  const ctx = new OfflineAudioContext(2, Math.ceil(D * sr), sr);

  const master = ctx.createGain();
  master.gain.value = dbToGain(args.masterDb, minDb);
  master.connect(ctx.destination);

  // Decode each distinct sample once, even if several tracks share a file.
  const decoded = new Map<string, Promise<AudioBuffer>>();
  const decode = (path: string) => {
    let p = decoded.get(path);
    if (!p) {
      p = fetch(resolveSampleUrl(path))
        .then((res) => res.arrayBuffer())
        .then((arr) => ctx.decodeAudioData(arr));
      decoded.set(path, p);
    }
    return p;
  };

  const byId = new Map(args.tracks.map((t) => [t.id, t]));
  await Promise.all(
    args.regions.map(async (r) => {
      const track = byId.get(r.trackId);
      if (!track || r.exitSec - r.enterSec <= 0) return;
      const buffer = await decode(track.sample.path);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true; // sample loops from 0 under the clip window, exactly like live playback
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const curve = envelopeCurve(r, dbToGain(track.ceilingDb, minDb));
      gain.gain.setValueCurveAtTime(curve, r.enterSec, r.exitSec - r.enterSec);
      src.connect(gain);
      gain.connect(master);
      src.start(r.enterSec);
      src.stop(r.exitSec);
    }),
  );

  // Coarse progress: suspend at 30-timeline-second marks (must be scheduled before rendering).
  if (args.onProgress) {
    for (let s = 30; s < D; s += 30) {
      const at = s;
      void ctx.suspend(at).then(() => {
        args.onProgress!(at / D);
        void ctx.resume();
      });
    }
  }

  const rendered = await ctx.startRendering();
  args.onProgress?.(1);
  const channels = Array.from({ length: rendered.numberOfChannels }, (_, c) => rendered.getChannelData(c));
  return new Blob([encodeWavPcm16(channels, sr)], { type: 'audio/wav' });
}
```

- [ ] **Step 2: Wire the button** — in `src/components/layer2/ArrangeScreen.tsx`:

(a) Imports:

```ts
import { renderModuleToWav } from '@/arrange/render/renderModuleWav';
```

(b) Selector + state + handler inside the component (next to the JSON handlers from Task 4):

```ts
  const masterDb = useArrangement((s) => s.masterDb);
  const [renderPct, setRenderPct] = useState<number | null>(null);

  const exportWav = async () => {
    if (renderPct !== null) return;
    setRenderPct(0);
    try {
      const blob = await renderModuleToWav({
        tracks,
        regions: moduleRegions,
        masterDb,
        onProgress: (f) => setRenderPct(f),
      });
      downloadBlob(blob, `ecosonic-${activeMode.toLowerCase()}.wav`);
    } catch {
      window.alert('WAV render failed — check the console for details.');
    } finally {
      setRenderPct(null);
    }
  };
```

(c) In the mode row, right after the **Export JSON** button, add:

```tsx
          <button
            type="button"
            onClick={() => void exportWav()}
            disabled={renderPct !== null}
            className="rounded-full border border-border px-3 py-1 text-xs transition-calm hover:text-foreground disabled:cursor-wait disabled:opacity-60"
          >
            {renderPct === null ? 'Export WAV' : `Rendering ${Math.round(renderPct * 100)}%`}
          </button>
```

- [ ] **Step 3: Type-check + manual verification**

Run: `npx tsc --noEmit` — clean.
Then `npm run dev`:
- **Export WAV** shows a rising percentage, then downloads `ecosonic-introduction.wav` (~100 MB for a 10-min stereo module — expected, spec §6).
- The file plays in a media player and audibly matches in-app playback: staggered entrances, ~1-min fades, BASS hard entry, NOISE bed throughout, master level applied.
- Start Live playback, steer once, then Export WAV **while playing**: playback never glitches; the file matches the arrangement at the moment of export (steering afterwards does not change the file).

- [ ] **Step 4: Commit**

```bash
git add src/arrange/render/renderModuleWav.ts src/components/layer2/ArrangeScreen.tsx
git commit -m "feat(layer2): offline WAV export — renders the module as heard, without touching live playback"
```

---

### Task 7: Docs + full suite + wrap-up

**Files:**
- Modify: `docs/ROADMAP.md` (§5 Gen-B row + status paragraph, §8 Gen-B row)
- Modify: `docs/PRD.md` (§6.2 feature list, §6.3 Gen-B entry, §9 success criteria)

- [ ] **Step 1: Run everything**

Run: `npm test`
Expected: PASS — every suite, old and new.

- [ ] **Step 2: Update ROADMAP** — in `docs/ROADMAP.md` §5, replace the Gen-B table row with:

```markdown
| **Gen-B · Live scheduler** | Live-steerable module playback: `steerModule` splice (drift + in-next/hold nudges), Live toggle, JSON/WAV snapshot export | ✅ **module scale done 2026-07-10** ([spec](./superpowers/specs/2026-07-10-gen-b-live-scheduler-design.md) · [plan](./superpowers/plans/2026-07-10-gen-b-live-scheduler.md)) — session scale (live bridges, per-instance regeneration) later |
```

and replace the `**Gen-B status:** proceeding. …` paragraph with:

```markdown
**Gen-B status:** module scale **built 2026-07-10** — Live toggle in the designer; drift changes and
per-lane in-next/hold nudges redraw the un-played future (splice at the playhead, past verbatim,
I1–I6 enforced); untouched loops repeat the last-drawn pass (generation is purely reactive); JSON
arrangement export/import + offline WAV render (snapshot semantics — never interrupts live play).
Deferred to session scale: live bridges, regeneration between module instances, a listener surface.
Provenance + assessment: [04-gen-b-scheduler-rationale.md](./generative/04-gen-b-scheduler-rationale.md).
```

In §8, replace the Gen-B row with:

```markdown
| **Gen-B** | Live generative scheduler (live-steerable playback) | ✅ module scale done 2026-07-10; session scale later (§5) |
```

- [ ] **Step 3: Update PRD** — in `docs/PRD.md`:

(a) §6.2, after the **Volume view** bullet, add:

```markdown
- **Live mode (Gen-B, module scale)**: a *Live* toggle makes playback steerable — changing drift
  mid-play redraws the un-played future (splice at the playhead; played history is untouched), and
  eligible pending lanes offer *in next* / *hold* nudges. Scrubbing is disabled while live; an
  untouched loop repeats the last-drawn pass (generation is purely reactive). Toggling Live off
  freezes the arrangement in place, still editable.
- **Snapshot export**: *Export JSON* / *Import* round-trip the arrangement as a file; *Export WAV*
  offline-renders the module exactly as heard (clips, loops, envelopes, ceilings, master) without
  interrupting live playback.
```

(b) §6.3, replace the `- **Live generative scheduler (in design — 2026-07-10)** — …` bullet with:

```markdown
- **Live generative scheduler — module scale shipped 2026-07-10** (see §6.2 Live mode); session
  scale (live bridges, regeneration between module instances, listener surface) remains
  ([provenance & assessment](./generative/04-gen-b-scheduler-rationale.md)).
```

(c) §9, add two success criteria at the end of the list:

```markdown
- **Live**: with Live on, a drift change or nudge visibly rearranges only upcoming clips within one
  tick, audio uninterrupted; stopping keeps the arrangement editable on the timeline.
- **Export**: JSON round-trips the arrangement; WAV renders the module as heard, mid-play, without
  glitching live playback.
```

- [ ] **Step 4: Final manual sweep**

`npm run dev` → full flow: element → Layer One → Layer Two → Generate → Live on → play → steer drift → nudge a lane → Live off → drag a clip → Export JSON → Import it → Export WAV.
Expected: everything from Tasks 3/4/6 manual checks still holds together in one pass.

- [ ] **Step 5: Commit**

```bash
git add docs/ROADMAP.md docs/PRD.md
git commit -m "docs: Gen-B module scale shipped — live steering + snapshot export recorded in PRD/ROADMAP"
```

---

## Self-Review

**Spec coverage (against `docs/superpowers/specs/2026-07-10-gen-b-live-scheduler-design.md`):**
- §2 decision 1 (module scale, existing designer) → Tasks 3 UI lives in ArrangeScreen/ModuleDesigner. ✓
- §2 decision 2 (drift + nudges) → Task 1 `SteerNudge` + Task 2 drift routing + Task 3 buttons. ✓
- §2 decision 3 (full draw + splice-redraw) → Task 1 `steerModule` (past verbatim / future redraw). ✓
- §2 decision 4 (repeat on wrap — reactive generation) → zero code by design; documented in Task 7 PRD text. ✓
- §2 decision 5 (keep on stop) → falls out of state (regions persist); asserted in Task 3 manual check. ✓
- §2 decision 6 (JSON + WAV snapshot export) → Tasks 4–6. ✓
- §3 splice rules (past/active/pending, nudges, squeeze, validate, determinism) → Task 1 code + tests. ✓
- §4 playback integration (no scheduler changes; edge verification) → Global Constraints (do not modify `useModuleScheduler`) + Task 3 Step 4 manual edges (in-next audible entry, hold pushes right). ✓
- §5 store & UI (live/setLive/steer, drift routing, scrub disable, eligible-lane buttons) → Tasks 2–3. ✓
- §6 export semantics + constraints (decode-all, memory note, progress, non-blocking) → Task 6 (decode dedup, suspend-based progress, size expectation in manual check). ✓
- §7 testing list → Task 1 (splice/eligibility/determinism), Task 2 (store), Task 4 (round-trip/reject), Task 5 (envelope midpoint ≈ 0.5, WAV header) — scheduler edges + render covered manually per jsdom limits (stated in Tasks 3/6). ✓
- §8 out of scope (bridges, session scale, persistence) → not present in any task. ✓

**Placeholder scan:** no TBD/TODO; every code/test step shows complete code; commands carry expected outcomes. ✓

**Type consistency:** `steerModule(regions, playheadSec, tracks, mode, drift, seed, nudge?, cfg?)` identical in Tasks 1–2; `SteerNudge` `{kind:'IN_NEXT'|'HOLD_BACK'; trackId}` used in Tasks 1–3; `nudgeOptions(track, regions, tracks, mode, playheadSec, cfg?)` in Tasks 1 and 3; `ArrangementFile`/`serializeArrangement`/`parseArrangement`/`importArrangement` in Task 4 UI matches Task 4 module; `envelopeCurve(region, ceilingGain, stepSec?)` and `encodeWavPcm16(channels, sampleRate)` in Tasks 5–6; `renderModuleToWav(args, cfg?)` in Task 6 only. `downloadBlob` defined in Task 4 (b), reused by Task 6 (b). ✓

**Known deferral (documented, not a gap):** `IN_NEXT_DELAY_SEC` / `HOLD_BACK_STEP_SEC` / `SQUEEZE_MIN_WIDTH_SEC` are module constants, not config keys — they are steering-verb behavior, not per-mode grammar data (ADR-0004 covers the latter); promote to `layerTwo.generation` only if tuning demands it.

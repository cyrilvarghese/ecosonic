# Remix Section Picker & Working Playback — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/remix` able to compose a single ~10-minute section module, and make its Play and
Export buttons actually produce audio.

**Architecture:** Sections become a third selection axis alongside Scoped/Cross. Every authored rule
already carries absolute times; the parser starts recording the *start* of the section window it was
authored in, and the generator rebases phrases by that per-rule origin when a section is selected.
Playback reuses Layer 2's existing `useLayer2Engine` + `useModuleScheduler`, with two defects fixed in
place so both screens benefit.

**Tech Stack:** Next.js 16 (App Router, Turbopack), React 19, TypeScript, Zustand, Vitest + jsdom +
@testing-library/react, Tailwind v4, Web Audio API.

## Global Constraints

- Work in the worktree `C:\Users\cyril varghese\code\ecosonic\.claude\worktrees\remix-view` (branch `feat/remix-view`). Run every command from that root.
- `AGENTS.md`: this is **not** the Next.js you know — read `node_modules/next/dist/docs/` before writing framework code.
- Section module length is `config.layerTwo.moduleSeconds` (600). Never hardcode `600`.
- Rules rebase by **their own `sectionStartSec`**, never by a constant or a section index.
- Full session stays the default and keeps today's absolute-timeline behaviour.
- Generator code must stay pure and seeded — use `makeRng` from `@/arrange/prng`, never `Math.random()`.
- Tests: `npx vitest run <path>` for one file, `npm test` for all. Typecheck `npx tsc --noEmit`.
- `npm run lint` has **5 pre-existing offenders** (`app/rules/page.tsx`, `arrange/render/renderSessionWav.test.ts`, `arrange/useLayer2Engine.ts`, `audio/useAudioEngine.ts`, `components/layer2/ModuleDesigner.tsx`). Do not fix them; just keep remix code clean via `npx eslint src/remix src/components/remix`.
- Commit after every task. End messages with `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.
- On Windows PowerShell 5.1, do **not** put `"` inside a `@'...'@` here-string passed to `git commit -m` — native-arg quoting splits it. Use plain words or hyphens.

---

### Task 1: Parser records the section window start

Every session `.md` declares its window in the header — `## Section 2 - Deep Relaxation (10:00-20:00)`.
AIR declares `9:30-19:00` where every other element declares `10:00-20:00`, so the rebase origin is
real authored data. `parseSessionTimeline` already captures the start in `header[2]` and throws it away.

**Files:**
- Modify: `src/remix/sessionRules.ts:14-20`
- Modify: `src/remix/parseSessionTimeline.ts:40-51`, `:93-99`
- Test: `src/remix/parseSessionTimeline.test.ts`
- Fix fixtures: `src/remix/sessionRules.test.ts:4-9`, `src/remix/generateRemix.test.ts:26-38`, `src/components/remix/useRemix.test.ts:24-30`, `src/components/remix/RemixView.test.tsx:19-25`

**Interfaces:**
- Consumes: nothing.
- Produces: `AuthoredRule.sectionStartSec: number` — absolute seconds at which the rule's section window opens. Tasks 2 and 8 rely on it.

- [ ] **Step 1: Write the failing test**

Append to `src/remix/parseSessionTimeline.test.ts` inside the existing `describe`:

```ts
  it('records the section window start each rule was authored in', () => {
    const air = `## Section 2 - Deep Relaxation (9:30-19:00)

| Layer | Starts | Full Level | Starts Leaving | Ends |
|---|---|---|---|---|
| NOISE | 9:30 | Immediate | Continuous | End of section |
`;
    const earth = `## Section 2 - Deep Relaxation (10:00-20:00)

| Layer | Starts | Full Level | Starts Leaving | Ends |
|---|---|---|---|---|
| NOISE | 10:00 | Immediate | Continuous | End of section |
`;
    expect(parseSessionTimeline(air, 'AIR').rules[0].sectionStartSec).toBe(570);
    expect(parseSessionTimeline(earth, 'EARTH').rules[0].sectionStartSec).toBe(600);
  });

  it('starts the Introduction window at zero', () => {
    const { rules } = parseSessionTimeline(md, 'WATER');
    expect(rules.every((r) => r.sectionStartSec === 0)).toBe(true);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/remix/parseSessionTimeline.test.ts`
Expected: FAIL — `sectionStartSec` is `undefined`, so `toBe(570)` reports `undefined`.

- [ ] **Step 3: Add the field to the type**

In `src/remix/sessionRules.ts`, add one line to `AuthoredRule` after `section`:

```ts
export interface AuthoredRule {
  category: Category;
  variant?: string;
  section: Mode;
  /** Absolute seconds at which this rule's section window opens (AIR authors 9:30, others 10:00).
   *  The origin a section-scoped draw rebases against — never a constant. */
  sectionStartSec: number;
  phrases: Phrase[];
  source: { element: ElementName; sessionId: string; track: string };
}
```

- [ ] **Step 4: Capture the start in the parser**

In `src/remix/parseSessionTimeline.ts`, add a tracking variable next to `sectionEnd` (line ~41):

```ts
  let sectionEnd = 0;
  let sectionStart = 0;
```

In the header branch (line ~47-50), set it from `header[2]`:

```ts
    if (header) {
      section = SECTION_BY_INDEX[Number(header[1]) - 1] ?? null;
      sectionStart = parseClock(header[2]) ?? 0;
      sectionEnd = parseClock(header[3]) ?? 0;
      byKey = new Map();
      continue;
    }
```

In the rule construction (line ~93), add the field:

```ts
      const rule: AuthoredRule = {
        category: mapped.category,
        variant: mapped.variant,
        section,
        sectionStartSec: sectionStart,
        phrases,
        source: { element, sessionId: element, track: name },
      };
```

- [ ] **Step 5: Fix the four test fixtures that build AuthoredRule by hand**

`src/remix/sessionRules.test.ts` — add `sectionStartSec: 0,` after `section: 'INTRODUCTION',`.

`src/remix/generateRemix.test.ts` — in the `rule` helper, add `sectionStartSec: 0,` after `section: 'INTRODUCTION',`.

`src/components/remix/useRemix.test.ts` and `src/components/remix/RemixView.test.tsx` — in each `rule` helper, add `sectionStartSec: 0,` after `section: 'INTRODUCTION',`.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/remix src/components/remix`
Expected: PASS, all files.

- [ ] **Step 7: Typecheck and commit**

```bash
npx tsc --noEmit
git add src/remix src/components/remix
git commit -m "feat(remix): parser records each rule section window start"
```

---

### Task 2: Generator gains a section axis

**Files:**
- Modify: `src/remix/generateRemix.ts`
- Test: `src/remix/generateRemix.test.ts`

**Interfaces:**
- Consumes: `AuthoredRule.sectionStartSec` (Task 1).
- Produces:
  ```ts
  generateRemix(
    pool: AuthoredRule[],
    manifest: Manifest,
    opts: { seed: number; element?: ElementName; section?: Mode; sessionSec: number },
  ): { tracks: ArrTrack[]; regions: TemplateRegion[]; picks: RemixPick[]; warnings: string[]; totalSec: number }
  ```
  Task 3 calls this. `totalSec` is `config.layerTwo.moduleSeconds` when `section` is set, else `sessionSec`.

- [ ] **Step 1: Write the failing tests**

In `src/remix/generateRemix.test.ts`, first update the `rule` helper to accept a section and origin — replace the existing helper with:

```ts
const rule = (
  category: Category,
  element: ElementName,
  phrases: Phrase[] = [ph(0, 60)],
  variant?: string,
  section: AuthoredRule['section'] = 'INTRODUCTION',
  sectionStartSec = 0,
): AuthoredRule => ({
  category,
  variant,
  section,
  sectionStartSec,
  phrases,
  source: { element, sessionId: `${element}-1`, track: category },
});
```

Add `import type { Mode } from '@/arrange/types';` and `import type { Phrase } from './sessionRules';` if not already present.

Every existing `generateRemix(...)` call in this file needs `sessionSec: 1800` added to its opts —
e.g. `{ seed, element: 'FIRE' }` becomes `{ seed, element: 'FIRE', sessionSec: 1800 }`. Do that now.

Then append a new describe block:

```ts
describe('generateRemix — section axis', () => {
  const SESSION = { seed: 1, sessionSec: 1800 };

  it('keeps absolute times and the session length when no section is chosen', () => {
    const pool = [rule('MELODY', 'EARTH', [ph(1320, 1590)], undefined, 'RETURN', 1200)];
    const { regions, totalSec } = generateRemix(pool, fakeManifest(), SESSION);
    expect(totalSec).toBe(1800);
    expect(regions[0]).toMatchObject({ enterSec: 1320, exitSec: 1590 });
  });

  it('draws only rules of the chosen section', () => {
    const pool = [
      rule('MELODY', 'EARTH', [ph(0, 300)], undefined, 'INTRODUCTION', 0),
      rule('PAD', 'EARTH', [ph(1320, 1590)], undefined, 'RETURN', 1200),
    ];
    const { tracks } = generateRemix(pool, fakeManifest(), { ...SESSION, section: 'RETURN' });
    expect(tracks.map((t) => t.category)).toEqual(['PAD']);
  });

  it('rebases each rule by its own section start, not a constant', () => {
    // AIR opens Deep Relaxation at 9:30 (570s); EARTH opens it at 10:00 (600s).
    const pool = [
      rule('MELODY', 'AIR', [ph(600, 900)], undefined, 'DEEP_RELAXATION', 570),
      rule('PAD', 'EARTH', [ph(660, 960)], undefined, 'DEEP_RELAXATION', 600),
    ];
    const { regions, totalSec } = generateRemix(pool, fakeManifest(), { ...SESSION, section: 'DEEP_RELAXATION' });
    expect(totalSec).toBe(config.layerTwo.moduleSeconds);
    const byTrack = new Map(regions.map((r) => [r.trackId, r]));
    expect(byTrack.get('MELODY')).toMatchObject({ enterSec: 30, exitSec: 330 });  // 600-570, 900-570
    expect(byTrack.get('PAD')).toMatchObject({ enterSec: 60, exitSec: 360 });     // 660-600, 960-600
  });

  it('clips a phrase that overruns the module and warns', () => {
    const pool = [rule('PAD', 'EARTH', [ph(0, 900)], undefined, 'INTRODUCTION', 0)];
    const { regions } = generateRemix(pool, fakeManifest(), { ...SESSION, section: 'INTRODUCTION' });
    expect(regions[0].exitSec).toBe(config.layerTwo.moduleSeconds);
  });

  it('skips a rule whose phrases all fall outside the module, and warns', () => {
    const pool = [rule('PAD', 'EARTH', [ph(1300, 1400)], undefined, 'INTRODUCTION', 0)];
    const { tracks, warnings } = generateRemix(pool, fakeManifest(), { ...SESSION, section: 'INTRODUCTION' });
    expect(tracks).toEqual([]);
    expect(warnings.some((w) => w.includes('PAD'))).toBe(true);
  });

  it('combines the section filter with the element filter', () => {
    const pool = [
      rule('MELODY', 'AIR', [ph(600, 900)], undefined, 'DEEP_RELAXATION', 570),
      rule('MELODY', 'EARTH', [ph(660, 960)], undefined, 'DEEP_RELAXATION', 600),
      rule('MELODY', 'EARTH', [ph(0, 300)], undefined, 'INTRODUCTION', 0),
    ];
    const { picks } = generateRemix(pool, fakeManifest(), {
      ...SESSION, section: 'DEEP_RELAXATION', element: 'EARTH',
    });
    expect(picks).toHaveLength(1);
    expect(picks[0].poolSize).toBe(1);
    expect(picks[0].rule.source.element).toBe('EARTH');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/remix/generateRemix.test.ts`
Expected: FAIL — `totalSec` is `undefined` and `section` is ignored.

- [ ] **Step 3: Rewrite the generator**

Replace the body of `src/remix/generateRemix.ts` (keep the existing file header comment, extend it):

```ts
import type { Category, ElementName, Manifest } from '@/types';
import { STACK_ORDER, type ArrTrack, type Mode, type TemplateRegion } from '@/arrange/types';
import { makeRng } from '@/arrange/prng';
import { config } from '@/config';
import type { AuthoredRule } from './sessionRules';

export interface RemixPick {
  track: ArrTrack;
  rule: AuthoredRule;
  /** How many candidates the draw chose from — the filtered pool, so it differs by mode. */
  poolSize: number;
}

export interface RemixDraw {
  tracks: ArrTrack[];
  regions: TemplateRegion[];
  picks: RemixPick[];
  warnings: string[];
  /** Length of the timeline this draw lays out on. */
  totalSec: number;
}

export function generateRemix(
  pool: AuthoredRule[],
  manifest: Manifest,
  opts: { seed: number; element?: ElementName; section?: Mode; sessionSec: number },
): RemixDraw {
  const totalSec = opts.section ? config.layerTwo.moduleSeconds : opts.sessionSec;
  const rng = makeRng(opts.seed);

  let candidates = pool;
  if (opts.element) candidates = candidates.filter((r) => r.source.element === opts.element);
  if (opts.section) candidates = candidates.filter((r) => r.section === opts.section);

  const categories = STACK_ORDER.filter((c) => candidates.some((r) => r.category === c));

  const tracks: ArrTrack[] = [];
  const regions: TemplateRegion[] = [];
  const picks: RemixPick[] = [];
  const warnings: string[] = [];

  for (const category of categories) {
    const cands = candidates.filter((r) => r.category === category);
    const rule = cands[Math.floor(rng.float() * cands.length)];
    const samples = manifest[rule.source.element]?.[category] ?? [];
    if (samples.length === 0) {
      warnings.push(`${category}: no ${rule.source.element} sample for the picked rule — track skipped`);
      continue;
    }
    // A section draw rebases by the rule's OWN window start, so rules authored against different
    // windows (AIR opens Deep Relaxation at 9:30, others at 10:00) land on one 0..totalSec module.
    const origin = opts.section ? rule.sectionStartSec : 0;
    const ruleRegions = rebase(rule, origin, totalSec);
    if (ruleRegions.length === 0) {
      warnings.push(`${category}: ${rule.source.element} rule falls outside the module — track skipped`);
      continue;
    }
    const sample = samples[Math.floor(rng.float() * samples.length)];
    const track: ArrTrack = {
      id: category,
      category,
      label: rule.variant ?? category,
      sample: { name: sample.name, path: sample.path, bytes: sample.bytes },
      ceilingDb: config.audio.volume.defaultTrackDb,
      locked: false,
    };
    tracks.push(track);
    picks.push({ track, rule, poolSize: cands.length });
    for (const r of ruleRegions) regions.push({ ...r, trackId: track.id });
  }
  return { tracks, regions, picks, warnings, totalSec };
}

/** Shift a rule's phrases to a 0..totalSec timeline, clipping the tail and dropping anything that
 *  starts at or past the end. Fades are capped at the surviving width so a clipped clip still fades. */
function rebase(rule: AuthoredRule, origin: number, totalSec: number): Omit<TemplateRegion, 'trackId'>[] {
  const out: Omit<TemplateRegion, 'trackId'>[] = [];
  for (const p of rule.phrases) {
    const enterSec = p.enterSec - origin;
    const exitSec = Math.min(p.exitSec - origin, totalSec);
    if (enterSec < 0 || enterSec >= totalSec || exitSec <= enterSec) continue;
    const width = exitSec - enterSec;
    out.push({
      enterSec,
      exitSec,
      fadeInSec: Math.min(p.fadeInSec, width),
      fadeOutSec: Math.min(p.fadeOutSec, width),
    });
  }
  return out;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/remix/generateRemix.test.ts`
Expected: PASS — all tests including the pre-existing ones.

- [ ] **Step 5: Commit**

```bash
npx tsc --noEmit
git add src/remix/generateRemix.ts src/remix/generateRemix.test.ts
git commit -m "feat(remix): generateRemix section axis with per-rule rebasing"
```

Note: `src/components/remix/useRemix.ts` will not typecheck until Task 3 — that is expected, and
Task 3 fixes it. If you want a green `tsc` at this commit, do Tasks 2 and 3 back-to-back.

---

### Task 3: useRemix holds the section and reads totalSec from the draw

**Files:**
- Modify: `src/components/remix/useRemix.ts`
- Test: `src/components/remix/useRemix.test.ts`

**Interfaces:**
- Consumes: `generateRemix` with `section`/`sessionSec`/`totalSec` (Task 2).
- Produces: `RemixState` gains `section: Mode | null` and `setSection: (s: Mode | null) => void`; `totalSec` now comes from the draw. Task 4 consumes both.

- [ ] **Step 1: Write the failing test**

Append to `src/components/remix/useRemix.test.ts` inside the existing `describe`. First extend the
fixture so a section draw has something to find — replace the `rule` helper and `STORE` with:

```ts
const rule = (category: string, element: string, section = 'INTRODUCTION', sectionStartSec = 0,
              phrases = [{ enterSec: 0, exitSec: 60, fadeInSec: 0, fadeOutSec: 0 }]) => ({
  category, section, sectionStartSec, phrases,
  source: { element, sessionId: `${element}-1`, track: category },
});

const STORE = {
  EARTH: [],
  AIR: [],
  ETHER: [],
  WATER: [{ id: 'w', element: 'WATER', label: 'w', rules: [rule('MELODY', 'WATER')] }],
  FIRE: [{ id: 'f', element: 'FIRE', label: 'f', rules: [
    rule('MELODY', 'FIRE'),
    rule('PAD', 'FIRE'),
    rule('BASS', 'FIRE', 'RETURN', 1200, [{ enterSec: 1320, exitSec: 1500, fadeInSec: 0, fadeOutSec: 0 }]),
  ] }],
};
```

The existing tests assert `tracks` has length 2 — BASS is a RETURN rule, so the full-session draw now
has 3 tracks. Update those three assertions from `toHaveLength(2)` to `toHaveLength(3)` and the
`['PAD', 'MELODY']` expectation to `['PAD', 'BASS', 'MELODY']` (STACK_ORDER: PAD 7, BASS 8, MELODY 10).

Then add:

```ts
  it('defaults to the full session and its duration', async () => {
    const { result } = renderHook(() => useRemix());
    await waitFor(() => expect(result.current.tracks).toHaveLength(3));
    expect(result.current.section).toBeNull();
    expect(result.current.totalSec).toBe(1800);
  });

  it('switches to a fixed-length module when a section is picked', async () => {
    const { result } = renderHook(() => useRemix());
    await waitFor(() => expect(result.current.tracks).toHaveLength(3));

    act(() => result.current.setSection('RETURN'));

    expect(result.current.totalSec).toBe(config.layerTwo.moduleSeconds);
    expect(result.current.tracks.map((t) => t.category)).toEqual(['BASS']);
    expect(result.current.regions[0]).toMatchObject({ enterSec: 120, exitSec: 300 }); // 1320-1200
  });

  it('seeds the store with the module length when a section is picked', async () => {
    const { result } = renderHook(() => useRemix());
    await waitFor(() => expect(arrangementStore.getState().tracks).toHaveLength(3));

    act(() => result.current.setSection('RETURN'));

    await waitFor(() => expect(arrangementStore.getState().durationMin).toBe(config.layerTwo.moduleSeconds / 60));
  });
```

Add `import { config } from '@/config';` to the test file.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/remix/useRemix.test.ts`
Expected: FAIL — `result.current.section` is `undefined`, `setSection` is not a function.

- [ ] **Step 3: Implement**

In `src/components/remix/useRemix.ts`:

Add `Mode` to the arrange types import:

```ts
import type { ArrTrack, Mode, TemplateRegion } from '@/arrange/types';
```

Add to `RemixState` after `element`:

```ts
  /** null = the whole session on its absolute timeline; a Mode = one fixed-length module. */
  section: Mode | null;
  setSection: (s: Mode | null) => void;
```

Add the state next to the other useStates:

```ts
  const [section, setSection] = useState<Mode | null>(null);
```

Replace the `draw` memo:

```ts
  const draw = useMemo(
    () => generateRemix(pool, manifest, {
      seed,
      element: scopedTo,
      section: section ?? undefined,
      sessionSec: durationMin * 60,
    }),
    [pool, seed, scopedTo, section, durationMin],
  );
```

Replace the `initFrom` effect's `durationMin` argument with the draw's own length, and add `draw` is
already the dep so nothing else changes:

```ts
  useEffect(() => {
    arrangementStore.getState().initFrom(
      {
        element: scopedTo ?? null,
        tracks: draw.tracks,
        tuningHz: config.audio.tuning.defaultHz,
        masterDb: config.audio.volume.defaultMasterDb,
      },
      draw.totalSec / 60,
    );
  }, [draw, scopedTo]);
```

Replace `totalSec: durationMin * 60,` in the return with `totalSec: draw.totalSec,` and add
`section,` and `setSection,` to the returned object.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/remix`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npx tsc --noEmit
git add src/components/remix/useRemix.ts src/components/remix/useRemix.test.ts
git commit -m "feat(remix): useRemix section state, totalSec from the draw"
```

---

### Task 4: Section chip row in RemixView

**Files:**
- Modify: `src/components/remix/RemixView.tsx`
- Test: `src/components/remix/RemixView.test.tsx`

**Interfaces:**
- Consumes: `section` / `setSection` / `totalSec` from `useRemix` (Task 3).
- Produces: nothing other tasks depend on.

- [ ] **Step 1: Write the failing test**

Extend the fixture in `src/components/remix/RemixView.test.tsx` the same way as Task 3 — give the
`rule` helper `section` and `sectionStartSec` parameters and add a RETURN-section BASS rule to FIRE.
Then append:

```ts
  it('offers the four section scopes with full session selected', async () => {
    render(<RemixView />);
    await screen.findByTestId('region-PAD-0');
    expect(screen.getByRole('button', { name: 'Full session' })).toHaveAttribute('aria-pressed', 'true');
    for (const label of ['Intro', 'Deep Relaxation', 'Return']) {
      expect(screen.getByRole('button', { name: label })).toHaveAttribute('aria-pressed', 'false');
    }
  });

  it('narrows the draw to one section module', async () => {
    render(<RemixView />);
    await screen.findByTestId('region-PAD-0');

    await userEvent.click(screen.getByRole('button', { name: 'Return' }));

    expect(screen.getByRole('button', { name: 'Return' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('region-BASS-120')).toBeInTheDocument(); // 1320 rebased by 1200
    expect(screen.queryByTestId('region-PAD-0')).toBeNull();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/remix/RemixView.test.tsx`
Expected: FAIL — `Unable to find an accessible element with the role "button" and name "Full session"`.

- [ ] **Step 3: Implement**

In `src/components/remix/RemixView.tsx`, add to the imports:

```ts
import type { Mode } from '@/arrange/types';
```

Add the section list next to `MODES`:

```ts
const SECTIONS: { value: Mode | null; label: string }[] = [
  { value: null, label: 'Full session' },
  { value: 'INTRODUCTION', label: 'Intro' },
  { value: 'DEEP_RELAXATION', label: 'Deep Relaxation' },
  { value: 'RETURN', label: 'Return' },
];
```

Destructure `section` and `setSection` from `useRemix()`.

Add a second row inside the controls `<section>`, after the mode toggle + element chips block and
before the hint paragraph. Give it `w-full` so it wraps onto its own line:

```tsx
        <div className="flex w-full flex-wrap gap-1">
          {SECTIONS.map((s) => (
            <button
              key={s.label}
              type="button"
              aria-pressed={section === s.value}
              onClick={() => setSection(s.value)}
              className={`${CHIP} ${section === s.value ? LIT : 'border-border text-muted-foreground opacity-70 hover:opacity-100'}`}
            >
              {s.label}
            </button>
          ))}
        </div>
```

Update the result heading so it names what you are looking at — replace
`Final result — full session` with:

```tsx
        <h3 className="mb-2 text-sm font-medium">
          Final result — {SECTIONS.find((s) => s.value === section)?.label ?? 'full session'}
        </h3>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/remix`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npx tsc --noEmit
git add src/components/remix/RemixView.tsx src/components/remix/RemixView.test.tsx
git commit -m "feat(remix): section chip row - full session, intro, deep relaxation, return"
```

---

### Task 5: Scheduler honours every region of a track

`useModuleScheduler.ts:59` does `st.moduleRegions.find((r) => r.trackId === track.id)` — the **first**
region only. A multi-phrase rule emits several regions per track, so only its first phrase would ever
play, while the offline renderer plays all of them. Extracting the lookup into a pure helper makes it
testable without driving `requestAnimationFrame`.

**Files:**
- Modify: `src/arrange/regionEnv.ts`
- Modify: `src/arrange/useModuleScheduler.ts:58-60`
- Test: `src/arrange/regionEnv.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `regionAt(regions: TemplateRegion[], trackId: string, pos: number): TemplateRegion | undefined`. Task 7 relies on the scheduler using it.

- [ ] **Step 1: Write the failing test**

Append to `src/arrange/regionEnv.test.ts`:

```ts
describe('regionAt', () => {
  const regions: TemplateRegion[] = [
    { trackId: 'MELODY', enterSec: 0, exitSec: 100, fadeInSec: 0, fadeOutSec: 0 },
    { trackId: 'MELODY', enterSec: 300, exitSec: 400, fadeInSec: 0, fadeOutSec: 0 },
    { trackId: 'PAD', enterSec: 50, exitSec: 150, fadeInSec: 0, fadeOutSec: 0 },
  ];

  it('finds a later phrase of the same track, not just the first', () => {
    expect(regionAt(regions, 'MELODY', 350)).toMatchObject({ enterSec: 300, exitSec: 400 });
  });

  it('returns undefined in the gap between two phrases', () => {
    expect(regionAt(regions, 'MELODY', 200)).toBeUndefined();
  });

  it('is inclusive of the entrance and exclusive of the exit', () => {
    expect(regionAt(regions, 'MELODY', 0)).toBeDefined();
    expect(regionAt(regions, 'MELODY', 100)).toBeUndefined();
  });

  it('does not cross tracks', () => {
    expect(regionAt(regions, 'PAD', 350)).toBeUndefined();
  });
});
```

Add `import { regionAt } from './regionEnv';` (extend the existing import) and
`import type { TemplateRegion } from './types';` if not already present.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/arrange/regionEnv.test.ts`
Expected: FAIL — `regionAt is not a function`.

- [ ] **Step 3: Implement the helper**

Append to `src/arrange/regionEnv.ts`:

```ts
/** The region of `trackId` containing `pos`, entrance-inclusive and exit-exclusive.
 *  Multi-phrase rules emit several regions per track, so a plain find-by-track would only ever
 *  see the first phrase and the rest would never sound. */
export function regionAt(
  regions: TemplateRegion[],
  trackId: string,
  pos: number,
): TemplateRegion | undefined {
  return regions.find((r) => r.trackId === trackId && pos >= r.enterSec && pos < r.exitSec);
}
```

Add `import type { TemplateRegion } from './types';` at the top if the file does not already import it.

- [ ] **Step 4: Use it in the scheduler**

In `src/arrange/useModuleScheduler.ts`, add `regionAt` to the existing import from `@/arrange/regionEnv`,
then replace lines 58-60:

```ts
        for (const track of st.tracks) {
          const region = regionAt(st.moduleRegions, track.id, pos);
          const inside = !!region;
```

The rest of the loop body is unchanged — `region` is now the region actually under the playhead.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/arrange`
Expected: PASS — Layer 2 templates carry one region per track, so this is a no-op there.

- [ ] **Step 6: Commit**

```bash
npx tsc --noEmit
git add src/arrange/regionEnv.ts src/arrange/regionEnv.test.ts src/arrange/useModuleScheduler.ts
git commit -m "fix(arrange): scheduler plays every phrase of a track, not only the first"
```

---

### Task 6: Engine reloads when the draw changes

`useLayer2Engine` runs its load effect once (`[engine]`) against a mount-time snapshot and bails when
`tracks` is empty. Layer 2 gets its tracks before mount, so it never noticed. On `/remix` tracks
arrive after a fetch and change on every regenerate, so the engine would load nothing and never reload.

**Files:**
- Modify: `src/arrange/useLayer2Engine.ts:21-23`, `:63`
- Test: `src/arrange/useLayer2Engine.test.ts` (create)

**Interfaces:**
- Consumes: nothing.
- Produces: no signature change — `useLayer2Engine(): AudioEngine` still. Task 7 mounts it.

- [ ] **Step 1: Write the failing test**

Create `src/arrange/useLayer2Engine.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import type { ArrTrack } from '@/arrange/types';
import { arrangementStore } from '@/arrange/arrangementStore';

// Record every setTracks call so we can assert the engine follows the store.
const { calls } = vi.hoisted(() => ({ calls: [] as unknown[][] }));
vi.mock('@/audio/AudioEngine', () => ({
  AudioEngine: class {
    setTracks = vi.fn(async (specs: unknown[]) => { calls.push(specs); });
    setMasterVolume = vi.fn();
    getLayerDuration = vi.fn(() => 60);
    resumeContext = vi.fn();
    suspendContext = vi.fn();
    setTrackVolume = vi.fn();
    setTrackEnvelope = vi.fn();
    triggerTrack = vi.fn();
    releaseTrack = vi.fn();
    clear = vi.fn();
  },
}));

// vi.mock is hoisted above imports, so a plain static import already gets the mocked AudioEngine.
import { useLayer2Engine } from './useLayer2Engine';

const track = (id: string, path: string): ArrTrack => ({
  id, category: 'MELODY', label: id, sample: { name: id, path, bytes: 1 }, ceilingDb: 0, locked: false,
});

beforeEach(() => {
  calls.length = 0;
  arrangementStore.setState({ tracks: [], masterDb: 0 });
});

describe('useLayer2Engine', () => {
  it('loads tracks that arrive after mount', async () => {
    renderHook(() => useLayer2Engine());
    act(() => { arrangementStore.setState({ tracks: [track('MELODY', 'a.wav')] }); });
    await waitFor(() => expect(calls.at(-1)).toHaveLength(1));
    expect((calls.at(-1) as { path: string }[])[0].path).toBe('a.wav');
  });

  it('reloads when the draw swaps a track sample', async () => {
    renderHook(() => useLayer2Engine());
    act(() => { arrangementStore.setState({ tracks: [track('MELODY', 'a.wav')] }); });
    await waitFor(() => expect(calls.at(-1)).toHaveLength(1));

    act(() => { arrangementStore.setState({ tracks: [track('MELODY', 'b.wav')] }); });
    await waitFor(() => expect((calls.at(-1) as { path: string }[])[0].path).toBe('b.wav'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/arrange/useLayer2Engine.test.ts`
Expected: FAIL — the effect ran once against empty tracks and returned early, so `calls` stays empty
and `waitFor` times out.

- [ ] **Step 3: Implement**

In `src/arrange/useLayer2Engine.ts`, add `useArrangement` to the store import:

```ts
import { arrangementStore, useArrangement } from '@/arrange/arrangementStore';
```

Add a subscription key above the effect. It is a string, so an unchanged track list is
reference-stable under zustand's `Object.is` comparison and causes no re-render:

```ts
  // Re-run the load whenever the set of tracks or their samples changes — /remix redraws its tracks
  // on every regenerate, where Layer Two hands them over once before mount.
  const trackKey = useArrangement((s) => s.tracks.map((t) => `${t.id}:${t.sample.path}`).join('|'));
```

Delete the early return on line 23 (`if (!st.tracks.length) return;`) — an empty list is a valid
state and `setTracks([])` clears the engine.

Change the dependency array on line 63 from `[engine]` to `[engine, trackKey]`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/arrange`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npx tsc --noEmit
git add src/arrange/useLayer2Engine.ts src/arrange/useLayer2Engine.test.ts
git commit -m "fix(arrange): engine loads tracks that arrive or change after mount"
```

---

### Task 7: Mount the engine and scheduler in RemixView, and report export failures

**Files:**
- Modify: `src/components/remix/RemixView.tsx`
- Test: `src/components/remix/RemixView.test.tsx`

**Interfaces:**
- Consumes: `useLayer2Engine` (Task 6), `useModuleScheduler` + `regionAt` (Task 5).
- Produces: nothing other tasks depend on.

- [ ] **Step 1: Write the failing test**

`AudioEngine` builds a real `AudioContext` in its constructor, which jsdom does not implement — so
`RemixView.test.tsx` must mock it. Add the same `vi.mock('@/audio/AudioEngine', ...)` block from
Task 6 to the top of `src/components/remix/RemixView.test.tsx` (the `calls` array is not needed here;
keep just the class). Then append:

Mock the renderer once at the top of the file with a flag you can flip per test — more robust than
`vi.doMock` plus a dynamic re-import, which would re-resolve the whole module graph mid-test:

```ts
const { exportShouldFail } = vi.hoisted(() => ({ exportShouldFail: { value: false } }));
vi.mock('@/remix/renderFreeMix', () => ({
  exportFreeMixWav: vi.fn(async () => {
    if (exportShouldFail.value) throw new Error('decode failed');
    return new Blob(['fake'], { type: 'audio/wav' });
  }),
}));
```

Add `exportShouldFail.value = false;` to the existing `beforeEach`. jsdom does not implement
`URL.createObjectURL`, so stub it there too: `vi.stubGlobal('URL', { ...URL, createObjectURL: () => 'blob:x', revokeObjectURL: () => {} });`

Then the test:

```ts
  it('surfaces an export failure instead of failing silently', async () => {
    exportShouldFail.value = true;
    render(<RemixView />);
    await screen.findByTestId('region-PAD-0');

    await userEvent.click(screen.getByRole('button', { name: /Export WAV/ }));

    expect(await screen.findByText(/Export failed/i)).toBeInTheDocument();
  });

  it('leaves no error showing after a successful export', async () => {
    render(<RemixView />);
    await screen.findByTestId('region-PAD-0');

    await userEvent.click(screen.getByRole('button', { name: /Export WAV/ }));

    await waitFor(() => expect(screen.queryByText(/Export failed/i)).toBeNull());
  });
```

Add `waitFor` to the `@testing-library/react` import.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/remix/RemixView.test.tsx`
Expected: FAIL — no "Export failed" text; the rejection is unhandled.

- [ ] **Step 3: Implement**

In `src/components/remix/RemixView.tsx`, add imports:

```ts
import { useState } from 'react';
import { useLayer2Engine } from '@/arrange/useLayer2Engine';
import { useModuleScheduler } from '@/arrange/useModuleScheduler';
```

Mount them as the first two lines of the component body, before any early return:

```ts
export function RemixView() {
  const engine = useLayer2Engine();
  useModuleScheduler(engine);
```

Add export status state next to the other hooks:

```ts
  const [exportState, setExportState] = useState<'idle' | 'rendering' | 'error'>('idle');
```

Replace `onExport` with a guarded version:

```ts
  const onExport = async () => {
    setExportState('rendering');
    try {
      const blob = await exportFreeMixWav({ tracks, regions, totalSec, masterDb });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'remix.wav';
      a.click();
      URL.revokeObjectURL(url);
      setExportState('idle');
    } catch {
      setExportState('error');
    }
  };
```

Disable the button while rendering and show the status, replacing the Export button line:

```tsx
          <button
            type="button"
            className={BTN}
            disabled={exportState === 'rendering'}
            onClick={() => void onExport()}
          >
            {exportState === 'rendering' ? '⏳ Rendering…' : '⬇ Export WAV'}
          </button>
```

And after the button row, inside the same `<section>`:

```tsx
        {exportState === 'error' && (
          <p className="mt-2 text-xs text-red-600 dark:text-red-400">
            Export failed — check that the sample files are reachable.
          </p>
        )}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/remix`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npx tsc --noEmit
git add src/components/remix/RemixView.tsx src/components/remix/RemixView.test.tsx
git commit -m "feat(remix): mount audio engine and scheduler, report export failures"
```

---

### Task 8: Hover a candidate chip to see its time intervals

The repo's established pattern for hover detail on timeline elements is a `title` attribute
(`GrammarTimeline.tsx:74`, `AnalysisTimeline.tsx:61`). `src/components/ui/tooltip.tsx` exists but is
unused shadcn boilerplate, and a pool row renders ~15 chips × 9 rows — a portal-backed tooltip per
chip is the wrong trade here.

**Files:**
- Modify: `src/components/remix/TrackPoolRow.tsx`
- Test: `src/components/remix/TrackPoolRow.test.tsx` (create)

**Interfaces:**
- Consumes: `AuthoredRule.sectionStartSec` is **not** needed — phrases are already displayed as authored.
- Produces: nothing other tasks depend on.

- [ ] **Step 1: Write the failing test**

Create `src/components/remix/TrackPoolRow.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ArrTrack } from '@/arrange/types';
import type { AuthoredRule } from '@/remix/sessionRules';
import { TrackPoolRow } from './TrackPoolRow';

const track: ArrTrack = {
  id: 'MELODY', category: 'MELODY', label: 'MELODY',
  sample: { name: 'm', path: 'm.wav', bytes: 1 }, ceilingDb: 0, locked: false,
};

const rule = (phrases: AuthoredRule['phrases']): AuthoredRule => ({
  category: 'MELODY', section: 'INTRODUCTION', sectionStartSec: 0, phrases,
  source: { element: 'WATER', sessionId: 'w', track: 'MELODY' },
});

describe('TrackPoolRow', () => {
  it('names the element, section and interval on hover', () => {
    const r = rule([{ enterSec: 60, exitSec: 540, fadeInSec: 0, fadeOutSec: 0 }]);
    render(<TrackPoolRow track={track} candidates={[r]} pick={undefined} />);
    expect(screen.getByText('Wat·I')).toHaveAttribute('title', 'WATER · Introduction · 1:00–9:00');
  });

  it('lists every phrase of a multi-phrase rule', () => {
    const r = rule([
      { enterSec: 165, exitSec: 273, fadeInSec: 0, fadeOutSec: 0 },
      { enterSec: 327, exitSec: 435, fadeInSec: 0, fadeOutSec: 0 },
    ]);
    render(<TrackPoolRow track={track} candidates={[r]} pick={undefined} />);
    expect(screen.getByText('Wat·I')).toHaveAttribute('title', 'WATER · Introduction · 2:45–4:33, 5:27–7:15');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/remix/TrackPoolRow.test.tsx`
Expected: FAIL — the chip has no `title` attribute.

- [ ] **Step 3: Implement**

In `src/components/remix/TrackPoolRow.tsx`, add above the `chip` helper:

```ts
const SECTION_LABEL: Record<AuthoredRule['section'], string> = {
  INTRODUCTION: 'Introduction', DEEP_RELAXATION: 'Deep Relaxation', RETURN: 'Return',
};
const clock = (s: number): string => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** Hover detail: which element and section a candidate came from, and when it actually sounds. */
const chipTitle = (r: AuthoredRule): string =>
  `${r.source.element} · ${SECTION_LABEL[r.section]} · ` +
  r.phrases.map((p) => `${clock(p.enterSec)}–${clock(p.exitSec)}`).join(', ');
```

Add `title={chipTitle(c)}` to the chip `<span>`, and `cursor-help` to its className so the affordance
is visible.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/remix`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npx tsc --noEmit
git add src/components/remix/TrackPoolRow.tsx src/components/remix/TrackPoolRow.test.tsx
git commit -m "feat(remix): hover a candidate chip for its element, section and intervals"
```

---

### Task 9: Time scale on the result timeline

`ResultTimeline` draws two hardcoded dividers at 33.3% and 66.7%. Those are the section boundaries of
a 30-minute session and are wrong for a 600s section module. Replace them with a real scale.

**Files:**
- Modify: `src/components/remix/ResultTimeline.tsx`
- Test: `src/components/remix/ResultTimeline.test.tsx`

**Interfaces:**
- Consumes: `totalSec` prop, already present.
- Produces: `tickStep(totalSec: number): number`, exported for the test.

- [ ] **Step 1: Write the failing test**

Append to `src/components/remix/ResultTimeline.test.tsx`:

```tsx
describe('tickStep', () => {
  it('picks a 5-minute step for a 30-minute session', () => {
    expect(tickStep(1800)).toBe(300);
  });
  it('picks a 2-minute step for a 10-minute module', () => {
    expect(tickStep(600)).toBe(120);
  });
});

describe('ResultTimeline scale', () => {
  const tracks = [{
    id: 't', category: 'MELODY' as const, label: 'MELODY',
    sample: { name: '', path: '', bytes: 0 }, ceilingDb: 0, locked: false,
  }];

  it('labels a 30-minute session every 5 minutes', () => {
    render(<ResultTimeline totalSec={1800} tracks={tracks} regions={[]} />);
    for (const label of ['0:00', '5:00', '10:00', '15:00', '20:00', '25:00', '30:00']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('positions a tick at its fraction of the timeline', () => {
    render(<ResultTimeline totalSec={1800} tracks={tracks} regions={[]} />);
    expect(screen.getByTestId('tick-900').style.left).toBe('50%');
  });

  it('rescales for a 10-minute section module', () => {
    render(<ResultTimeline totalSec={600} tracks={tracks} regions={[]} />);
    expect(screen.getByText('10:00')).toBeInTheDocument();
    expect(screen.queryByText('30:00')).toBeNull();
  });
});
```

Add `tickStep` to the import from `./ResultTimeline`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/remix/ResultTimeline.test.tsx`
Expected: FAIL — `tickStep is not a function`.

- [ ] **Step 3: Implement**

In `src/components/remix/ResultTimeline.tsx`, add above the component:

```ts
const NICE_STEPS = [30, 60, 120, 300, 600, 900, 1800];

/** The coarsest nice step that still yields at most 8 ticks — keeps the scale readable whether the
 *  timeline is a 30-minute session or a 10-minute section module. */
export function tickStep(totalSec: number): number {
  return NICE_STEPS.find((s) => totalSec / s <= 8) ?? NICE_STEPS[NICE_STEPS.length - 1];
}

const clock = (s: number): string => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
```

Inside the component, build the ticks and render a scale row above the lanes. Replace the opening of
the returned JSX so the scale sits in the same grid as the lanes (a `w-28` gutter, then the track area):

```tsx
  const step = tickStep(totalSec);
  const ticks = Array.from({ length: Math.floor(totalSec / step) + 1 }, (_, i) => i * step);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-end gap-2">
        <span className="w-28 shrink-0" aria-hidden />
        <div className="relative h-4 flex-1">
          {ticks.map((t) => (
            <span
              key={t}
              data-testid={`tick-${t}`}
              className="absolute bottom-0 -translate-x-1/2 text-[10px] text-muted-foreground tabular-nums"
              style={{ left: pct(t) }}
            >
              {clock(t)}
            </span>
          ))}
        </div>
      </div>
      {tracks.map((t) => (
```

Move the `const pct = ...` line above this block so it is defined before use. Delete the two
hardcoded divider `<span>`s at `left: '33.3333%'` and `'66.6667%'` from the lane markup, and instead
draw a faint gridline per tick inside each lane, right after the lane's opening `<div className="relative h-4 flex-1 …">`:

```tsx
            {ticks.slice(1, -1).map((t) => (
              <span key={t} className="absolute inset-y-0 w-px bg-border/60" style={{ left: pct(t) }} aria-hidden />
            ))}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/remix`
Expected: PASS — including the existing `region-t-900` positioning test.

- [ ] **Step 5: Commit**

```bash
npx tsc --noEmit
git add src/components/remix/ResultTimeline.tsx src/components/remix/ResultTimeline.test.tsx
git commit -m "feat(remix): time scale on the result timeline, rescaling with the draw"
```

---

### Task 10: Full check

**Files:** none created; fix whatever the checks surface.

- [ ] **Step 1: Run the whole suite**

Run: `npm test`
Expected: PASS, all files. Baseline before this plan was 277 tests in 61 files; this plan adds roughly
25 more. The `HTMLCanvasElement getContext` notice from another suite is pre-existing noise, not a failure.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0, no output.

- [ ] **Step 3: Lint the code this plan touched**

Run: `npx eslint src/remix src/components/remix src/arrange`
Expected: `src/arrange/useLayer2Engine.ts` still reports its **pre-existing** `react-hooks` errors —
leave them. Nothing new from `src/remix` or `src/components/remix`.

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "chore(remix): full check green after section picker and playback work"
```

---

### Task 11: Manual smoke in a real browser

This is the step the previous round never did — every earlier claim about `/remix` was HTTP-level or
test-level only.

**Preconditions (a fresh worktree has none of these):**
- `node_modules` junction to the main repo.
- `src/manifest.json` copied from the main repo (gitignored; `npm run build:manifest` regenerates).
- **`ECOSONIC FILES` junction to the main repo** — without it every `/api/samples/...` returns 404 and both Play and Export fail silently. Create with:
  `New-Item -ItemType Junction -Path "<worktree>\ECOSONIC FILES" -Target "<mainRepo>\ECOSONIC FILES"`

- [ ] **Step 1: Start the dev server**

Run: `npm run dev` from the worktree root. It uses port 3001 if 3000 is taken. If it reports
"Another next dev server is already running", reuse that one.

- [ ] **Step 2: Verify each control by hand at `/remix`**

- Toggle Cross-element ↔ Scoped; pick each element chip.
- Switch Full session → Intro → Deep Relaxation → Return. Confirm the timeline scale relabels
  (0:00–30:00 vs 0:00–10:00) and the heading names the section.
- Hover several candidate chips; confirm the element, section and intervals appear.
- Hit **🎲 Regenerate** a few times and confirm the lit chip and the lanes change.
- Hit **▶ Play**. Confirm audio starts and the playhead advances. This is the assertion that
  Tasks 5–7 actually worked.
- Hit **⬇ Export WAV** on a *section* draw first (~212 MB render) before trying a full session
  (~635 MB). Confirm the file downloads and opens.

- [ ] **Step 3: Report honestly**

Record which controls you actually exercised and which you did not. Do not claim Play or Export work
without having heard audio and opened the file.

---

## Notes for the implementer

- **Do not re-litigate** the locked decisions in §10 of the spec: full session default, fixed 600s
  section module, per-rule rebasing, shared Layer 2 hooks.
- **Known and parked:** WATER and ETHER have `ELEMENT_SUB` rules but no `ELEMENT_SUB` samples, so the
  generator skips those tracks with a warning. That is authored-content drift, not a code defect.
- **`poolFor` in `src/remix/sessionRules.ts:32` is dead code** — only its own test uses it. Leave it;
  removing it is a separate decision.
- Task 2 leaves `useRemix.ts` briefly untypecheckable; do Tasks 2 and 3 back-to-back if you want a
  green `tsc` at every commit.

# Remix — Borrowed Timings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a third `/remix` draw mode where every track's audio comes from one user-chosen element while the timings are drawn from every element's authored rules.

**Architecture:** The generator today couples audio to rules in exactly one place — a "lead" rule is drawn per category, its element fixes the sample, and the per-section rules are then filtered to that same element. Adding an optional `sampleElement` splits that single decision in two: the sample comes from `sampleElement` when set, and the per-section filter is skipped. Everything downstream (per-rule `rebase`, `STACK_ORDER`, absence handling, seeded determinism) is unchanged. The UI gains a third pill sharing Scoped's element state, and the timeline colours bars by the sample element while candidate chips keep the rule element.

**Tech Stack:** TypeScript, React 19, Next.js (app router), Zustand-style vanilla store, Vitest + Testing Library, Tailwind.

## Global Constraints

- Mode label is exactly **`Borrowed timings`** — asserted in the UI test.
- `RemixMode` value is exactly **`'borrowed'`**.
- Borrowed **shares** the existing `element` state with Scoped — no second piece of state.
- `arrangementStore.element` in borrowed mode receives the **sample element**.
- `element` and `sampleElement` both set must **not throw**: both filters apply, and setting them to the same element must be byte-identical to Scoped on that element.
- Do **not** write a test asserting the same seed produces the same draw across two different modes — the number of `rng.float()` calls differs because the per-section candidate pool differs.
- Existing behaviour of Cross-element and Scoped must not change: the full suite (391 tests at baseline) stays green throughout.
- Run from the worktree root: `C:\Users\cyril varghese\code\ecosonic\.claude\worktrees\remix-borrowed-timings`.

---

### Task 1: Generator — `sampleElement`

**Files:**
- Modify: `src/remix/generateRemix.ts:39-118`
- Test: `src/remix/generateRemix.test.ts` (append a new `describe` block)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `generateRemix(pool, manifest, opts)` where `opts` is
  `{ seed: number; element?: ElementName; sampleElement?: ElementName; section?: Mode; sessionSec: number }`.
  Task 2 calls this with `sampleElement`.

**Existing test helpers to reuse** (already at the top of `generateRemix.test.ts`, do not redefine):
`fakeManifest(empty?)` — every element×category holds one sample named `EL-CAT`; `ph(enter, exit, fadeIn?, fadeOut?)`; `rule(category, element, phrases?, variant?, section?, sectionStartSec?)`; `const SESSION = { sessionSec: 1800 }`.

- [ ] **Step 1: Write the failing tests**

Append to `src/remix/generateRemix.test.ts`:

```typescript
describe('generateRemix — borrowed timings', () => {
  const BASE = { seed: 1, sessionSec: 1800 };

  // One bed authored by three different elements across the three sections — the shape that lets a
  // borrowed draw visibly span elements within a single track.
  const bedFromManyElements = [
    rule('NOISE', 'EARTH', [ph(0, 600)], undefined, 'INTRODUCTION', 0),
    rule('NOISE', 'WATER', [ph(600, 1200)], undefined, 'DEEP_RELAXATION', 600),
    rule('NOISE', 'AIR', [ph(1200, 1800)], undefined, 'RETURN', 1200),
  ];

  it('takes every sample from the chosen element whatever rule won', () => {
    const pool = [...bedFromManyElements, rule('PAD', 'FIRE'), rule('MELODY', 'ETHER')];
    for (let seed = 1; seed <= 10; seed++) {
      const { tracks } = generateRemix(pool, fakeManifest(), {
        ...BASE, seed, sampleElement: 'EARTH',
      });
      expect(tracks.length).toBeGreaterThan(0);
      expect(tracks.every((t) => t.sample.name === `EARTH-${t.category}`)).toBe(true);
    }
  });

  it('draws one track’s rules from several elements at once', () => {
    const { picks } = generateRemix(bedFromManyElements, fakeManifest(), {
      ...BASE, sampleElement: 'EARTH',
    });
    expect(picks.map((p) => p.rule.source.element)).toEqual(['EARTH', 'WATER', 'AIR']);
    expect(new Set(picks.map((p) => p.track)).size).toBe(1);
  });

  it('rebases a borrowed rule by its own section start, not the sample element’s', () => {
    // AIR opens Deep Relaxation at 9:30 (570s). Borrowing it under EARTH audio must still shift by
    // 570 — the rule's own origin — or the window lands 30s late.
    const pool = [rule('MELODY', 'AIR', [ph(600, 900)], undefined, 'DEEP_RELAXATION', 570)];
    const { regions, tracks } = generateRemix(pool, fakeManifest(), {
      ...BASE, section: 'DEEP_RELAXATION', sampleElement: 'EARTH',
    });
    expect(regions[0]).toMatchObject({ trackId: 'MELODY', enterSec: 30, exitSec: 330 });
    expect(tracks[0].sample.name).toBe('EARTH-MELODY');
  });

  it('makes a rule usable whose own element ships no sample for the category', () => {
    // WATER authors ELEMENT_SUB but ships no ELEMENT_SUB sample, so scoped/cross skip the track.
    const pool = [rule('ELEMENT_SUB', 'WATER')];
    const manifest = fakeManifest({ WATER: ['ELEMENT_SUB'] });

    const cross = generateRemix(pool, manifest, BASE);
    expect(cross.tracks).toEqual([]);

    const borrowed = generateRemix(pool, manifest, { ...BASE, sampleElement: 'EARTH' });
    expect(borrowed.tracks.map((t) => t.sample.name)).toEqual(['EARTH-ELEMENT_SUB']);
    expect(borrowed.warnings).toEqual([]);
  });

  it('warns with the sample element when that element lacks the sample', () => {
    const { tracks, warnings } = generateRemix([rule('DRONE', 'WATER')], fakeManifest({ EARTH: ['DRONE'] }), {
      ...BASE, sampleElement: 'EARTH',
    });
    expect(tracks).toEqual([]);
    expect(warnings[0]).toContain('EARTH');
    expect(warnings[0]).not.toContain('WATER');
  });

  it('repeats its draw for a seed', () => {
    const pool = [...bedFromManyElements, rule('MELODY', 'FIRE'), rule('MELODY', 'ETHER')];
    const manifest = fakeManifest();
    expect(generateRemix(pool, manifest, { ...BASE, seed: 7, sampleElement: 'EARTH' }))
      .toEqual(generateRemix(pool, manifest, { ...BASE, seed: 7, sampleElement: 'EARTH' }));
  });

  it('is exactly Scoped when the borrowed element is the element it is scoped to', () => {
    const pool = [...bedFromManyElements, rule('MELODY', 'EARTH'), rule('MELODY', 'WATER')];
    const manifest = fakeManifest();
    for (let seed = 1; seed <= 5; seed++) {
      expect(generateRemix(pool, manifest, { ...BASE, seed, element: 'EARTH', sampleElement: 'EARTH' }))
        .toEqual(generateRemix(pool, manifest, { ...BASE, seed, element: 'EARTH' }));
    }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/remix/generateRemix.test.ts`

Expected: FAIL. `sampleElement` is not in the `opts` type, so TypeScript/vitest reports an object-literal error; at runtime the option is ignored, so `takes every sample from the chosen element` fails with a sample name like `WATER-NOISE` instead of `EARTH-NOISE`.

- [ ] **Step 3: Write the minimal implementation**

In `src/remix/generateRemix.ts`, widen the signature (line 39-43):

```typescript
export function generateRemix(
  pool: AuthoredRule[],
  manifest: Manifest,
  opts: {
    seed: number;
    element?: ElementName;
    /** Borrowed timings: take ALL audio from this element, whatever rule wins. */
    sampleElement?: ElementName;
    section?: Mode;
    sessionSec: number;
  },
): RemixDraw {
```

Replace lines 63-76 (the lead draw, the sample lookup and the element filter) with:

```typescript
    // One SAMPLE per track: a track is a single file. Which element that file comes from is either
    // fixed by the caller (borrowed timings) or follows the lead rule — and only in the latter case
    // does a rule's element decide anything, so only then are the per-section rules filtered to it.
    const lead = cands[Math.floor(rng.float() * cands.length)];
    const audioElement = opts.sampleElement ?? lead.source.element;

    const samples = manifest[audioElement]?.[category] ?? [];
    if (samples.length === 0) {
      warnings.push(`${category}: no ${audioElement} sample for the picked rule — track skipped`);
      continue;
    }

    // A section draw is exactly one rule. A full session takes one rule per section, so the track
    // sounds across the whole timeline instead of only its lead's third.
    const forSections = opts.sampleElement
      ? cands
      : cands.filter((r) => r.source.element === audioElement);
```

The block above renames the declaration; rename its one remaining use in the section loop (line 82):

```typescript
        const inSection = forSections.filter((r) => r.section === mode);
```

And make the falls-outside warning name the rules' own elements, which in borrowed mode are not the audio element (line 96-99):

```typescript
    if (drawn.length === 0) {
      const from = [...new Set(chosen.map((c) => c.rule.source.element))].join('/');
      warnings.push(`${category}: the ${from} rule falls outside the module — track skipped`);
      continue;
    }
```

Update the doc comment above the function (line 31-32) to describe the third choice:

```typescript
 *   - `element` set ⇒ Scoped to that element's rules; omitted ⇒ Cross-element, the whole pool.
 *   - `sampleElement` set ⇒ Borrowed timings: every track plays THAT element's audio while its
 *     rules are drawn from every element. A rule then carries pure timing, which is all it ever
 *     held — it is §3.5 (sample follows the pick) that made a rule's element mean anything.
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/remix/generateRemix.test.ts`
Expected: PASS — the seven new tests plus all pre-existing ones in the file.

- [ ] **Step 5: Commit**

```bash
git add src/remix/generateRemix.ts src/remix/generateRemix.test.ts
git commit -m "feat(remix): generator can fix the sample element and borrow timings from all"
```

---

### Task 2: `useRemix` — third mode, passthrough, candidates

**Files:**
- Modify: `src/components/remix/useRemix.ts:14-15,48,70-81,85-110`
- Test: `src/components/remix/useRemix.test.ts` (append a new `describe` block)

**Interfaces:**
- Consumes: `generateRemix(..., { sampleElement })` from Task 1.
- Produces: `RemixMode = 'scoped' | 'cross' | 'borrowed'` exported from `./useRemix`; `RemixState.mode` may now be `'borrowed'`. Tasks 3 and 4 import `RemixMode` and read `mode`/`element`.

**Existing test fixtures to reuse** (already at the top of `useRemix.test.ts`, do not redefine): the hoisted `MANIFEST` mock where every element×category has one `EL-CAT` sample except `ETHER.DRONE`; `rule(category, element, section?, sectionStartSec?, phrases?)`; `STORE` (WATER authors MELODY; FIRE authors MELODY, PAD, and BASS in RETURN); `stubSessions`; `elementOf(state, category)`.

- [ ] **Step 1: Write the failing tests**

Append to `src/components/remix/useRemix.test.ts`:

```typescript
describe('useRemix — borrowed timings', () => {
  it('plays one element’s samples while the picks come from anywhere', async () => {
    const { result } = renderHook(() => useRemix());
    await waitFor(() => expect(result.current.tracks).toHaveLength(3));

    act(() => result.current.setMode('borrowed'));
    act(() => result.current.setElement('EARTH'));

    // EARTH authors nothing, yet every track the whole pool covers is still drawn.
    expect(result.current.tracks.map((t) => t.category)).toEqual(['PAD', 'BASS', 'MELODY']);
    expect(result.current.tracks.every((t) => t.sample.name === `EARTH-${t.category}`)).toBe(true);
    expect(result.current.picks.every((p) => p.rule.source.element !== 'EARTH')).toBe(true);
  });

  it('offers every element’s rules as candidates, filtered by section only', async () => {
    const { result } = renderHook(() => useRemix());
    await waitFor(() => expect(result.current.tracks).toHaveLength(3));

    act(() => result.current.setMode('borrowed'));
    act(() => result.current.setElement('EARTH'));

    // Both authored MELODY rules are drawable, so both must be offered.
    expect(result.current.candidatesFor('MELODY').map((r) => r.source.element).sort())
      .toEqual(['FIRE', 'WATER']);

    act(() => result.current.setSection('RETURN'));
    expect(result.current.candidatesFor('MELODY')).toEqual([]);
    expect(result.current.candidatesFor('BASS')).toHaveLength(1);
  });

  it('tells arrangementStore the element you actually hear', async () => {
    const { result } = renderHook(() => useRemix());
    await waitFor(() => expect(result.current.tracks).toHaveLength(3));

    act(() => result.current.setMode('borrowed'));
    act(() => result.current.setElement('AIR'));

    await waitFor(() => expect(arrangementStore.getState().element).toBe('AIR'));
  });

  it('carries the element across a mode switch', async () => {
    const { result } = renderHook(() => useRemix());
    await waitFor(() => expect(result.current.tracks).toHaveLength(3));

    act(() => result.current.setMode('scoped'));
    act(() => result.current.setElement('FIRE'));
    act(() => result.current.setMode('borrowed'));

    expect(result.current.element).toBe('FIRE');
    expect(result.current.tracks.every((t) => t.sample.name.startsWith('FIRE-'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/remix/useRemix.test.ts`
Expected: FAIL — `setMode('borrowed')` is not assignable to `RemixMode`, and at runtime `'borrowed'` is treated as "not scoped", so samples follow the picked rule (`WATER-MELODY`) rather than `EARTH-MELODY`.

- [ ] **Step 3: Write the minimal implementation**

In `src/components/remix/useRemix.ts`, widen the mode type (line 14-15):

```typescript
/** `cross` draws every track from the whole authored pool; `scoped` from one element's rules only;
 *  `borrowed` draws timings from every element but plays them all through one element's samples. */
export type RemixMode = 'scoped' | 'cross' | 'borrowed';
```

Replace line 70-71 with both derivations:

```typescript
  // The modes differ only here. Scoped narrows the RULES; borrowed fixes the AUDIO and leaves the
  // rules wide open. Both read the same `element` state, so switching modes keeps your choice.
  const scopedTo = mode === 'scoped' ? element : undefined;
  const sampleElement = mode === 'borrowed' ? element : undefined;
```

Pass it to the generator and add it to the memo deps (line 73-81):

```typescript
  const draw = useMemo(
    () => generateRemix(pool, manifest, {
      seed,
      element: scopedTo,
      sampleElement,
      section: section ?? undefined,
      sessionSec: sessionMin * 60,
    }),
    [pool, seed, scopedTo, sampleElement, section, sessionMin],
  );
```

In the store effect, report the element actually heard (line 88) and extend the deps (line 101):

```typescript
        // Borrowed mode has one element for all its audio even though its rules do not, so the
        // store hears about it — this field describes the sound, not the rule scope.
        element: scopedTo ?? sampleElement ?? null,
```

```typescript
  }, [draw, scopedTo, sampleElement, sessionMin]);
```

`candidatesFor` needs no change: `scopedTo` is already `undefined` in borrowed mode, so it filters by section only — which is exactly what the generator does.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/remix/useRemix.test.ts`
Expected: PASS — four new tests plus all pre-existing ones.

- [ ] **Step 5: Commit**

```bash
git add src/components/remix/useRemix.ts src/components/remix/useRemix.test.ts
git commit -m "feat(remix): useRemix gains the borrowed-timings mode"
```

---

### Task 3: `RemixView` — the third pill

**Files:**
- Modify: `src/components/remix/RemixView.tsx:25-39,189-205,287-294`
- Test: `src/components/remix/RemixView.test.tsx` (append a new `describe` block)

**Interfaces:**
- Consumes: `RemixMode` including `'borrowed'`, and `mode`/`element`/`setMode`/`setElement` from Task 2.
- Produces: a button labelled `Borrowed timings`; the element chip row rendered for both `scoped` and `borrowed`, preceded by a `Sound:` caption in borrowed mode only.

**Note on existing test setup:** `RemixView.test.tsx` already mocks `@/audio/AudioEngine`, `@/arrange/useModuleScheduler` and `@/remix/renderFreeMix`, and stubs `fetch` with a rule store. Reuse whatever `beforeEach` is already in the file; add no new mocks.

- [ ] **Step 1: Write the failing tests**

Append to `src/components/remix/RemixView.test.tsx`:

```typescript
describe('RemixView — borrowed timings', () => {
  it('offers a third mode that keeps the element chips, captioned as sound', async () => {
    render(<RemixView />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Borrowed timings' })).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: 'Borrowed timings' }));

    expect(screen.getByRole('button', { name: 'Borrowed timings' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Cross-element' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('Sound:')).toBeInTheDocument();
    for (const el of ['EARTH', 'WATER', 'AIR', 'FIRE', 'ETHER']) {
      expect(screen.getByRole('button', { name: el })).toBeInTheDocument();
    }
  });

  it('names the element whose samples every track will play', async () => {
    render(<RemixView />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Borrowed timings' })).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: 'Borrowed timings' }));
    await userEvent.click(screen.getByRole('button', { name: 'FIRE' }));

    expect(screen.getByText(/every track plays FIRE's samples, on timings drawn from every element/))
      .toBeInTheDocument();
  });

  it('shows no Scoped caption when Scoped is the mode', async () => {
    render(<RemixView />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Scoped' })).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: 'Scoped' }));

    expect(screen.getByRole('button', { name: 'EARTH' })).toBeInTheDocument();
    expect(screen.queryByText('Sound:')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/remix/RemixView.test.tsx`
Expected: FAIL with `Unable to find an accessible element with the role "button" and name "Borrowed timings"` — `MODES` still has only two entries.

- [ ] **Step 3: Write the minimal implementation**

In `src/components/remix/RemixView.tsx`, add the pill (line 25-28):

```typescript
const MODES: { value: RemixMode; label: string }[] = [
  { value: 'cross', label: 'Cross-element' },
  { value: 'scoped', label: 'Scoped' },
  { value: 'borrowed', label: 'Borrowed timings' },
];
```

The borrowed hint has to name the chosen element, so `HINT` becomes a lookup of functions (line 36-39):

```typescript
const HINT: Record<RemixMode, (el: ElementName) => string> = {
  cross: () => 'every track draws from the whole pool — its sample follows the element it picked',
  scoped: () => "every track draws from one element's rules, and that element's samples",
  borrowed: (el) => `every track plays ${el}'s samples, on timings drawn from every element`,
};
```

Render the chip row for both element-bearing modes, captioned only in borrowed — where the chips
mean *sound* rather than *scope* (line 189-203):

```typescript
        {(mode === 'scoped' || mode === 'borrowed') && (
          <div className="flex flex-wrap items-center gap-1">
            {mode === 'borrowed' && (
              <span className="mr-0.5 text-xs text-muted-foreground">Sound:</span>
            )}
            {ELEMENTS.map((el) => (
              <button
                key={el}
                type="button"
                aria-pressed={el === element}
                onClick={() => setElement(el)}
                className={`${CHIP} ${el === element ? LIT : 'border-border text-muted-foreground opacity-70 hover:opacity-100'}`}
              >
                {el}
              </button>
            ))}
          </div>
        )}
```

Call the hint with the element (line 205):

```typescript
        <p className="text-xs text-muted-foreground">{HINT[mode](element)}</p>
```

The empty-state copy is only reachable in scoped mode — borrowed never narrows the rule pool, so a
draw is empty only when nothing is loaded at all. Leave line 287-294 as it is.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/remix/RemixView.test.tsx`
Expected: PASS — three new tests plus all pre-existing ones.

- [ ] **Step 5: Commit**

```bash
git add src/components/remix/RemixView.tsx src/components/remix/RemixView.test.tsx
git commit -m "feat(remix): a Borrowed timings pill with a Sound element row"
```

---

### Task 4: Colour — bars follow the sample, chips follow the rule

**Files:**
- Modify: `src/components/remix/RemixView.tsx:70-71`
- Test: `src/components/remix/RemixView.test.tsx` (append to the borrowed `describe` from Task 3)

**Interfaces:**
- Consumes: `mode` and `element` from Task 2; the `trackElements` prop of `ResultTimeline`
  (`Record<string, string>`, trackId → element name, lower-cased onto `data-element`).
- Produces: nothing new — `ResultTimeline` and `TrackPoolRow` are untouched.

**Why this is a fix and not just a preference:** `trackElements` is built with `Object.fromEntries`
over `picks`, and a full-session draw has **one pick per track per section**. In cross/scoped mode
those picks all share an element so the collapse is harmless. In borrowed mode they differ, so the
bar colour would be whichever pick happened to be last — arbitrary, not merely wrong.

- [ ] **Step 1: Write the failing test**

Append inside the `describe('RemixView — borrowed timings')` block:

```typescript
  it('colours every bar by the sample element while chips keep their own', async () => {
    const { container } = render(<RemixView />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Borrowed timings' })).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: 'Borrowed timings' }));
    await userEvent.click(screen.getByRole('button', { name: 'ETHER' }));

    // What you HEAR is one element, so every bar is one colour.
    const bars = container.querySelectorAll('[data-testid^="region-"]');
    expect(bars.length).toBeGreaterThan(0);
    expect([...bars].every((b) => b.getAttribute('data-element') === 'ether')).toBe(true);

    // Where the TIMING came from is the interesting information here, so the chips still differ.
    const chips = container.querySelectorAll('.cursor-help[data-element]');
    const chipElements = new Set([...chips].map((c) => c.getAttribute('data-element')));
    expect(chipElements.has('ether')).toBe(false);
    expect(chipElements.size).toBeGreaterThan(0);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/remix/RemixView.test.tsx -t 'colours every bar'`
Expected: FAIL — bars carry `water`/`fire` (the rule elements) rather than `ether`, so the
`every(... === 'ether')` assertion is `false`.

- [ ] **Step 3: Write the minimal implementation**

In `src/components/remix/RemixView.tsx`, replace line 70-71:

```typescript
  // Borrowed timings splits audio from timing, so colour has to pick a side per surface. Bars are
  // what you HEAR — one sample element, one colour, and a visible signal the mode is on. The pool
  // chips keep the rule's element, because which element's pattern won each section is the whole
  // point of the mode. (This also fixes a latent collapse: a full-session draw has one pick per
  // section, so mapping picks→element would otherwise leave the last one winning arbitrarily.)
  const trackElements = Object.fromEntries(
    picks.map((p) => [p.track.id, mode === 'borrowed' ? element : p.rule.source.element]),
  );
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/remix/RemixView.test.tsx`
Expected: PASS — all tests in the file.

- [ ] **Step 5: Commit**

```bash
git add src/components/remix/RemixView.tsx src/components/remix/RemixView.test.tsx
git commit -m "fix(remix): bars take the sample element, chips keep the rule element"
```

---

### Task 5: Docs — `remix-rules.md`

**Files:**
- Modify: `docs/remix-rules.md:7-9,52-62,76-91,165-171`

**Interfaces:**
- Consumes: the behaviour built in Tasks 1-4.
- Produces: nothing code-facing.

- [ ] **Step 1: Add the design doc to the Related line**

Replace line 7-9:

```markdown
Related: [free-mix design](./superpowers/specs/2026-07-26-remix-view-free-mix-design.md) ·
[scoped & cross-element](./superpowers/specs/2026-07-27-remix-scoped-and-cross-element-modes-design.md) ·
[section picker & playback](./superpowers/specs/2026-07-27-remix-section-picker-and-playback-design.md) ·
[borrowed timings](./superpowers/specs/2026-07-28-remix-borrowed-timings-design.md)
```

- [ ] **Step 2: Add the third mode to the §3 table**

Replace line 54-62:

```markdown
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
```

- [ ] **Step 3: Make §3.4 conditional and §3.5 cover the fixed sample**

Replace line 76-88:

```markdown
**3.4 — Every rule of a track comes from one element — *unless the sample is fixed*.**
*(structural given §3.5, not absolute)*
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
```

- [ ] **Step 4: Note the narrowed gap in §3.6**

Replace line 89-91:

```markdown
**3.6 — No sample, no track.** If the element has no sample for that category, the track is skipped
with a warning. *Known gap: WATER and ETHER author `ELEMENT_SUB` rules but ship no `ELEMENT_SUB`
samples, so that track disappears whenever the draw lands on either.* **Borrowed timings** narrows
this: those rules become usable as timing whenever the chosen sample element has the sample, so the
warning is rare in that mode.
```

- [ ] **Step 5: Record the colour split in §7**

Replace line 170:

```markdown
- **Colour** is the element's brand colour, on both chips and bars, via `data-element`. In
  **Borrowed timings** audio and timing disagree, so each surface takes the one it represents:
  **bars take the sample element** (they are what you hear — every bar one colour, which is also the
  visible signal the mode is on) and **chips keep the rule element** (they are where the timing came
  from, which is the interesting information in that mode). An all-EARTH timeline fed by chips of
  five colours is the mode made visible, not an inconsistency.
```

- [ ] **Step 6: Commit**

```bash
git add docs/remix-rules.md
git commit -m "docs(remix): borrowed timings — 3.4 is conditional on 3.5, not absolute"
```

---

### Task 6: Full check and manual smoke

**Files:** none modified unless a check fails.

- [ ] **Step 1: Run the whole suite**

Run: `npx vitest run`
Expected: PASS, 65 files, ≥391 tests (baseline 391 + 15 new), 0 failures.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 3: Lint the touched trees**

Run: `npx eslint src/remix src/components/remix`
Expected: no output.

- [ ] **Step 4: Manual smoke in the browser**

Run: `npm run dev`, open `/remix`.
1. Click **Borrowed timings**, pick **EARTH**.
2. Confirm every bar on the result timeline is EARTH-green while the pool chips span several colours.
3. Hover a lit chip — the title must name the *timing's* element (e.g. `FIRE · Return · 22:00–25:00`)
   even though the audio is EARTH.
4. Press **Regenerate** a few times; bars stay uniformly EARTH.
5. Press **Play** and confirm audio starts. (Needs the `ECOSONIC FILES` junction — without it every
   `/api/samples/…` 404s and Play fails silently.)

- [ ] **Step 5: Commit anything the checks forced**

Only if steps 1-3 required a fix:

```bash
git add -A
git commit -m "chore(remix): satisfy typecheck and lint for borrowed timings"
```

---

## Out of scope

Per-section separate tracks (§3.1 stands: one track per category) · crossfading loop wraps or
distinct picks · mixing sample elements *within* one track (a lane holds one file) · re-authoring any
session content · a separate element state for Borrowed (it shares Scoped's, by decision).

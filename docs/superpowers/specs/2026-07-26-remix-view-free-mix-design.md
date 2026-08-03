# Remix View — free-mix a session from authored rules

**Status:** Approved design · **Date:** 2026-07-26 · **Branch:** `feat/remix-view` (new, off `master`)
**Related:** [layer-two arrangement engine](./2026-07-03-layer-two-arrangement-engine-design.md) ·
[gen-b live scheduler](./2026-07-10-gen-b-live-scheduler-design.md) ·
[session chaining + export](./2026-07-16-layer-two-session-chaining-export-design.md) ·
[grammar variants](./2026-07-24-grammar-variants-design.md)

---

## 1. Problem / Goal

We have five authored **session timelines** (`air/fire/ether/water/earth-session-layer-timeline.md`),
each a ~30-min production organized into three ~10-min sections (Introduction / Deep Relaxation /
Return), each section listing per-track envelopes (`Starts · Full Level · Starts Leaving · Ends`,
sometimes multi-phrase). Across the files a track accumulates a pool of authored rules (MELODY ~10,
the beds up to ~15).

**Goal:** a **Remix view** that, for each track in the current Arrangement, **draws one authored rule
at random** from that track's pool (honoring absence — no rule ⇒ skipped), shows the pool and the pick
per track, assembles the picks into a playable ~30-min session, and **plays and exports** it.
Regenerate reshuffles. This is a *remix of authored material* — it samples **discrete authored rules**,
with no invariant repair and no other constraint ("any interval can be selected").

**Continuous timeline.** Transitions in the source cross section boundaries (fire's NOISE for the
Return begins at 19:00, in Relaxation; earth's SUB ELEMENTS begins 9:30, in the Intro; fire's ELEMENTS
fades out 10:00–12:00 and back in 19:00–20:00; NOISE runs "Continuous" across sections). So the model
is **one continuous absolute 0–`totalSec` timeline** (≈1800s). **Sections are metadata/labels**
(provenance, chip labels, what the parser reads to tag a rule) — **not** render boundaries. A rule is a
generic absolute-timestamped interval and may cross section lines freely.

## 2. Solution overview

```
config/sessions/*.md ──(parseSessionTimeline, shared)──▶ AuthoredRule[]  ──▶ rule store (per element)
   (5 seed files +                                        (absolute times,          │
    uploaded .md)                                          section = a tag)         │ pool(category)
                                                                                    ▼
   Arrange tracks (arrangementStore.tracks, w/ samples) ─┐
                                                        ├─▶ generateFreeMix(tracks, pool, seed)
   seed (🎲 Regenerate = new seed) ──────────────────── ┘        │
                                                                 ▼
                                        { regions: TemplateRegion[] (absolute 0..totalSec), picks }
                                                                 │
                    ┌────────────────────────────────┬──────────┴────────────────┐
                    ▼                                 ▼                            ▼
          Remix view (layout A):             ▶ Play → single ~30-min      ⬇ Export → renderModuleToWav
          per-track pool + pick,               module scheduler            ({tracks, regions, masterDb},
          continuous result timeline           (duration = totalSec)        cfg⊕{moduleSeconds:totalSec})
```

Picks keep their **absolute** times, so the generator emits a flat `TemplateRegion[]` on the 0–`totalSec`
timeline — exactly what `renderModuleToChannels` consumes when its module length is `totalSec`.

## 3. Data model — authored rule store

New module `src/remix/sessionRules.ts`:

```ts
type Section = Mode; // 'INTRODUCTION' | 'DEEP_RELAXATION' | 'RETURN' — a LABEL, not a boundary

interface Phrase { enterSec: number; exitSec: number; fadeInSec: number; fadeOutSec: number } // absolute

interface AuthoredRule {
  category: Category;         // mapped from track name (§5)
  variant?: string;          // 'MELODY 2' | 'SUB MELODY' | 'SUB MELODY 2' — display/label only in v1
  section: Section;           // metadata tag (where authored) — for chips/provenance, not rendering
  phrases: Phrase[];          // ≥1 absolute-timestamped segments; single-segment rules have length 1
  source: { element: ElementName; sessionId: string; track: string };
}
interface SessionDoc { id: string; element: ElementName; label: string; rules: AuthoredRule[]; }
type RuleStore = Record<ElementName, SessionDoc[]>; // multiple sessions per element
```

- **Times are absolute** (0..`totalSec`); no section-relative conversion, no clamping to a 10-min window
  — this is what lets a rule span the Relax→Return line.
- **`phrases`** carries per-segment fades, so a multi-part rule (fire's ELEMENTS: fade-out 10:00–12:00 +
  fade-in 19:00–20:00) is **one pool entry** that renders as several regions with independent envelopes.
- **Pool for a track** = every `AuthoredRule` whose mapped `category` equals the track's category,
  across all sessions/elements. Absence is automatic (no matching rule ⇒ empty pool ⇒ skip). The
  `section` tag still lets the UI show "absent in Relaxation" etc.
- **Seed source:** the five `.md` files are copied into `config/sessions/` (tracked) on this branch —
  current edited versions (air S2 NOISE fixed; fire S2 ELEMENTS split into its two segments; water from
  the PDF spec). Each file is its own authored session from a distinct source (§10 data audit).

## 4. Markdown parser — `parseSessionTimeline(md, element) → { rules, warnings }`

`src/remix/parseSessionTimeline.ts`. Shared by the seed and uploads (G1). Steps:

1. **Sections from headers.** `## Section N - Name (M:SS-M:SS)` → index→Mode tag (1→INTRODUCTION, …) and
   the section's `[start,end]` window. The window is used **only** to tag a row's section (the section a
   row's start falls in / the header it appears under) — times themselves stay **absolute**.
2. **Rows → rule.** `Layer | Starts | Full Level | Starts Leaving | Ends`: `enter=start`, `exit=end`,
   `fadeIn = fullLevel − start` (if timed, else 0), `fadeOut = end − startsLeaving` (if timed, else 0).
3. **Fuzzy tokens → plain numbers (G3):** `~X→X`; `End of section→section end`; `End of (each) phrase→`
   phrase end; `Continuous / Automation only→` spans to the session's end (continuous bed); bare `-`→ no
   fade; a **whole-empty row (all `-`)→ absent** (no rule).
4. **Phrases (G2).** A comma list (`2:45-4:33, 5:27-7:15`) → multiple `phrases` sharing the row's fades
   (fades on the outer edges). **Multiple rows for the same layer in one section** (fire's two ELEMENTS
   rows) → **one rule** whose `phrases` are those rows, **each keeping its own fades**. Every phrase
   renders as its own region.
5. **Vocabulary map (§5)** on the layer name.
6. **Validation.** A **temporally-impossible row** (`start ≥ end` after resolution) is **flagged +
   skipped** into `warnings`; the rest of the file still parses (G4). No build step — `/api/sessions`
   parses fresh at runtime (§7); a CI test asserts the five seed files parse with **zero** warnings.

## 5. Vocabulary mapping (authored layer name → `Category`)

`ELEMENTS→ELEMENT`, `SUB ELEMENTS→ELEMENT_SUB`, `PLANET`/`PLANETS→PLANET`,
`ISO/NOISE/BASS/PAD/ARP/MELODY` 1:1. `MELODY 2 / SUB MELODY / SUB MELODY 2 → MELODY`, original name in
`variant` (v1: a MELODY track may draw any melody-family rule; variant is label-only). Code categories
`DRONE`/`FX` have no authored rules ⇒ empty pools ⇒ never drawn. Unknown names → `warnings`, skipped.

## 6. Free-mix generator — `generateFreeMix(tracks, pool, seed)`

`src/remix/generateFreeMix.ts`, pure and seeded (reuses `makeRng` from `@/arrange/prng`):

```ts
function generateFreeMix(tracks: ArrTrack[], pool: AuthoredRule[], seed: number):
  { regions: TemplateRegion[]; picks: Pick[] }   // regions carry ABSOLUTE enter/exit (0..totalSec)
```

Per track: `cands = pool.filter(r => r.category === track.category)`; **empty ⇒ skip (absent)**; else
`rule = rng.pick(cands)`. Emit **one `TemplateRegion` per phrase** of the chosen rule
(`{ trackId, enterSec, exitSec, fadeInSec, fadeOutSec }`, absolute), pushed onto the flat `regions`
list. **No section bucketing, no invariant repair** — sparse/briefly-silent output is accepted (G5).
`picks` (trackId → chosen rule + its pool) drives the UI. Deterministic: same tracks + pool + seed ⇒
same result; Regenerate = `seed++`.

## 7. Runtime wiring

**Server — `/api/sessions` (`runtime = 'nodejs'`)**, mirroring the grammar-variants pattern:
- `GET` → read every `config/sessions/*.md` fresh (element from filename/title), parse, return
  `{ store: RuleStore, warnings }`.
- `POST` (upload) → parse a `.md` body; on success write it to `config/sessions/{element}-{slug}.md`
  and return the new `SessionDoc` + warnings; unparseable/no-rows → 422.

**Render / export.** `renderModuleToWav({ tracks, regions, masterDb }, cfg⊕{ layerTwo:{ …, moduleSeconds:
totalSec } })` — the existing single-module offline renderer, sized to the full session. No
concatenation, no `regionsByMode`. `totalSec` = `durationMin·60` (default 1800).

**Play.** Reuse the single-module live path (`useModuleScheduler` / `arrangementStore.play`) over a
module whose length is `totalSec`. This needs the scheduler + position UI to honor a **per-play
duration** rather than the global `config.layerTwo.moduleSeconds` — a small, contained change (thread
`totalSec` through, or a cfg override in a dedicated `playFreeMix(regions, totalSec)` store action).
*(Verify during build; export via `renderModuleToWav` already takes the cfg override cleanly.)*

The Remix view holds the fetched `store`, the current `seed`, and the derived `{ regions, picks }`;
Play/Export call the above with the current `arrangementStore.tracks`.

## 8. Remix view UI — `src/app/remix/page.tsx` (+ `src/components/remix/*`)

Route `/remix`. Reads `arrangementStore.tracks` — the remix's **track set comes from Arrange, its
timings from the pool**. (Exact route/file layout follows the project's current Next.js app-router
conventions — verify against `node_modules/next/dist/docs/` before implementing, per AGENTS.md.)
Layout **A** (validated in brainstorming):
- **Top — per-track rows, 3 columns:** `Track (category, pool size)` · `pool chips` (element·section
  labels, the drawn one lit; single-rule tracks show a forced pick; absent tracks greyed) ·
  `picked mini-lane`.
- **Bottom — "Final result" panel:** the assembled `regions` on **one continuous 0–`totalSec`
  timeline** (per-track lanes; section markers at ~10:00/20:00 shown as faint **labels**, since
  sections aren't boundaries), with **🎲 Regenerate · ▶ Play · ⬇ Export WAV · ⬆ Upload session**.
- Empty state when Arrange has no tracks: prompt to set up an Arrangement first. Upload shows parser
  warnings inline.

## 9. Upload lifecycle

⬆ Upload → pick a `.md` in the session-timeline format → `POST /api/sessions` → parse (§4) → on success
saved to `config/sessions/`, store re-fetches, pools grow, next Regenerate can draw the new rules.
Warnings (skipped rows, unknown layers) shown, non-blocking. A new session adds one rule per section
each present track appears in (beds +3, drivers +2, …).

## 10. Data audit + out of scope

**Data audit (applied to the `.md` sources on this branch):**
- **air** — S2 NOISE column-scramble fixed (mirrors ISO). Cosmetic `PLANET`→`PLANETS` optional (vocab
  map treats both as `PLANET`).
- **fire** — S2 ELEMENTS split into its two authored segments (fade-out 10:00–12:00; fade-in
  19:00–20:00) as two rows → one rule, two phrases.
- **ether** — clean, no issues.
- **earth** — its own authored session (distinct from water); S1 ISO fades slightly exceed their span,
  auto-clamped by the renderer, harmless.
- **water** — from the PDF spec.

**Out of scope (v1):** in-app rule editing; saving a generated result; per-variant track matching
(variant is label-only); a live crossfade *between separate picks* (each region has its own fades, but
we don't auto-crossfade overlapping picks); re-authoring earth with genuine earth material.

## 11. Testing

- **`parseSessionTimeline`:** all five seed files (rule/phrase counts match the analysis matrices);
  fuzzy-token resolution (`~`, `End of section`, `Continuous`, `Automation only`, `-`, empty row);
  comma-phrase expansion; **same-layer rows merged into one rule with per-phrase fades** (fire ELEMENTS);
  **absolute times preserved across section lines** (fire S3 NOISE @19:00, earth S2 SUB ELEMENTS @9:30);
  impossible row → skipped + warned (air's pre-fix NOISE fixture); unknown layer → warned.
- **Vocabulary map:** each authored name → expected `Category` (+variant); `DRONE`/`FX` never appear.
- **`generateFreeMix`:** deterministic by seed; absent track (empty pool) skipped; single-rule pool
  forced; multi-phrase rule → multiple absolute regions; Regenerate changes the draw reproducibly.
- **`/api/sessions`:** GET returns store + warnings; POST appends a session and grows pools; 422 on
  unparseable upload.
- **Render/play:** `renderModuleToWav` with `moduleSeconds = totalSec` produces a full-length WAV from a
  flat region set; the play path honors `totalSec`.

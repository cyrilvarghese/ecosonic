# Three-Pass Per-Mode Track Analysis — Design

**Status:** Approved design · **Date:** 2026-07-18 · **Branch:** `feat/three-pass-analysis`
**Related:** [PRD §4, §6.2](../../PRD.md) · [analyze route](../../../src/app/api/analyze/route.ts) ·
[match.ts](../../../src/rules/match.ts) · [inventory.ts](../../../src/rules/inventory.ts)

---

## 1. Problem

The `/rules` analyze flow runs **one blind OpenAI pass over the whole file**, then maps
observations to the three modes (Introduction / Deep Relaxation / Return) only when the *model*
happens to report **exactly three sections** ([match.ts `threeSections`](../../../src/rules/match.ts#L95)).
When it reports two or four, `modeFor` returns `null`, the per-mode grammar comparison is skipped,
and every observation silently degrades to `novel`. The core feature — confirms/contradicts against
the mode grammar — only fires when the model guesses the section count correctly.

## 2. Solution overview

Segment deterministically instead of asking the model to. Cut the upload into **three fixed
10-minute windows** in the browser, and analyze each as its **known mode**. The model still hears
audio blind (no grammar leaks into the prompt); the mode is supplied to the deterministic
classifier, not to the model.

```
File → [browser] decodeAudioData → slice 0–10 / 10–20 / 20–30 min → 3 WAV blobs
     → 3 parallel POST /api/analyze (blob + mode)   [INTRODUCTION | DEEP_RELAXATION | RETURN]
     → each: OpenAI blind pass → classifyObservations(result, mode) → {mode, description, sections, candidates}
     → UI: tab strip (one tab per mode); keep/promote per card unchanged
```

Decisions locked during brainstorming:
- **Boundaries:** fixed 10-min clock windows (`0–600 / 600–1200 / 1200–1800 s`), not equal thirds.
- **Slicing location:** client-side (Web Audio `decodeAudioData` + WAV encode); server stays thin.
- **Presentation:** tabs, one per mode; results stream into tabs as each pass resolves.
- **Short tracks:** windows starting beyond track end are **skipped**; those tabs are disabled.
  A final partial window (e.g. 20:00–24:00) is analyzed as-is. No single-pass fallback (YAGNI).

## 3. Client-side slicing — `src/rules/sliceAudio.ts` (new)

Responsibilities, split into pure helpers so the math is unit-testable without a real AudioContext:

- `sliceWindows(durationSec)` → the list of `{mode, startSec, endSec}` to analyze. Pure. Emits up
  to three windows; drops any window whose `startSec >= durationSec`; clamps the last `endSec` to
  `durationSec`.
- `encodeWav(channels, sampleRate)` → `Blob` — minimal 16-bit PCM WAV writer (no deps).
- `sliceAudio(file)` (browser-only) → `Promise<Array<{ mode: Mode; blob: Blob }>>`:
  `decodeAudioData` the file once, then for each window from `sliceWindows`, copy the sample range
  out of each channel and `encodeWav`.

Window constants derive from `config.layerTwo.moduleSeconds` (≈600) so the design tracks the grammar
rather than hard-coding 600.

## 4. API route — `src/app/api/analyze/route.ts`

One added field: `form.get('mode')`, validated against `MODES` from `analysisSchema`. Invalid/absent
→ `400`. The mode is passed to `classifyObservations`. **Unchanged:** file validation, size cap,
base64 encoding, the OpenAI call, and `buildSystemPrompt()` — the prompt stays blind; the mode never
reaches the model. Response shape gains `mode`: `{ mode, description, sections, candidates }`.

## 5. Classification — `src/rules/match.ts`

`classifyObservations(result, cfg)` → `classifyObservations(result, mode, cfg)`.

- Delete the `threeSections` / `sectionIndex → mode` derivation. `modeFor` returns the passed-in
  `mode` for every observation.
- Timings are already window-relative (each pass sees only its 10 min), so no offset math.
- `orderingCheck` (R2) runs within the single known mode.
- `compareToGrammar` is unchanged; it now always has a real mode + rule to compare against.

## 6. UI

**`AnalyzePanel`** ([src/components/rules/AnalyzePanel.tsx](../../../src/components/rules/AnalyzePanel.tsx)):
on file pick, call `sliceAudio`, then fire the N (≤3) requests in parallel. Progress reflects
per-window state ("Analyzing Deep Relaxation…"). `onResult` now yields an array of
`{ mode, description, sections, candidates }`, one per analyzed window.

**`RulesPage`** ([src/app/rules/page.tsx](../../../src/app/rules/page.tsx)): left panel gains a **tab
strip** — `Introduction · Deep Relaxation · Return`. Each tab shows its mode's description +
candidate cards. A window still analyzing shows "analyzing…" in its tab; a skipped window's tab is
disabled with a hint. Tabs may carry a candidate-count badge. Keep/promote per card is unchanged;
the kept `source` gains `mode` alongside the existing `file` + `model`.

`DiscoveredRule.source` schema in [analysisSchema.ts](../../../src/rules/analysisSchema.ts) gains an
optional `mode` field.

## 7. Error handling

- Decode failure (corrupt/unsupported audio) → surfaced in the panel; no requests fired.
- A single window's request failing does **not** fail the others — its tab shows the error; the rest
  render normally.
- Existing route errors (missing key, oversized, malformed model output) unchanged, now per-window.

## 8. Testing

- `sliceWindows` — pure unit tests: full 30-min → 3 windows; 24-min → 3 windows (last clamped to
  24:00); 12-min → 2 windows; 8-min → 1 window; boundary sample indices correct.
- `encodeWav` — header/byte-length assertions on a synthetic buffer.
- `classifyObservations` — updated to pass `mode` explicitly; **new regression case**: a result with
  `sections: null` still produces `confirms`/`contradicts` (the exact failure this change fixes).
  Deep Relaxation case: a track retaining PAD/BASS/ARP/MELODY/FX in the middle third → `contradicts`
  (I4).
- `route.test.ts` — `mode` field validation (missing/invalid → 400).
- Vitest exclude for `**/.claude/**` already in place (avoids worktree phantom failures).

## 9. Out of scope

- Model-proposed or user-marked boundaries (approaches C/D from brainstorming).
- Cross-module continuity/consistency reconciliation (R7/R8 across passes) — was option B; not this
  change.
- Single-pass fallback toggle.
- Server-side slicing / curl-the-API support (client-only decode is accepted).

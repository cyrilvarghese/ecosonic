# Three-Pass Per-Mode Track Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Slice an uploaded track into three fixed 10-minute windows in the browser, analyze each as its known mode (Introduction / Deep Relaxation / Return), and classify each against that mode's grammar — removing the fragile model-guessed section mapping.

**Architecture:** Client decodes + slices audio into 3 WAV blobs (Web Audio API), fires 3 parallel `POST /api/analyze` calls each carrying a `mode` label. The route passes `mode` to a now-mode-explicit `classifyObservations`. The `/rules` left panel shows results in a per-mode tab strip.

**Tech Stack:** Next.js (App Router, node runtime), TypeScript, React client components, Zod, Vitest. No new dependencies — WAV encoding and slicing are hand-written.

## Global Constraints

- The OpenAI system prompt MUST stay **blind**: `buildSystemPrompt()` is unchanged; `mode` never reaches the model. (Verified by the existing "prompt stayed blind" route test.)
- Wire optionality is `null`, never absent — do not change schemas that OpenAI strict mode depends on.
- Window length derives from `config.layerTwo.moduleSeconds` (600s), not a hard-coded 600.
- Slices are rendered to **16 kHz mono** WAV (~18 MB/window) so each stays under the route's 25 MB `maxUploadBytes` and OpenAI's audio-input limit. The raw upload is decoded in-browser only and guarded by a separate `MAX_DECODE_BYTES` memory limit, never the 25 MB cap.
- Mode values are exactly `'INTRODUCTION' | 'DEEP_RELAXATION' | 'RETURN'` (`Mode` in `src/arrange/types.ts`, `MODES` in `src/rules/analysisSchema.ts`), in that order.
- The kept-rule `source` schema is NOT changed: each candidate already carries `mode` from classification, so no redundant `source.mode` is added.
- Vitest excludes `**/.claude/**` (worktree phantoms) — run tests from repo root as configured.

---

### Task 1: Pure slicing + WAV-encoding helpers

**Files:**
- Create: `src/rules/sliceAudio.ts`
- Test: `src/rules/sliceAudio.test.ts`

**Interfaces:**
- Consumes: `config.layerTwo.moduleSeconds` (number); `Mode` from `@/arrange/types`.
- Produces:
  - `sliceWindows(durationSec: number, moduleSeconds?: number): Array<{ mode: Mode; startSec: number; endSec: number }>`
  - `encodeWav(channels: Float32Array[], sampleRate: number): Blob`

- [ ] **Step 1: Write the failing test**

```ts
// src/rules/sliceAudio.test.ts
import { describe, it, expect } from 'vitest';
import { sliceWindows, encodeWav } from '@/rules/sliceAudio';

describe('sliceWindows', () => {
  it('full 30-min track → 3 windows aligned to the modes', () => {
    expect(sliceWindows(1800, 600)).toEqual([
      { mode: 'INTRODUCTION', startSec: 0, endSec: 600 },
      { mode: 'DEEP_RELAXATION', startSec: 600, endSec: 1200 },
      { mode: 'RETURN', startSec: 1200, endSec: 1800 },
    ]);
  });
  it('24-min track → 3 windows, last clamped to the track end', () => {
    expect(sliceWindows(1440, 600).at(-1)).toEqual({ mode: 'RETURN', startSec: 1200, endSec: 1440 });
  });
  it('12-min track → 2 windows (RETURN never starts)', () => {
    const w = sliceWindows(720, 600);
    expect(w.map((x) => x.mode)).toEqual(['INTRODUCTION', 'DEEP_RELAXATION']);
    expect(w[1]).toEqual({ mode: 'DEEP_RELAXATION', startSec: 600, endSec: 720 });
  });
  it('8-min track → 1 window', () => {
    expect(sliceWindows(480, 600)).toEqual([{ mode: 'INTRODUCTION', startSec: 0, endSec: 480 }]);
  });
});

describe('encodeWav', () => {
  it('writes a 16-bit PCM WAV whose byte length matches the frame count', () => {
    const mono = new Float32Array([0, 0.5, -0.5, 1]);
    const blob = encodeWav([mono], 8000);
    // 44-byte header + numChannels(1) * frames(4) * 2 bytes
    expect(blob.size).toBe(44 + 1 * 4 * 2);
    expect(blob.type).toBe('audio/wav');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/rules/sliceAudio.test.ts`
Expected: FAIL — cannot find module `@/rules/sliceAudio`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/rules/sliceAudio.ts
import { config } from '@/config';
import type { Mode } from '@/arrange/types';

const MODE_ORDER: readonly Mode[] = ['INTRODUCTION', 'DEEP_RELAXATION', 'RETURN'];

/** Fixed 10-min clock windows. Drops any window that starts past the track end;
 *  clamps the final window's end to the track duration. Pure. */
export function sliceWindows(
  durationSec: number,
  moduleSeconds: number = config.layerTwo.moduleSeconds,
): Array<{ mode: Mode; startSec: number; endSec: number }> {
  const out: Array<{ mode: Mode; startSec: number; endSec: number }> = [];
  for (let i = 0; i < MODE_ORDER.length; i++) {
    const startSec = i * moduleSeconds;
    if (startSec >= durationSec) break;
    const endSec = Math.min((i + 1) * moduleSeconds, durationSec);
    out.push({ mode: MODE_ORDER[i], startSec, endSec });
  }
  return out;
}

/** Minimal 16-bit PCM WAV encoder — no deps. Interleaves channels. */
export function encodeWav(channels: Float32Array[], sampleRate: number): Blob {
  const numChannels = channels.length;
  const frames = channels[0]?.length ?? 0;
  const buffer = new ArrayBuffer(44 + frames * numChannels * 2);
  const view = new DataView(buffer);
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  const byteRate = sampleRate * numChannels * 2;
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + frames * numChannels * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);       // PCM chunk size
  view.setUint16(20, 1, true);        // audio format = PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, numChannels * 2, true); // block align
  view.setUint16(34, 16, true);       // bits per sample
  writeStr(36, 'data');
  view.setUint32(40, frames * numChannels * 2, true);
  let offset = 44;
  for (let f = 0; f < frames; f++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const s = Math.max(-1, Math.min(1, channels[ch][f]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([buffer], { type: 'audio/wav' });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/rules/sliceAudio.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/rules/sliceAudio.ts src/rules/sliceAudio.test.ts
git commit -m "feat(rules): pure sliceWindows + encodeWav helpers"
```

---

### Task 2: Browser `sliceAudio(file)` wrapper

**Files:**
- Modify: `src/rules/sliceAudio.ts` (append the browser-only function)

**Interfaces:**
- Consumes: `sliceWindows`, `encodeWav` (Task 1).
- Produces: `sliceAudio(file: File): Promise<Array<{ mode: Mode; blob: Blob }>>` — browser-only (uses `AudioContext` + `OfflineAudioContext`); no unit test (integration-exercised via the panel). Its correctness rests on the Task 1 pure helpers.

**Why the resample:** a raw 10-min WAV at the native rate is ~50 MB mono / ~100 MB stereo, over both the route's 25 MB `maxUploadBytes` and OpenAI's audio limit — every slice would be rejected. Render each window through an `OfflineAudioContext` at **16 kHz mono** (~18 MB/window; Nyquist 8 kHz covers every layer role). `OfflineAudioContext` resamples and downmixes in one pass — no deps.

- [ ] **Step 1: Append the implementation**

```ts
// src/rules/sliceAudio.ts — append

/** OpenAI audio input + our own 25 MB maxUploadBytes cap can't take a raw 44.1 kHz WAV (a 10-min
 *  mono window is ~50 MB). Render to 16 kHz mono → ~18 MB/window; Nyquist 8 kHz still resolves
 *  every layer role the model listens for. */
const TARGET_RATE = 16000;

/** Browser-only: decode once, then render each mode window to a 16 kHz mono WAV blob.
 *  decodeAudioData holds the whole file as float PCM briefly (~0.5 GB for a 30-min track) — fine
 *  for a one-off on desktop. */
export async function sliceAudio(file: File): Promise<Array<{ mode: Mode; blob: Blob }>> {
  const Ctx: typeof AudioContext =
    window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  let decoded: AudioBuffer;
  try {
    decoded = await ctx.decodeAudioData(await file.arrayBuffer());
  } finally {
    void ctx.close();
  }
  return Promise.all(sliceWindows(decoded.duration).map(async ({ mode, startSec, endSec }) => {
    const frames = Math.max(1, Math.ceil((endSec - startSec) * TARGET_RATE));
    const offline = new OfflineAudioContext(1, frames, TARGET_RATE);
    const src = offline.createBufferSource();
    src.buffer = decoded;                      // resampled to TARGET_RATE on render
    src.connect(offline.destination);          // stereo → mono (destination is 1-channel)
    src.start(0, startSec, endSec - startSec);
    const rendered = await offline.startRendering();
    return { mode, blob: encodeWav([rendered.getChannelData(0)], TARGET_RATE) };
  }));
}
```

- [ ] **Step 2: Verify it type-checks and existing tests still pass**

Run: `npx tsc --noEmit && npx vitest run src/rules/sliceAudio.test.ts`
Expected: no type errors; 5 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add src/rules/sliceAudio.ts
git commit -m "feat(rules): browser sliceAudio — decode + per-mode WAV windows"
```

---

### Task 3: Make `classifyObservations` mode-explicit

**Files:**
- Modify: `src/rules/match.ts:92-116` (function signature + `modeFor`)
- Test: `src/rules/match.test.ts` (update call sites; add regression)

**Interfaces:**
- Consumes: `Mode` from `@/arrange/types`.
- Produces: `classifyObservations(result: AnalysisResult, mode: Mode, cfg?: EcosonicConfig): CandidateRule[]` — `mode` is now the second positional arg. Every candidate's `mode` equals the passed `mode`; `orderingCheck` runs within that mode.

- [ ] **Step 1: Update the tests to the new signature (and add the regression)**

Replace the body of `src/rules/match.test.ts`'s `describe` with call sites that pass `mode`, and swap the obsolete "without exactly 3 sections" test for a "no sections still classifies" regression:

```ts
// helper `result(...)` and imports unchanged; update each classifyObservations(...) call:

  it('confirms a timing within tolerance of the grammar canon', () => {
    const [c] = classifyObservations(result([
      obs({ structured: { category: 'ISO', patch: patch({ enter: { canon: 75, half: 10 } }) } }),
    ]), 'INTRODUCTION');
    expect(c.kind).toBe('confirms');
    expect(c.relatedRule).toBe('grammar:INTRODUCTION.ISO.enter');
    expect(c.mode).toBe('INTRODUCTION');
  });
  it('contradicts a timing outside tolerance', () => {
    const [c] = classifyObservations(result([
      obs({ structured: { category: 'ISO', patch: patch({ enter: { canon: 200, half: 10 } }) } }),
    ]), 'INTRODUCTION');
    expect(c.kind).toBe('contradicts');
    expect(c.relatedRule).toBe('grammar:INTRODUCTION.ISO.enter');
  });
  it('is novel when the grammar has no entry for that layer in that mode', () => {
    const [c] = classifyObservations(result([
      obs({ structured: { category: 'BASS', patch: patch({ enter: { canon: 100, half: 5 } }) } }),
    ]), 'DEEP_RELAXATION');
    expect(c.kind).toBe('novel');
    expect(c.mode).toBe('DEEP_RELAXATION');
  });
  it('classifies against the passed mode even when the model returned no sections', () => {
    const [c] = classifyObservations(result([
      obs({ structured: { category: 'ISO', patch: patch({ enter: { canon: 60, half: 5 } }) } }),
    ], null), 'INTRODUCTION');
    expect(c.kind).toBe('confirms');
    expect(c.mode).toBe('INTRODUCTION');
  });
  it('prose stays novel but gets a topic link', () => {
    const [c] = classifyObservations(result([obs({ text: 'The noise bed never stops' })]), 'INTRODUCTION');
    expect(c.kind).toBe('novel');
    expect(c.relatedRule).toBe('R7');
  });
  it('synthesizes an R2 contradiction when a higher layer enters before a lower one', () => {
    const cands = classifyObservations(result([
      obs({ structured: { category: 'MELODY', patch: patch({ enter: { canon: 30, half: 5 } }) } }),
      obs({ structured: { category: 'ISO', patch: patch({ enter: { canon: 300, half: 5 } }) } }),
    ]), 'INTRODUCTION');
    expect(cands.find((c) => c.relatedRule === 'R2')?.kind).toBe('contradicts');
  });
  it('synthesizes an R2 confirmation for >=3 categories entering in stack order', () => {
    const cands = classifyObservations(result([
      obs({ structured: { category: 'ISO', patch: patch({ enter: { canon: 60, half: 5 } }) } }),
      obs({ structured: { category: 'PAD', patch: patch({ enter: { canon: 180, half: 5 } }) } }),
      obs({ structured: { category: 'MELODY', patch: patch({ enter: { canon: 400, half: 5 } }) } }),
    ]), 'INTRODUCTION');
    expect(cands.find((c) => c.relatedRule === 'R2' && c.kind === 'confirms')).toBeDefined();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/rules/match.test.ts`
Expected: FAIL — `classifyObservations` still takes `(result, cfg)`; passing `'INTRODUCTION'` as `cfg` breaks.

- [ ] **Step 3: Change the implementation to take `mode`**

In `src/rules/match.ts`, add the import and rewrite the signature + `modeFor`:

```ts
// add to imports at top:
import type { Mode } from '@/arrange/types';
```

```ts
/** Classify blind observations against ONE known mode's house rules — deterministic, pure. */
export function classifyObservations(
  result: AnalysisResult, mode: Mode, cfg: EcosonicConfig = defaultConfig,
): CandidateRule[] {
  const modeFor = (): Mode => mode;
  const D = cfg.layerTwo.moduleSeconds;

  const out: CandidateRule[] = result.observations.map((o) => {
    if (o.structured) {
      const rule = cfg.layerTwo.generation.modeRules[mode][o.structured.category];
      const verdict = rule
        ? compareToGrammar(o.structured.patch, rule, mode, o.structured.category, D)
        : null;
      if (verdict) return { ...o, ...verdict, mode };
      return { ...o, kind: 'novel', relatedRule: null, mode };
    }
    return { ...o, kind: 'novel', relatedRule: topicLink(o.text), mode };
  });

  out.push(...orderingCheck(result.observations, modeFor));
  return out;
}
```

Note: `orderingCheck`'s `modeFor` parameter type is `(o: Observation) => Mode | null`; passing `() => mode` (a `Mode`) is assignable. Leave `orderingCheck` as-is. Remove the now-unused `MODES` import if it is no longer referenced elsewhere in the file.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/rules/match.test.ts && npx tsc --noEmit`
Expected: all match tests PASS; no type errors (route.ts will error until Task 4 — if running `tsc` now shows only `route.ts` calling `classifyObservations` with the old arity, that is expected and fixed next).

- [ ] **Step 5: Commit**

```bash
git add src/rules/match.ts src/rules/match.test.ts
git commit -m "feat(rules): classifyObservations takes an explicit mode"
```

---

### Task 4: Route accepts and validates `mode`

**Files:**
- Modify: `src/app/api/analyze/route.ts:14-75`
- Test: `src/app/api/analyze/route.test.ts`

**Interfaces:**
- Consumes: `classifyObservations(result, mode, cfg)` (Task 3); `MODES` from `@/rules/analysisSchema`.
- Produces: `POST /api/analyze` now requires a `mode` form field ∈ `MODES`; response is `{ mode, description, sections, candidates }`.

- [ ] **Step 1: Add the failing tests**

Add to `src/app/api/analyze/route.test.ts`. First update the `upload` helper to include a mode, and add a validation test:

```ts
// replace the upload helper:
const upload = (name: string, type: string, bytes = 4, mode = 'INTRODUCTION') => {
  const form = new FormData();
  form.set('file', new File([new Uint8Array(bytes)], name, { type }));
  form.set('mode', mode);
  return new Request('http://test/api/analyze', { method: 'POST', body: form });
};

// add inside describe('/api/analyze', ...):
  it('400 when mode is missing or invalid', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'k');
    vi.stubGlobal('fetch', vi.fn(openAiOk));
    expect((await POST(upload('t.mp3', 'audio/mpeg', 4, 'NONSENSE'))).status).toBe(400);
  });
  it('echoes the analyzed mode in the response', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'k');
    vi.stubGlobal('fetch', vi.fn(openAiOk));
    const body = await (await POST(upload('t.mp3', 'audio/mpeg', 4, 'RETURN'))).json();
    expect(body.mode).toBe('RETURN');
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/app/api/analyze/route.test.ts`
Expected: FAIL — no `mode` handling; `body.mode` is undefined and invalid mode still 200/502.

- [ ] **Step 3: Implement mode handling in the route**

In `src/app/api/analyze/route.ts`: import `MODES`, validate the field after the file check, and thread it through.

```ts
import { AnalysisResultSchema, MODES, OPENAI_ANALYSIS_JSON_SCHEMA } from '@/rules/analysisSchema';
```

```ts
  // after: if (!(file instanceof File)) return ... 400
  const mode = form.get('mode');
  if (typeof mode !== 'string' || !(MODES as readonly string[]).includes(mode)) {
    return Response.json({ error: 'mode must be one of INTRODUCTION, DEEP_RELAXATION, RETURN' }, { status: 400 });
  }
```

```ts
  // final response:
  return Response.json({
    mode,
    description: result.description,
    sections: result.sections,
    candidates: classifyObservations(result, mode as (typeof MODES)[number]),
  });
```

- [ ] **Step 4: Run tests + typecheck**

Run: `npx vitest run src/app/api/analyze/route.test.ts && npx tsc --noEmit`
Expected: all route tests PASS (including the existing blind-prompt test); no type errors project-wide.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/analyze/route.ts src/app/api/analyze/route.test.ts
git commit -m "feat(analyze): require a mode field, echo it, classify per-mode"
```

---

### Task 5: `AnalyzePanel` slices then fires N parallel passes

**Files:**
- Modify: `src/components/rules/AnalyzePanel.tsx`

**Interfaces:**
- Consumes: `sliceAudio` (Task 2); `POST /api/analyze` (Task 4); `Mode` from `@/arrange/types`.
- Produces: `WindowResult` (discriminated on `ok`) — success carries `{ mode, ok: true, description, sections, candidates }`; failure carries `{ mode, ok: false, error }`. `onResult` signature becomes `(results: WindowResult[], fileName: string) => void` — one entry per analyzed window, in mode order. Each window resolves independently (never throws), so one failure never aborts the others.

**Cap change:** the raw upload is decoded locally and never sent to the server, so the panel guards it only against browser-decode memory with a generous `MAX_DECODE_BYTES` (~150 MB). The 25 MB route cap still guards each ~18 MB slice.

- [ ] **Step 1: Update `AnalyzePanel.tsx`**

```tsx
'use client';
import { useRef, useState } from 'react';
import { config } from '@/config';
import type { Mode } from '@/arrange/types';
import { sliceAudio } from '@/rules/sliceAudio';

export type WindowResult =
  | { mode: Mode; ok: true; description: string; sections: Array<{ startSec: number; label: string }> | null; candidates: unknown[] }
  | { mode: Mode; ok: false; error: string };

// The original file is decoded in-browser and never uploaded (only ~18 MB slices are), so this is a
// memory guard on decodeAudioData, not the OpenAI/route upload cap.
const MAX_DECODE_BYTES = 150 * 1048576;

export function AnalyzePanel({
  ready, onResult,
}: {
  ready: boolean | null; // null = probing
  onResult: (results: WindowResult[], fileName: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);

  const analyze = async (file: File) => {
    setError(null);
    if (!/\.(mp3|mpeg|wav)$/i.test(file.name)) { setError('MP3, MPEG, or WAV only.'); return; }
    if (file.size > MAX_DECODE_BYTES) {
      setError(`File is ${(file.size / 1048576).toFixed(1)} MB — too large to decode in the browser ` +
        `(limit ${Math.round(MAX_DECODE_BYTES / 1048576)} MB).`);
      return;
    }
    setBusy(true);
    try {
      let windows: Array<{ mode: Mode; blob: Blob }>;
      try {
        setProgress('Decoding audio…');
        windows = await sliceAudio(file);
      } catch {
        setError('Could not decode this audio file.'); return;
      }
      if (windows.length === 0) { setError('Track is too short to analyze.'); return; }

      let done = 0;
      // Each window resolves to a WindowResult and never throws → true per-tab isolation.
      const results = await Promise.all(windows.map(async ({ mode, blob }): Promise<WindowResult> => {
        try {
          const form = new FormData();
          form.set('file', new File([blob], `${file.name}.${mode}.wav`, { type: 'audio/wav' }));
          form.set('mode', mode);
          const res = await fetch('/api/analyze', { method: 'POST', body: form });
          const body = await res.json();
          setProgress(`Analyzed ${++done} of ${windows.length}…`);
          if (!res.ok) return { mode, ok: false, error: body.error ?? `Analysis failed (${res.status})` };
          return { mode, ok: true, description: body.description, sections: body.sections, candidates: body.candidates };
        } catch (e) {
          setProgress(`Analyzed ${++done} of ${windows.length}…`);
          return { mode, ok: false, error: (e as Error).message };
        }
      }));
      onResult(results, file.name);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  return (
    <section className="rounded-[var(--radius-md)] border border-border bg-card p-4">
      <h2 className="mb-1 text-sm font-medium">Analyze a reference track</h2>
      <p className="mb-3 text-xs text-muted-foreground">
        MP3/WAV up to {Math.round(MAX_DECODE_BYTES / 1048576)} MB. The track is split into three
        10-minute passes — Introduction, Deep Relaxation, Return — each heard blind and checked
        against that section&apos;s grammar.
      </p>
      {ready === false && (
        <p className="mb-3 rounded bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          OPENAI_API_KEY is not configured. Add it to <code>.env.local</code> and restart the dev server.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <input ref={inputRef} type="file" accept=".mp3,.mpeg,.wav,audio/mpeg,audio/wav" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) { setPicked(f.name); void analyze(f); } }}
          disabled={busy || ready !== true} />
        <button type="button" onClick={() => inputRef.current?.click()}
          disabled={busy || ready !== true}
          className="rounded-full px-4 py-1.5 text-xs text-white transition-calm hover:scale-105 disabled:opacity-50 disabled:hover:scale-100"
          style={{ background: 'var(--accent-ink)' }}>
          {busy ? 'Analyzing…' : picked ? 'Analyze another track' : 'Choose a track'}
        </button>
        {busy
          ? <span className="text-xs text-muted-foreground">{progress ?? 'working…'}</span>
          : picked && <span className="text-xs text-muted-foreground">{picked}</span>}
      </div>
      {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </section>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: errors ONLY in `src/app/rules/page.tsx` (its `onResult` still expects the old single-result shape) — fixed in Task 6.

- [ ] **Step 3: Commit**

```bash
git add src/components/rules/AnalyzePanel.tsx
git commit -m "feat(rules): AnalyzePanel slices + fires 3 parallel per-mode passes"
```

---

### Task 6: `/rules` page renders per-mode tabs

**Files:**
- Modify: `src/app/rules/page.tsx`

**Interfaces:**
- Consumes: `WindowResult[]` from `onResult` (Task 5); `Mode` from `@/arrange/types`; existing `keep`/`patch` handlers.
- Produces: tabbed left panel with per-tab error display; keep/promote per card unchanged.

- [ ] **Step 1: Rework state + render in `page.tsx`**

Replace the result state and the Discover render block. Key changes: hold one error-aware `Group` per mode, track an active tab, and derive cards per mode. `keep` needs the file name (kept from `fileName` state) and now also which mode-group the card belongs to so its `keptId` maps back.

```tsx
'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { config } from '@/config';
import type { Mode } from '@/arrange/types';
import type { CandidateRule, DiscoveredRule } from '@/rules/analysisSchema';
import { AnalyzePanel, type WindowResult } from '@/components/rules/AnalyzePanel';
import { CandidateCard } from '@/components/rules/CandidateCard';
import { RuleLibrary } from '@/components/rules/RuleLibrary';

const MODE_LABEL: Record<Mode, string> = {
  INTRODUCTION: 'Introduction', DEEP_RELAXATION: 'Deep Relaxation', RETURN: 'Return',
};

type Group = {
  mode: Mode;
  error: string | null;
  description: string;
  cards: Array<{ candidate: CandidateRule; keptId: string | null }>;
};

export default function RulesPage() {
  const [ready, setReady] = useState<boolean | null>(null);
  const [discovered, setDiscovered] = useState<DiscoveredRule[]>([]);
  const [fileName, setFileName] = useState<string>('');
  const [groups, setGroups] = useState<Group[]>([]);
  const [activeTab, setActiveTab] = useState<Mode | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setDiscovered(await (await fetch('/api/rules')).json());
  }, []);
  useEffect(() => {
    void fetch('/api/analyze').then(async (r) => setReady((await r.json()).ready));
    void refresh();
  }, [refresh]);

  const onResult = (results: WindowResult[], name: string) => {
    setFileName(name);
    setGroups(results.map((r) => r.ok
      ? {
          mode: r.mode, error: null, description: r.description,
          cards: (r.candidates as CandidateRule[]).map((candidate) => ({ candidate, keptId: null })),
        }
      : { mode: r.mode, error: r.error, description: '', cards: [] }));
    setActiveTab(results[0]?.mode ?? null);
  };

  const keep = async (mode: Mode, i: number) => {
    setActionError(null);
    const group = groups.find((g) => g.mode === mode);
    if (!group) return;
    const res = await fetch('/api/rules', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        candidate: group.cards[i].candidate,
        source: { file: fileName, model: config.analysis.model },
      }),
    });
    if (!res.ok) { setActionError('Keep failed'); return; }
    const kept: DiscoveredRule = await res.json();
    setGroups((gs) => gs.map((g) => g.mode !== mode ? g : {
      ...g, cards: g.cards.map((x, j) => (j === i ? { ...x, keptId: kept.id } : x)),
    }));
    void refresh();
  };
  const discard = (mode: Mode, i: number) =>
    setGroups((gs) => gs.map((g) => g.mode !== mode ? g : { ...g, cards: g.cards.filter((_, j) => j !== i) }));
  const patch = async (id: string, action: 'promote' | 'discard') => {
    setActionError(null);
    const res = await fetch('/api/rules', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action }),
    });
    if (!res.ok) setActionError((await res.json()).error ?? `${action} failed`);
    void refresh();
  };

  const active = groups.find((g) => g.mode === activeTab) ?? null;

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <div>
          <p className="label">Rule Discovery</p>
          <h1 className="text-lg font-medium">Composition rules — existing, and discovered from tracks</h1>
        </div>
        <Link href="/layer2" className="text-sm text-muted-foreground hover:text-foreground">
          ← Module Designer
        </Link>
      </header>
      <main className="mx-auto w-full max-w-[1680px] p-6">
        <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-2">
          <div className="flex flex-col gap-4">
            <div>
              <h2 className="text-base font-medium">Discover</h2>
              <p className="text-sm text-muted-foreground">
                Analyze a track to surface candidate rules per section. Keep the good ones — promote
                structured ones into the grammar on the right.
              </p>
            </div>
            <AnalyzePanel ready={ready} onResult={onResult} />
            {actionError && <p className="text-sm text-red-600 dark:text-red-400">{actionError}</p>}
            {groups.length > 0 && (
              <section className="flex flex-col gap-3">
                <h3 className="text-sm font-medium">Candidate rules — {fileName}</h3>
                <div className="flex gap-1 border-b border-border" role="tablist">
                  {groups.map((g) => (
                    <button key={g.mode} type="button" role="tab" aria-selected={g.mode === activeTab}
                      onClick={() => setActiveTab(g.mode)}
                      className={`-mb-px border-b-2 px-3 py-1.5 text-sm transition-calm ${
                        g.mode === activeTab
                          ? 'border-[var(--accent-ink)] text-foreground'
                          : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
                      {MODE_LABEL[g.mode]} {g.error ? '⚠' : `(${g.cards.length})`}
                    </button>
                  ))}
                </div>
                {active && (active.error ? (
                  <p className="rounded-[var(--radius-md)] border border-border bg-card p-4 text-sm text-red-600 dark:text-red-400">
                    {MODE_LABEL[active.mode]} pass failed: {active.error}
                  </p>
                ) : (
                  <>
                    <p className="whitespace-pre-wrap rounded-[var(--radius-md)] border border-border bg-card p-4 text-sm leading-relaxed">
                      {active.description}
                    </p>
                    {active.cards.map((c, i) => (
                      <CandidateCard key={`${active.mode}-${i}`} candidate={c.candidate} keptId={c.keptId}
                        onKeep={() => void keep(active.mode, i)}
                        onDiscard={() => discard(active.mode, i)}
                        onPromote={() => { if (c.keptId) void patch(c.keptId, 'promote'); }} />
                    ))}
                  </>
                ))}
              </section>
            )}
          </div>

          <div className="flex flex-col gap-4">
            <div>
              <h2 className="text-base font-medium">Exists</h2>
              <p className="text-sm text-muted-foreground">
                What the generator already knows — principles, invariants, the live grammar, and
                rules you&apos;ve kept.
              </p>
            </div>
            <RuleLibrary discovered={discovered}
              onPromote={(id) => void patch(id, 'promote')}
              onDiscard={(id) => void patch(id, 'discard')} />
          </div>
        </div>
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + full test run**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no type errors; all tests PASS (no `.claude` phantoms).

- [ ] **Step 3: Manual verification (dev server)**

Run: `npm run dev`, open `http://localhost:3000/rules`, upload a track. Expected: a decode step, then 1–3 tabs (Introduction / Deep Relaxation / Return depending on length), each with its own description + candidate cards; Keep/Promote still work.

- [ ] **Step 4: Commit**

```bash
git add src/app/rules/page.tsx
git commit -m "feat(rules): per-mode tabs for three-pass analysis results"
```

---

## Self-Review

**Spec coverage:**
- §2 three fixed 10-min windows → Task 1 (`sliceWindows`) + Task 2 (`sliceAudio`). ✓
- §3 client slicing module → Tasks 1–2. ✓
- §4 route `mode` field, prompt stays blind → Task 4 (blind verified by existing test). ✓
- §5 classify mode-explicit, delete `threeSections` → Task 3 (+ regression: no-sections still classifies). ✓
- §6 tabs UI, keep/promote unchanged, source unchanged → Tasks 5–6. ✓
- §7 error handling (decode fail; per-window isolation) → Task 5: decode try/catch; each window resolves to a `WindowResult` that never throws, so one failed pass shows in its tab while the others render. ✓
- §8 tests (sliceWindows, encodeWav, classify regression + Deep-Relaxation intent, route validation) → Tasks 1, 3, 4. ✓
- §9 out of scope → nothing implemented from it. ✓
- Slice size / caps: raw 44.1 kHz WAV exceeds the 25 MB route cap and OpenAI's limit → Task 2 renders 16 kHz mono (~18 MB); Task 5 guards the raw upload with a separate `MAX_DECODE_BYTES` memory limit. ✓

**Placeholder scan:** none — every code step shows full content.

**Type consistency:** `classifyObservations(result, mode, cfg)` defined in Task 3, called with that arity in Task 4. `AnalyzeResponse` gains `mode: Mode` in Task 5, consumed in Task 6. `onResult(results: AnalyzeResponse[], fileName)` matches between Tasks 5 and 6. `Mode` order matches `MODES`.

**Placeholder scan (2nd pass, post-revision):** none. **Type consistency:** `WindowResult` defined in Task 5, consumed in Task 6; `onResult(results: WindowResult[], fileName)` matches between them; `sliceAudio` return type unchanged by the resample rewrite. `MAX_DECODE_BYTES` is local to Task 5's file. ✓

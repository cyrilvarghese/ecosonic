# Text Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Analyze a written per-section track description (paste or `.txt`/`.md`) into the same per-mode candidates the audio path produces, via one structured-output call to a text model — reusing classification, tabs, timeline, and save/reload unchanged.

**Architecture:** A new `/api/analyze-text` route makes one OpenAI call to `config.analysis.textModel` with strict `json_schema`, returning `{ windows: [{mode, description, sections, observations}] }`; the route classifies each window and returns a `WindowResult[]`-shaped array. A new `AnalyzeTextPanel` feeds the page's existing `onResult` (which already shows results and auto-saves).

**Tech Stack:** Next.js (App Router, node runtime), TypeScript, Zod, OpenAI Chat Completions structured outputs, Vitest + @testing-library/react.

## Global Constraints

- **Blind:** `buildTextPrompt()` reveals no house grammar — no `canon±half` numbers, no rule texts. Zero-arg like `buildSystemPrompt`.
- **Reuse the same `WindowResult` shape** so downstream (tabs/timeline/cards/save) is untouched. `WindowResult` (from `@/components/rules/AnalyzePanel`): success = `{ mode: Mode; ok: true; description: string; sections: Array<{startSec:number;label:string}> | null; candidates: unknown[] }`.
- **Model** is read from `config.analysis.textModel` (`"gpt-5.6-luna"`), never hard-coded.
- Timings inside `structured` are absolute seconds from each section's start; `sections: null` (no sub-sectioning).
- Strict OpenAI schema needs `additionalProperties:false` and every property required (reuse the audio observation sub-schemas).
- Types: `Mode` (`@/arrange/types`); `MODES`, `AnalysisResultSchema`, `ObservationSchema`, `OPENAI_ANALYSIS_JSON_SCHEMA` (`@/rules/analysisSchema`); `classifyObservations` (`@/rules/match`); `config` (`@/config`).
- Vitest excludes `**/.claude/**`; run from repo root.

---

### Task 1: Config field `analysis.textModel`

**Files:**
- Modify: `src/config.ts` (analysis object)
- Modify: `config/ecosonic.config.json` (analysis block)
- Modify: `src/config.test.ts` (valid fixture + assertion)

**Interfaces:**
- Produces: `config.analysis.textModel: string`.

- [ ] **Step 1: Add the failing assertion to `src/config.test.ts`**

In the existing `'parses the analysis block'` test, add:
```ts
    expect(config.analysis.textModel).toBe('gpt-5.6-luna');
```
And in the `valid` fixture object (near the top, the `analysis:` line), change it to include the field:
```ts
  analysis: { model: 'gpt-audio-1.5', textModel: 'gpt-5.6-luna', maxUploadBytes: 26214400 },
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/config.test.ts`
Expected: FAIL — `config.analysis.textModel` is undefined / schema rejects the fixture.

- [ ] **Step 3: Add the schema field and config value**

In `src/config.ts`, the analysis object becomes:
```ts
  analysis: z.object({
    model: z.string().min(1),
    textModel: z.string().min(1),
    maxUploadBytes: z.number().int().positive(),
  }),
```
In `config/ecosonic.config.json`, change the analysis line to:
```json
  "analysis": { "model": "gpt-audio-1.5", "textModel": "gpt-5.6-luna", "maxUploadBytes": 26214400 },
```

- [ ] **Step 4: Run tests + typecheck**

Run: `npx vitest run src/config.test.ts && npx tsc --noEmit`
Expected: PASS; no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/config.ts config/ecosonic.config.json src/config.test.ts
git commit -m "feat(config): add analysis.textModel for the text-analysis path"
```

---

### Task 2: Text-analysis schemas — `analysisSchema.ts`

**Files:**
- Modify: `src/rules/analysisSchema.ts`
- Test: `src/rules/analysisSchema.test.ts`

**Interfaces:**
- Consumes: `AnalysisResultSchema`, `MODES`, `OPENAI_ANALYSIS_JSON_SCHEMA` (same file).
- Produces:
  - `TextWindowSchema = AnalysisResultSchema.extend({ mode })`; `TextAnalysisSchema = z.object({ windows: TextWindowSchema[] })`.
  - `OPENAI_TEXT_ANALYSIS_JSON_SCHEMA` (strict).
  - types `TextWindow`, `TextAnalysis`.

- [ ] **Step 1: Write the failing test**

Append to `src/rules/analysisSchema.test.ts`:
```ts
import { TextAnalysisSchema, OPENAI_TEXT_ANALYSIS_JSON_SCHEMA } from '@/rules/analysisSchema';

describe('text analysis schema', () => {
  const window_ = { mode: 'INTRODUCTION' as const, ...resultFixture };
  it('accepts a windows[] payload of per-mode results', () => {
    const parsed = TextAnalysisSchema.parse({ windows: [window_] });
    expect(parsed.windows[0].mode).toBe('INTRODUCTION');
    expect(parsed.windows[0].observations).toHaveLength(1);
  });
  it('rejects an unknown mode', () => {
    expect(TextAnalysisSchema.safeParse({ windows: [{ ...window_, mode: 'CODA' }] }).success).toBe(false);
  });
  it('OpenAI text schema is strict-compatible (all objects require every property)', () => {
    const check = (node: unknown): void => {
      if (typeof node !== 'object' || node === null) return;
      const o = node as Record<string, unknown>;
      if (o.type === 'object') {
        expect(o.additionalProperties).toBe(false);
        expect((o.required as string[]).slice().sort()).toEqual(Object.keys(o.properties as object).sort());
      }
      for (const v of Object.values(o)) { if (Array.isArray(v)) v.forEach(check); else check(v); }
    };
    check(OPENAI_TEXT_ANALYSIS_JSON_SCHEMA);
  });
});
```
(`resultFixture` is already exported from this test file.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/rules/analysisSchema.test.ts`
Expected: FAIL — `TextAnalysisSchema` / `OPENAI_TEXT_ANALYSIS_JSON_SCHEMA` not exported.

- [ ] **Step 3: Add the schemas**

Append to `src/rules/analysisSchema.ts` (after `OPENAI_ANALYSIS_JSON_SCHEMA`):
```ts
/** One per-mode result inside a text analysis (audio's AnalysisResult + which mode it is). */
export const TextWindowSchema = AnalysisResultSchema.extend({ mode: z.enum(MODES) });
export const TextAnalysisSchema = z.object({ windows: z.array(TextWindowSchema) });
export type TextWindow = z.infer<typeof TextWindowSchema>;
export type TextAnalysis = z.infer<typeof TextAnalysisSchema>;

// Strict OpenAI schema for the text path: reuse the audio observation/sections/description
// sub-schemas verbatim, wrapped in { windows: [ { mode, description, sections, observations } ] }.
const { description: jDescription, sections: jSections, observations: jObservations } =
  OPENAI_ANALYSIS_JSON_SCHEMA.properties;
export const OPENAI_TEXT_ANALYSIS_JSON_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['windows'],
  properties: {
    windows: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['mode', 'description', 'sections', 'observations'],
        properties: {
          mode: { type: 'string', enum: [...MODES] },
          description: jDescription,
          sections: jSections,
          observations: jObservations,
        },
      },
    },
  },
} as const;
```

- [ ] **Step 4: Run tests + typecheck**

Run: `npx vitest run src/rules/analysisSchema.test.ts && npx tsc --noEmit`
Expected: PASS; no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/rules/analysisSchema.ts src/rules/analysisSchema.test.ts
git commit -m "feat(rules): TextAnalysis schemas (zod + strict OpenAI) reusing the observation sub-schemas"
```

---

### Task 3: Blind text prompt — `buildTextPrompt()`

**Files:**
- Modify: `src/rules/inventory.ts`
- Test: `src/rules/inventory.test.ts`

**Interfaces:**
- Consumes: `CATEGORIES`, `LAYER_VOCABULARY` (same file).
- Produces: `buildTextPrompt(): string` (zero-arg).

- [ ] **Step 1: Write the failing test**

Append to `src/rules/inventory.test.ts` (add `buildTextPrompt` to the existing import from `@/rules/inventory`):
```ts
  it('buildTextPrompt is blind, zero-arg, and names the three modes + every layer', () => {
    expect(buildTextPrompt.length).toBe(0); // zero-arg — cannot receive config
    const p = buildTextPrompt();
    for (const m of ['INTRODUCTION', 'DEEP_RELAXATION', 'RETURN']) expect(p).toContain(m);
    for (const c of CATEGORIES) expect(p).toContain(c);
    for (const n of ['540', '270', '390', '480', '570']) expect(p).not.toContain(n);
    expect(p).toContain('Never claim psychological, therapeutic, or neurological effects');
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/rules/inventory.test.ts`
Expected: FAIL — `buildTextPrompt` is not exported.

- [ ] **Step 3: Add `buildTextPrompt` to `src/rules/inventory.ts`**

Add after `buildSystemPrompt`:
```ts
/** Blind text-analysis prompt: convert a WRITTEN description into per-mode structured observations.
 *  Zero-arg — grammar numbers cannot reach the model. */
export function buildTextPrompt(): string {
  const vocab = CATEGORIES.map((c) => `- ${c}: ${LAYER_VOCABULARY[c]}`).join('\n');
  return [
    'You convert a WRITTEN description of a long-form ambient / meditation production into structured',
    'observations. You are given text only — there is no audio.',
    '',
    'These productions have three ~10-minute sections, in order:',
    '- INTRODUCTION — layers enter staggered and build.',
    '- DEEP_RELAXATION — stripped back to the environmental bed.',
    '- RETURN — mirrors the Introduction, then fades out.',
    '',
    'Layer roles:',
    vocab,
    '',
    'Read the description and produce one `windows` entry for EACH section the text describes. Set its',
    '`mode` to INTRODUCTION, DEEP_RELAXATION, or RETURN; give a short `description`; set `sections` to',
    'null; and fill `observations` — testable statements about layer entrances, exits, and fades.',
    '',
    'All timing values inside `structured` are seconds measured from the START of that section (0:00):',
    'enter/exit are positions within the section; fadeIn/fadeOut are durations; `present` is the',
    'fraction (0 to 1) of the section the layer is audible. Use null for any value the text does not',
    'state. Attach `structured` only when the text gives you something concrete; otherwise use null.',
    '',
    'Report only what the text says — never invent layers or timings.',
    'Never claim psychological, therapeutic, or neurological effects.',
  ].join('\n');
}
```

- [ ] **Step 4: Run tests + typecheck**

Run: `npx vitest run src/rules/inventory.test.ts && npx tsc --noEmit`
Expected: PASS; no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/rules/inventory.ts src/rules/inventory.test.ts
git commit -m "feat(rules): buildTextPrompt — blind text-analysis prompt"
```

---

### Task 4: API route — `src/app/api/analyze-text/route.ts`

**Files:**
- Create: `src/app/api/analyze-text/route.ts`
- Test: `src/app/api/analyze-text/route.test.ts`

**Interfaces:**
- Consumes: `config` (`@/config`); `TextAnalysisSchema`, `OPENAI_TEXT_ANALYSIS_JSON_SCHEMA` (`@/rules/analysisSchema`); `buildTextPrompt` (`@/rules/inventory`); `classifyObservations` (`@/rules/match`).
- Produces: `POST` returning `Array<{ mode, description, sections, candidates }>` (a `WindowResult[]` without the `ok` flag — the client adds it).

- [ ] **Step 1: Write the failing test**

```ts
// src/app/api/analyze-text/route.test.ts
// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { POST } from '@/app/api/analyze-text/route';

const analysis = {
  windows: [
    {
      mode: 'INTRODUCTION',
      description: 'Opens on a noise bed; ISO enters ~1:15.',
      sections: null,
      observations: [{
        text: 'ISO fades in around 1:15', layer: 'ISO', sectionIndex: null,
        structured: { category: 'ISO', patch: { present: null, enter: { canon: 75, half: 10 }, exit: null, fadeIn: null, fadeOut: null, after: null } },
        evidence: [{ atSec: 75, note: 'ISO begins' }], confidence: 0.9,
      }],
    },
    { mode: 'DEEP_RELAXATION', description: 'Bed only.', sections: null, observations: [] },
    { mode: 'RETURN', description: 'Rebuilds then fades.', sections: null, observations: [] },
  ],
};
const openAiOk = () => Promise.resolve(new Response(JSON.stringify({
  choices: [{ message: { content: JSON.stringify(analysis) } }],
}), { status: 200 }));
const req = (body: unknown) => new Request('http://test/api/analyze-text', {
  method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' },
});

beforeEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('/api/analyze-text', () => {
  it('returns one classified window per mode', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'k');
    vi.stubGlobal('fetch', vi.fn(openAiOk));
    const out = await (await POST(req({ text: 'A written description…', name: 't.txt' }))).json();
    expect(out.map((w: { mode: string }) => w.mode)).toEqual(['INTRODUCTION', 'DEEP_RELAXATION', 'RETURN']);
    const iso = out[0].candidates.find((c: { structured?: { category: string } }) => c.structured?.category === 'ISO');
    expect(iso.kind).toBe('confirms');
    expect(iso.relatedRule).toBe('grammar:INTRODUCTION.ISO.enter');
  });
  it('sends the configured text model and strict json_schema', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'k');
    vi.stubGlobal('fetch', vi.fn(openAiOk));
    await POST(req({ text: 'x', name: 'n' }));
    const sent = JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string);
    expect(sent.model).toBe('gpt-5.6-luna');
    expect(sent.response_format.json_schema.strict).toBe(true);
  });
  it('503 without a key, 400 on empty text, 400 on empty name', async () => {
    expect((await POST(req({ text: 'x', name: 'n' }))).status).toBe(503);
    vi.stubEnv('OPENAI_API_KEY', 'k');
    expect((await POST(req({ text: '   ', name: 'n' }))).status).toBe(400);
    expect((await POST(req({ text: 'x', name: '' }))).status).toBe(400);
  });
  it('502 on a malformed model reply', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'k');
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify({
      choices: [{ message: { content: '{"nope":true}' } }],
    }), { status: 200 }))));
    expect((await POST(req({ text: 'x', name: 'n' }))).status).toBe(502);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/app/api/analyze-text/route.test.ts`
Expected: FAIL — cannot find module `@/app/api/analyze-text/route`.

- [ ] **Step 3: Write the route**

```ts
// src/app/api/analyze-text/route.ts
import { config } from '@/config';
import { TextAnalysisSchema, OPENAI_TEXT_ANALYSIS_JSON_SCHEMA } from '@/rules/analysisSchema';
import { buildTextPrompt } from '@/rules/inventory';
import { classifyObservations } from '@/rules/match';

export const runtime = 'nodejs';

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const MAX_TEXT = 20000;

export async function POST(req: Request) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return Response.json({ error: 'OPENAI_API_KEY is not set — add it to .env.local' }, { status: 503 });
  }
  const body = (await req.json().catch(() => null)) as { text?: unknown; name?: unknown } | null;
  const text = typeof body?.text === 'string' ? body.text.trim() : '';
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!text) return Response.json({ error: 'text field required' }, { status: 400 });
  if (text.length > MAX_TEXT) return Response.json({ error: `text exceeds ${MAX_TEXT} characters` }, { status: 400 });
  if (!name) return Response.json({ error: 'name field required' }, { status: 400 });

  const res = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.analysis.textModel,
      messages: [
        { role: 'system', content: buildTextPrompt() }, // blind
        { role: 'user', content: text },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'text_analysis', strict: true, schema: OPENAI_TEXT_ANALYSIS_JSON_SCHEMA },
      },
    }),
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 300);
    return Response.json({ error: `OpenAI ${res.status}: ${detail}` }, { status: 502 });
  }

  const payload = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = payload.choices?.[0]?.message?.content ?? '';
  let parsed;
  try {
    parsed = TextAnalysisSchema.parse(JSON.parse(content));
  } catch (err) {
    console.error('[analyze-text] malformed analysis — raw reply:\n', content);
    console.error('[analyze-text] parse/validation error:\n', err);
    return Response.json({ error: 'model returned a malformed analysis' }, { status: 502 });
  }
  return Response.json(parsed.windows.map((w) => ({
    mode: w.mode,
    description: w.description,
    sections: w.sections,
    candidates: classifyObservations(w, w.mode),
  })));
}
```

- [ ] **Step 4: Run tests + typecheck**

Run: `npx vitest run src/app/api/analyze-text/route.test.ts && npx tsc --noEmit`
Expected: 4 tests PASS; no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/analyze-text/route.ts src/app/api/analyze-text/route.test.ts
git commit -m "feat(analyze-text): route — one structured-output call, classify per mode"
```

---

### Task 5: `AnalyzeTextPanel` + page wiring

**Files:**
- Create: `src/components/rules/AnalyzeTextPanel.tsx`
- Test: `src/components/rules/AnalyzeTextPanel.test.tsx`
- Modify: `src/app/rules/page.tsx`

**Interfaces:**
- Consumes: `WindowResult` (`@/components/rules/AnalyzePanel`); `Mode` (`@/arrange/types`); `POST /api/analyze-text` (Task 4).
- Produces: `AnalyzeTextPanel({ ready: boolean | null; onResult: (results: WindowResult[], fileName: string) => void })`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/rules/AnalyzeTextPanel.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AnalyzeTextPanel } from '@/components/rules/AnalyzeTextPanel';

beforeEach(() => { vi.unstubAllGlobals(); });

describe('AnalyzeTextPanel', () => {
  it('posts pasted text and calls onResult with ok windows', async () => {
    const onResult = vi.fn();
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify([
      { mode: 'INTRODUCTION', description: 'd', sections: null, candidates: [] },
    ]), { status: 200 }))));
    render(<AnalyzeTextPanel ready={true} onResult={onResult} />);
    await userEvent.type(screen.getByPlaceholderText(/paste/i), 'A noise bed plays throughout.');
    await userEvent.click(screen.getByRole('button', { name: /analyze description/i }));
    expect(onResult).toHaveBeenCalledTimes(1);
    const [results] = onResult.mock.calls[0];
    expect(results[0]).toMatchObject({ mode: 'INTRODUCTION', ok: true });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/rules/AnalyzeTextPanel.test.tsx`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write the component**

```tsx
// src/components/rules/AnalyzeTextPanel.tsx
'use client';
import { useRef, useState } from 'react';
import type { Mode } from '@/arrange/types';
import type { WindowResult } from '@/components/rules/AnalyzePanel';

type TextWindow = { mode: Mode; description: string; sections: Array<{ startSec: number; label: string }> | null; candidates: unknown[] };

export function AnalyzeTextPanel({
  ready, onResult,
}: {
  ready: boolean | null;
  onResult: (results: WindowResult[], fileName: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFile = async (file: File) => {
    setName((n) => n || file.name);
    setText(await file.text());
  };

  const analyze = async () => {
    setError(null);
    if (!text.trim()) { setError('Paste or upload a description first.'); return; }
    const finalName = name.trim() || 'Pasted description';
    setBusy(true);
    try {
      const res = await fetch('/api/analyze-text', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, name: finalName }),
      });
      const body = await res.json();
      if (!res.ok) { setError(body.error ?? `Analysis failed (${res.status})`); return; }
      const results: WindowResult[] = (body as TextWindow[]).map((w) => ({
        mode: w.mode, ok: true, description: w.description, sections: w.sections, candidates: w.candidates,
      }));
      onResult(results, finalName);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-[var(--radius-md)] border border-border bg-card p-4">
      <h2 className="mb-1 text-sm font-medium">Analyze a written description</h2>
      <p className="mb-3 text-xs text-muted-foreground">
        Paste a per-section production description (or upload a .txt/.md). No audio — the model reads
        the text and extracts the same candidate rules, per section.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Paste the track description here…"
        disabled={busy || ready !== true}
        className="mb-2 h-32 w-full resize-y rounded-[var(--radius-md)] border border-border bg-background p-2 text-xs"
      />
      <div className="flex flex-wrap items-center gap-3">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (for save/reload)"
          disabled={busy || ready !== true}
          className="rounded-[var(--radius-md)] border border-border bg-background px-2 py-1 text-xs" />
        <input ref={fileRef} type="file" accept=".txt,.md,text/plain,text/markdown" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void loadFile(f); }} disabled={busy || ready !== true} />
        <button type="button" onClick={() => fileRef.current?.click()} disabled={busy || ready !== true}
          className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition-calm hover:text-foreground disabled:opacity-50">
          Upload .txt
        </button>
        <button type="button" onClick={() => void analyze()} disabled={busy || ready !== true}
          className="rounded-full px-4 py-1.5 text-xs text-white transition-calm hover:scale-105 disabled:opacity-50 disabled:hover:scale-100"
          style={{ background: 'var(--accent-ink)' }}>
          {busy ? 'Analyzing…' : 'Analyze description'}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </section>
  );
}
```

- [ ] **Step 4: Wire it into `src/app/rules/page.tsx`**

Add the import beside the other rules-component imports:
```tsx
import { AnalyzeTextPanel } from '@/components/rules/AnalyzeTextPanel';
```
Render it directly after the audio `<AnalyzePanel …/>` line:
```tsx
            <AnalyzePanel ready={ready} onResult={onResult} />
            <AnalyzeTextPanel ready={ready} onResult={onResult} />
```

- [ ] **Step 5: Run tests + typecheck**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no type errors; all tests pass (prior + Tasks 1-4 + this one).

- [ ] **Step 6: Manual verification (dev server)**

Run: `npm run dev`, open `/rules`, paste the TRACK INFO text into "Analyze a written description", click Analyze. Expected: the three mode tabs populate (Timeline default) with candidates + verdicts from the text, and the analysis appears under "Saved analyses" (auto-saved by the shared `onResult`); Load re-shows it.

- [ ] **Step 7: Commit**

```bash
git add src/components/rules/AnalyzeTextPanel.tsx src/components/rules/AnalyzeTextPanel.test.tsx src/app/rules/page.tsx
git commit -m "feat(rules): AnalyzeTextPanel — analyze a written description, reuse the workflow"
```

---

## Self-Review

**Spec coverage:**
- §3 config.textModel → Task 1. ✓
- §4 buildTextPrompt (blind, three modes, absolute-from-section-start, sections null) → Task 3. ✓
- §5 schemas (TextWindow/TextAnalysis + strict OpenAI schema reusing observation sub-schemas) → Task 2. ✓
- §6 route (validation 503/400, one structured call with config model, classify per window, 502 malformed) → Task 4. ✓
- §7 AnalyzeTextPanel (paste + file + name, maps to WindowResult[], shared onResult) + page wiring → Task 5. ✓
- §8 tests (prompt blind, schema, route, panel) → Tasks 2,3,4,5. ✓
- §9 out of scope → nothing implemented from it. ✓

**Placeholder scan:** none — every code step is complete.

**Type consistency:** `TextWindowSchema = AnalysisResultSchema.extend({mode})` (Task 2) parsed by the route (Task 4) which returns `{mode, description, sections, candidates}`; the panel (Task 5) maps that to `WindowResult` by adding `ok: true`. `classifyObservations(w, w.mode)` — `w` is a `TextWindow` (AnalysisResult + mode), matching `classifyObservations(result: AnalysisResult, mode: Mode)`. `config.analysis.textModel` defined in Task 1, read in Task 4. `WindowResult` shape from AnalyzePanel is reused verbatim (success variant has `ok: true`).

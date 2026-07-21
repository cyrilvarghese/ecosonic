# Text Analysis — analyze a written track description

**Status:** Approved design · **Date:** 2026-07-19 · **Branch:** `feat/three-pass-analysis`
**Related:** [three-pass design](./2026-07-18-three-pass-analysis-design.md) ·
[timeline design](./2026-07-19-analysis-timeline-design.md) ·
[save/reload design](./2026-07-19-analysis-save-reload-design.md)

---

## 1. Problem

Some reference material arrives as a **written production description** (per-section timing prose, like
the brief's TRACK INFO), not audio. The user wants the *same* rules workflow — candidates, verdicts,
timeline/cards, keep/promote, save/reload — driven by that text, with **no audio processing**.

## 2. Solution overview

A text-input path that produces the **exact same `WindowResult[]`** the audio path does, so every
downstream stage (classification, tabs, Timeline·Cards, ghost bands, readable rules, save/reload)
is reused unchanged. One OpenAI call to a **text model with strict structured outputs** reads the
whole description and returns per-mode observations.

```
paste text / .txt·.md file + a name
  → POST /api/analyze-text { text, name }
  → ONE OpenAI call (config.analysis.textModel, text-only, response_format json_schema strict)
     → { windows: [ { mode, description, sections, observations } … up to 3 ] }
  → per window: classifyObservations(result, mode) → candidates      (reused)
  → return WindowResult[] → client onResult(results, name)           (reused)
  → tabs / Timeline·Cards / auto-save & reload                       (reused, unchanged)
```

Decisions locked in brainstorming:
- **Input:** a paste textarea **and** a `.txt`/`.md` file button (plain text only — no PDF parsing).
- **One call** over the whole text (it describes all three sections at once; cheaper, better-informed).
- **Model:** `config.analysis.textModel = "gpt-5.6-luna"`, using **strict `json_schema`** (text models
  support structured outputs, unlike the audio model — this path needs no `extractJson`).
- Timings are **absolute mm:ss from each section's start**, `sections: null` (no sub-sectioning — the
  three doc sections *are* the three modes, so no offset bug).

## 3. Config — `config.analysis.textModel`

Add `textModel: z.string().min(1)` to the `analysis` object in [config.ts](../../../src/config.ts);
set `"textModel": "gpt-5.6-luna"` in `config/ecosonic.config.json`. Swapping models is a one-line
config change. Update `config.test.ts` to assert the field parses and rejects empty.

## 4. Prompt — `buildTextPrompt()` in `inventory.ts`

A **blind** text-analysis prompt (no house grammar), zero-arg like `buildSystemPrompt`:
- Gives the layer vocabulary (`LAYER_VOCABULARY`) so the model maps prose ("flowing water") to a
  category (`ELEMENT`).
- Instructs: read the description; for **each of the three sections** (Introduction / Deep Relaxation /
  Return) that the text describes, emit a window `{ mode, description, sections: null, observations }`.
- Timings inside `structured` are **absolute seconds from that section's start (0:00)**; `enter/exit`
  are positions, `fadeIn/fadeOut` are durations; `present` is a 0–1 fraction; use null when unknown.
- Never claim psychological/therapeutic effects (same guardrail as audio).

## 5. Schema — `analysisSchema.ts`

- `TextWindowSchema = z.object({ mode: z.enum(MODES) }).extend(AnalysisResult fields)` — reuse
  `ObservationSchema`; i.e. `{ mode, description, sections, observations }`.
- `TextAnalysisSchema = z.object({ windows: z.array(TextWindowSchema) })`.
- `OPENAI_TEXT_ANALYSIS_JSON_SCHEMA` — hand-written strict schema (`additionalProperties:false`, every
  key required) wrapping the existing observation JSON schema in `{ windows: [ { mode, description,
  sections, observations } ] }`, reusing the observation sub-schema already defined for audio.
- Types `TextWindow`, `TextAnalysis` exported.

## 6. API — `src/app/api/analyze-text/route.ts`

- `runtime = 'nodejs'`.
- `POST` body `{ text: string, name: string }` (JSON). Validate: `OPENAI_API_KEY` set (else 503);
  `text` non-empty and ≤ a cap (e.g. 20 000 chars, else 400); `name` non-empty (else 400).
- One `chat/completions` call: `model: config.analysis.textModel`, messages =
  `[{system: buildTextPrompt()}, {user: text}]`, `response_format: { type:'json_schema', json_schema:
  { name:'text_analysis', strict:true, schema: OPENAI_TEXT_ANALYSIS_JSON_SCHEMA } }`.
- Non-2xx from OpenAI → 502. Parse content with `TextAnalysisSchema` (no `extractJson` needed);
  malformed → 502 (log raw reply).
- For each window: `classifyObservations(window, window.mode)` → return
  `windows.map(w => ({ mode, description, sections, candidates }))` (a `WindowResult[]`-shaped array).

## 7. Client — `AnalyzeTextPanel.tsx` + page wiring

- **`AnalyzeTextPanel`** ([src/components/rules](../../../src/components/rules)): props `{ ready, onResult }`
  (same contract as `AnalyzePanel`). A textarea (paste) + a `.txt`/`.md` file button that reads the
  file into the textarea + a name field (defaults to the file name) + an "Analyze description" button.
  On submit: POST `/api/analyze-text`, map the returned windows to `WindowResult[]` (all `ok: true`;
  on a failed request, one error `WindowResult` per mode is unnecessary — surface a panel-level error),
  call `onResult(results, name)`.
- **`RulesPage`**: render `<AnalyzeTextPanel ready={ready} onResult={onResult} />` directly below the
  audio `<AnalyzePanel>` in the Discover column. `onResult` already shows results **and** auto-saves,
  so text analyses save & reload identically. No other change.

## 8. Testing

- `buildTextPrompt`: blind (no grammar numbers `540/270/390/480/570`), mentions the three modes, takes
  no arguments.
- `TextAnalysisSchema`: accepts a 3-window fixture; `OPENAI_TEXT_ANALYSIS_JSON_SCHEMA` passes the
  existing strict-shape recursion check.
- `/api/analyze-text` (node env): stubbed OpenAI → 3 classified `WindowResult`s; 400 on empty text;
  400 on empty name; 503 without key; 502 on malformed model reply.
- `AnalyzeTextPanel` (RTL): pasting text + clicking Analyze issues the POST and calls `onResult`.

## 9. Out of scope (v1)

PDF parsing (plain text only), editing text post-analysis, audio↔text reconciliation, and a text-model
readiness probe separate from the audio one (both use the same `OPENAI_API_KEY`).

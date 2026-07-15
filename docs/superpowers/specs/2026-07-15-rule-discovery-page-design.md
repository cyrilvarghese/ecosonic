# Rule Discovery Page — Design

**Status:** Approved design (2026-07-15) · **Author:** brainstormed with the user
**Related:** [Generative framework](../../generative/03-generation-framework.md) ·
[Brief analysis (R1–R9)](../../generative/01-brief-analysis.md) ·
[LLM-composer assessment](../../generative/05-llm-composer-value-assessment.md) ·
[ADR-0004 (rules as config data)](../../adr/0004-mode-rules-as-config-data.md)

## 1. What this is

A page where the sound designer **uploads a reference track (MP3/WAV) and gets composition rules
out of it** — described in the style of the production brief (`TRACK INFO`), compared against the
rules ECOSONIC already has, with a human gate on every rule before it touches anything.

The rule lifecycle (all states user-driven):

```
candidate (from analysis) ──Keep──▶ registry (kept) ──Promote──▶ live grammar (Generate uses it)
        └─Discard (not persisted)          └─ prose rules stay kept-only (promote needs a structured form)
```

Decisions locked during brainstorm:

1. **Keep = registry only** — kept rules do *not* alter generation; **Promote** is a second,
   explicit, per-rule gate.
2. **Registry = JSON file in repo** (`config/discovered-rules.json`), git-tracked, zod-validated.
3. **Approach A: single-shot analysis** — the whole file in one `gpt-audio-1.5` call. The response
   schema reserves room for per-section analysis (Approach B) later; no schema change needed.
4. **Mechanics-only guardrail** — evidence/rationale describe *what happens when* in the audio,
   never claimed therapeutic/neurological effects (per the
   [LLM-composer assessment §1](../../generative/05-llm-composer-value-assessment.md)).
5. **Blind extraction (2026-07-15 correction).** The model is told **what elements to listen for**
   (the layer vocabulary + sonic definitions) and the description **format** — **never the existing
   patterns/timings**. Feeding it the house rules would anchor it into "finding" them; the
   objective is discovery. Classification against existing rules (confirms / contradicts / novel)
   happens **locally and deterministically** (`src/rules/match.ts`), after the model returns raw
   observations.

## 2. OpenAI integration (grounded 2026-07-15)

- Audio analysis goes through **chat completions with `input_audio`** (base64 MP3/WAV), model
  **`gpt-audio-1.5`**, per the [audio guide](https://developers.openai.com/api/docs/guides/audio).
  The [Files API](https://developers.openai.com/api/reference/resources/files/methods/create) the
  feature request linked is *not* the audio-analysis vehicle (its purposes are
  assistants/batch/fine-tune/vision/user_data/evals); the user uploads to **our** route, and our
  route sends base64 inline.
- **~25 MB request ceiling** → enforce `maxUploadBytes` client-side (friendly "re-encode at
  128 kbps mono" hint) *and* server-side. A 10–30 min MP3 at 96–128 kbps fits.
- `response_format: { type: "json_schema" }` (strict) forces the structured result; parse +
  zod-validate the content server-side anyway.
- Auth: `OPENAI_API_KEY` in `.env.local` (never exposed to the client). Page shows a setup banner
  when the key is missing (`GET /api/analyze` health probe returns `{ ready: boolean }`).
- Expectation set in UI copy: single-pass timing on a 30-min ambient file is approximate; the Keep
  gate is the filter. Rough cost per analysis is cents-level; not a blocker.

## 3. The page — `/rules`, three zones

**Zone 1 · Rule Library (view all rules)** — grouped, read from single sources of truth:

| Group | Source | Editable? |
|---|---|---|
| Principles **R1–R9** | `src/rules/inventory.ts` (texts transcribed from the brief analysis doc) | read-only |
| Invariants **I1–I6** | `src/rules/inventory.ts` (texts; enforced by `validateTemplate`) | read-only |
| **Live Grammar** | `config.layerTwo.generation.modeRules` rendered per mode × layer (11 categories incl. DRONE) | read-only here (Promote writes to it) |
| **Discovered** | `config/discovered-rules.json` | Promote (structured, kept) · Discard |

**Zone 2 · Analyze panel** — file input (`.mp3/.wav`), client-side size/type validation, upload →
progress state → results. Errors surfaced inline (too large, wrong type, missing key, OpenAI error).

**Zone 3 · Results** — after analysis:
- **Description** — TRACK-INFO-style prose of the uploaded track (sections, layer entrances/exits,
  fades), rendered as text.
- **Candidate cards** — one per extracted rule: statement, badge (✓ *matches R4* / ✗ *contradicts
  R3* / ★ *new*), timestamp evidence chips (`5:12 — second element enters`), confidence, a
  `structured` chip when machine-applicable. Actions per card: **Keep** / **Discard**; **Promote**
  appears on kept structured rules (also available later from Zone 1's Discovered group).

Route is standalone (`/rules`); add a small header link from `/layer2` ("Rules").

## 4. Data model

```ts
// src/rules/analysisSchema.ts (zod)

// What the MODEL returns — raw, blind observations. NO rule references, NO kind.
interface Observation {
  text: string;                       // testable statement, e.g. "A 2nd nature layer enters ~5:00"
  layer?: Category;                   // best-effort mapping onto the 11-category vocabulary
  sectionIndex?: number;              // 1-based, when the model perceives distinct sections
  structured?: {                      // present only when honestly expressible as timings
    category: Category;
    patch: Partial<GenLayerRule>;     // e.g. { enter: {canon:300, half:30} } or { present: 0.5 }
  };
  evidence: Array<{ atSec: number; note: string }>;
  confidence: number;                 // 0..1
}
interface AnalysisResult {
  description: string;                // brief-style prose
  sections?: Array<{ startSec: number; label: string }>;  // perceived macro-structure
  observations: Observation[];
}

// What the UI shows — observation + LOCALLY computed classification (src/rules/match.ts).
interface CandidateRule extends Observation {
  kind: 'confirms' | 'contradicts' | 'novel';
  relatedRule?: string;               // 'R4' | 'I2' | 'grammar:INTRODUCTION.ISO.enter' …
  mode?: Mode;                        // assigned by the matcher via section mapping
}

// config/discovered-rules.json — the registry (array of):
interface DiscoveredRule extends CandidateRule {
  id: string;                         // crypto.randomUUID() at keep-time
  source: { file: string; date: string; model: string };
  status: 'kept' | 'promoted';
}
```

Discarded candidates are **not persisted** (MVP); re-analyzing the same track may re-offer them —
a `discarded` status for dedup is a listed future upgrade, not in scope.

## 5. API routes (Node runtime — they use `fs`/env)

- **`POST /api/analyze`** — multipart `FormData` (`file`). Validate type/size → base64 → chat
  completion (blind system prompt from §6 + `input_audio` + strict json_schema) → zod-parse
  `AnalysisResult` → run the local matcher (§6b) → respond
  `{ description, sections, candidates: CandidateRule[] }`. `GET /api/analyze` → `{ ready }`.
- **`GET /api/rules`** — registry contents. **`POST /api/rules`** — keep a candidate (append,
  assign id/source/status). **`PATCH /api/rules`** — `{ id, action: 'promote' | 'discard' }`;
  discard removes a **kept** entry from the registry; promote runs §7 then sets
  `status: 'promoted'`. (Discarding a Zone-3 candidate that was never kept is purely client-side —
  nothing was persisted.)

Config gains a top-level `analysis` block (zod-extended, fixture updated):

```json
"analysis": { "model": "gpt-audio-1.5", "maxUploadBytes": 26214400 }
```

## 6. The analysis prompt — blind by design (server-built)

The model **never sees the existing rules, timings, or the TRACK INFO numbers** — only what to
listen *for* and how to *report*. System prompt assembled from:

1. **Role + format contract** — "you describe ambient/meditation productions as a chronological,
   section-by-section narrative of layer entrances, exits, and fades with approximate timestamps"
   — the brief's *form*, taught by instruction (and a short synthetic example with obviously
   non-ECOSONIC numbers), never its content.
2. **Element vocabulary** — the 11 layer roles with sonic definitions so the model can recognize
   them (NOISE broadband floor; ELEMENT nature identity; ELEMENT_SUB softer nature textures; FX
   synthesized textures; ISO pulsed tone; PLANET sustained tuning-tone; DRONE slow swelling
   sustain; PAD harmonic wash; BASS low foundation; ARP cyclic pattern; MELODY top line). Stored in
   `src/rules/inventory.ts`.
3. **Output contract** — prose description; perceived `sections`; then `observations` as testable
   statements with timestamp evidence; attach `structured` timings only when honestly expressible;
   report **everything notable, including patterns that may be unremarkable** — no knowledge of
   what the house style expects.
4. **Guardrail** — "Describe compositional mechanics only (what happens, when). Never claim
   psychological, therapeutic, or neurological effects."

### 6b. The local matcher (`src/rules/match.ts`) — classification without anchoring

Deterministic, pure; runs after the model responds:

- **Section→mode mapping:** exactly 3 perceived sections → map in order to
  INTRODUCTION / DEEP_RELAXATION / RETURN and compare section-relative timings. Otherwise only
  **global** rules are compared (continuity/ordering — e.g. R7 noise-unbroken, R2 bottom-up
  entrances on the absolute timeline); unmapped timing observations classify as **novel**.
- **Timing comparison:** an observation with `structured` vs the grammar's
  `modeRules[mode][category]`: within `max(30s, half × EXPLORATORY scale)` of the canon →
  **confirms** (`relatedRule: 'grammar:MODE.CAT.field'`); outside it, or violating an R/I rule the
  observation addresses → **contradicts**; no corresponding rule/layer entry → **novel**.
- Prose-only observations match only the principle rules they textually address (small keyword map
  per R/I rule, e.g. noise+continuous → R7); otherwise **novel**. Honest default: when unsure,
  novel — the Keep gate is the filter.

## 7. Promote (the only write into the grammar)

Structured, kept rules only. Steps, all-or-nothing:
1. Read `config/ecosonic.config.json`; locate `layerTwo.generation.modeRules[mode][category]`.
2. **Entry exists** → shallow-merge `patch` over it. **Entry absent** → `patch` must be a complete
   `GenLayerRule`, else reject with a message ("rule addresses a layer absent in this mode —
   promote needs full timings").
3. Validate the **entire merged config** with the existing `ConfigSchema`; on failure, reject and
   write nothing.
4. Write config (2-space pretty-print, preserving key order by round-tripping the parsed object),
   set the registry entry to `promoted`. Dev-server hot reload makes Generate pick it up; the git
   diff on config is the audit trail.

## 8. Files

| File | Responsibility |
|---|---|
| `src/app/rules/page.tsx` | `/rules` route — composes the three zones (client component) |
| `src/components/rules/RuleLibrary.tsx` | Zone 1 (groups, badges, Promote/Discard on Discovered) |
| `src/components/rules/AnalyzePanel.tsx` | Zone 2 (upload, validation, progress, errors) |
| `src/components/rules/CandidateCard.tsx` | Zone 3 cards (badge, evidence, Keep/Discard/Promote) |
| `src/app/api/analyze/route.ts` | POST analysis + GET readiness |
| `src/app/api/rules/route.ts` | GET/POST/PATCH registry |
| `src/rules/inventory.ts` | R1–R9 + I1–I6 texts (UI + matcher), layer sonic vocabulary + format contract (prompt), live-grammar serializer (UI only — never in the prompt) |
| `src/rules/analysisSchema.ts` | zod: `Observation`, `AnalysisResult`, `CandidateRule`, `DiscoveredRule`, OpenAI json_schema export |
| `src/rules/match.ts` | §6b — deterministic observation→rule classification (pure, tested) |
| `src/rules/registry.ts` | read/append/patch `discovered-rules.json` (path injectable for tests) |
| `src/rules/promote.ts` | §7 merge + validate + write (paths injectable for tests) |
| `config/discovered-rules.json` | seeded `[]` |
| `src/config.ts` / `config.test.ts` | `analysis` block schema + fixture |

## 9. Testing

- **`analysisSchema`** — accepts a full fixture; rejects bad confidence/structured shapes.
- **`match`** — 3-section mapping → confirms within tolerance / contradicts outside; ≠3 sections →
  timing observations classify novel, global rules still compared; keyword-matched prose (noise
  continuous → R7); unknown layer/pattern → novel. Pure-function table tests across fixtures.
- **`registry`** — round-trip keep → list → patch on a temp file; malformed file → clear error.
- **`promote`** — merge-into-existing; complete-entry-into-absent; *reject* partial-into-absent;
  *reject* merge that fails `ConfigSchema` (config file untouched — assert byte-equality).
- **`/api/analyze`** — mocked `fetch`: happy path parses; OpenAI error → 502 with message; missing
  key → `ready:false`; oversize/wrong-type → 4xx. (No real network in tests.)
- UI stays thin; no component tests beyond what exists elsewhere in the repo.

Manual verification: analyze the user's sample MP3; description reads like the brief; candidates
include at least the second-element and staggered-entry patterns; Keep → file diff; Promote a
structured rule → config diff + Generate reflects it.

## 10. Out of scope (explicit)

Sectioned/two-pass analysis (B), DSP-assisted analysis (C), auto-apply on keep, discard-dedup
memory, promoting prose rules, editing a rule's structured form in-UI, localStorage, any
listener-facing surface, cost accounting.

## 11. Build notes for the plan

- **AGENTS.md guard:** read `node_modules/next/dist/docs/` route-handler + page conventions before
  writing `src/app/**` code (this Next version deviates from training data).
- The repo has uncommitted user changes (electron packaging, store/UI tweaks) — implementation
  commits must stage only their own files.
- `.env.local` is untracked; document `OPENAI_API_KEY=` in the spec/plan, never commit a key.

# Analysis Save / Reload — Design

**Status:** Approved design · **Date:** 2026-07-19 · **Branch:** `feat/three-pass-analysis`
**Related:** [three-pass design](./2026-07-18-three-pass-analysis-design.md) ·
[registry.ts](../../../src/rules/registry.ts) · [api/rules route](../../../src/app/api/rules/route.ts) ·
[rules page](../../../src/app/rules/page.tsx)

---

## 1. Problem

Each analysis costs three OpenAI audio calls. Today nothing persists the result — reopening `/rules`
or re-analyzing a track re-pays. We want to **save every completed analysis by file name and reload
it later without calling OpenAI**.

## 2. Solution overview

Mirror the existing rule-registry pattern: a Zod-validated server-side JSON store behind an API
route. The client **auto-saves** a completed analysis (upsert by file name) and can **reload** or
**delete** saved ones from a collapsible list.

```
analysis completes → client POST /api/analyses (upsert by fileName) → config/analyses.json
Saved-analyses accordion → Load → GET /api/analyses?file=NAME → repopulate tabs/timeline (no OpenAI)
                         → Delete → DELETE /api/analyses?file=NAME
```

Decisions locked in brainstorming:
- **Server-side JSON** (`config/analyses.json`), not localStorage — durable, shareable, matches the
  `discovered-rules.json` precedent.
- **Auto-save on completion** (never lose a paid analysis) **+ Delete** on the reload list.
- **Upsert by file name** — one entry per name, latest wins (what "reload by file name" implies).
- **Reload UI = a separate collapsible accordion below the Discover column**, "Saved analyses (N)".
- Persist **successful windows only** (an errored window carries no reusable data).

## 3. Persisted shape & store — `src/rules/analysisStore.ts` (new)

Schema added to `src/rules/analysisSchema.ts`:
```
SavedWindowSchema  = { mode: Mode; description: string;
                       sections: Array<{ startSec; label }> | null;
                       candidates: CandidateRule[] }         // reuse CandidateRuleSchema
SavedAnalysisSchema = { fileName: string; savedAt: string; model: string;
                        windows: SavedWindow[] }
AnalysisStoreSchema = SavedAnalysis[]
```

`analysisStore.ts` mirrors `registry.ts` (sync fs, env-overridable path, Zod-validated):
- `readAnalyses(filePath?): SavedAnalysis[]` — parse + validate `config/analyses.json`; **missing file
  → `[]`** (unlike the rules registry, this file may not exist yet).
- `saveAnalysis(entry: SavedAnalysis, filePath?): SavedAnalysis` — upsert by `fileName` (replace
  existing, else append); write; return the entry.
- `getAnalysis(fileName, filePath?): SavedAnalysis | null`.
- `deleteAnalysis(fileName, filePath?): boolean`.
- Path: `process.env.ECOSONIC_ANALYSES_PATH ?? config/analyses.json`.

## 4. API — `src/app/api/analyses/route.ts` (new)

- `GET` (no query) → **metadata list**: `Array<{ fileName; savedAt; model; windowCount;
  candidateCount }>` (small — no candidate payloads).
- `GET ?file=NAME` → the full `SavedAnalysis` (404 if absent).
- `POST` (body = `SavedAnalysis`, Zod-validated) → `saveAnalysis`, `201`.
- `DELETE ?file=NAME` → `deleteAnalysis`; `{ ok }` or `404`.

## 5. Client — `src/app/rules/page.tsx`

- Factor the display path: `showResults(results, fileName)` sets `groups` / `activeTab` / `view`
  (today's `onResult` body). Then:
  - `onResult(results, fileName)` = `showResults(...)` **+** auto-save: POST the successful windows as a
    `SavedAnalysis`, then refresh the saved list.
  - `loadSaved(fileName)` = `GET ?file=NAME` → rebuild `WindowResult[]` (all `ok: true`) →
    `showResults(...)` (no re-save).
- `savedList` state (metadata), fetched on mount and after save/delete.
- **`SavedAnalyses` accordion** (new component, `src/components/rules/SavedAnalyses.tsx`): collapsible
  "Saved analyses (N)" below the Discover column; each row `fileName · savedAt`, with `Load` / `Delete`.
  No `@base-ui` accordion exists, so a small `useState` open/close with a chevron.

## 6. Testing

- `analysisStore` unit tests (temp file, like registry style): missing file → `[]`; `saveAnalysis`
  appends then upserts (same fileName replaces, count stays); `getAnalysis` hit/miss; `deleteAnalysis`
  true/false.
- `api/analyses/route` tests: POST then GET-list shows metadata; `GET ?file` returns full / 404;
  DELETE removes; POST with bad body → 400.
- `SavedAnalyses` component smoke test (RTL): renders rows, Load/Delete fire their callbacks.

## 7. Out of scope (v1)

Versioning/history per file name (upsert only), search/sort of the list, renaming, cross-session
export/import, and persisting errored windows.

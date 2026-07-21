# Analysis Save / Reload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-save every completed analysis to a server-side JSON store keyed by file name, and reload or delete saved analyses without calling OpenAI.

**Architecture:** A Zod-validated store module (`analysisStore.ts`) over `config/analyses.json` mirroring `registry.ts`, exposed via `/api/analyses`. The client auto-saves on completion (upsert by file name) and reloads from a collapsible accordion, reusing the existing display path.

**Tech Stack:** Next.js (App Router, node runtime), TypeScript, Zod, Vitest + @testing-library/react.

## Global Constraints

- Mirror `src/rules/registry.ts` exactly: sync `node:fs`, env-overridable path, Zod-validated, pretty JSON (`JSON.stringify(x, null, 2) + '\n'`).
- Store path: `process.env.ECOSONIC_ANALYSES_PATH ?? path.join(process.cwd(), 'config', 'analyses.json')`.
- **Missing store file → `[]`** (unlike the rules registry — this file may not exist yet). File present but invalid JSON/schema → throw a clear error.
- Upsert by `fileName` (one entry per name; latest wins). `savedAt` is stamped **server-side** in `saveAnalysis` (`new Date().toISOString()`), never sent by the client.
- Persist **successful windows only** (`ok: true`).
- Types: `Mode` (`@/arrange/types`); `CandidateRule`, `MODES`, `CandidateRuleSchema` (`@/rules/analysisSchema`).
- Vitest excludes `**/.claude/**`; run from repo root.

---

### Task 1: Persisted schemas + store — `src/rules/analysisStore.ts`

**Files:**
- Modify: `src/rules/analysisSchema.ts` (append the saved-analysis schemas)
- Create: `src/rules/analysisStore.ts`
- Test: `src/rules/analysisStore.test.ts`
- Modify: `.gitignore` (ignore the runtime store file)

**Interfaces:**
- Consumes: `CandidateRuleSchema`, `MODES` (`@/rules/analysisSchema`).
- Produces:
  - Schemas/types: `SavedWindowSchema`, `SavedAnalysisSchema`, `AnalysisStoreSchema`; `SavedWindow`, `SavedAnalysis`.
  - `readAnalyses(filePath?): SavedAnalysis[]`
  - `saveAnalysis(input: Omit<SavedAnalysis, 'savedAt'>, filePath?): SavedAnalysis`
  - `getAnalysis(fileName: string, filePath?): SavedAnalysis | null`
  - `deleteAnalysis(fileName: string, filePath?): boolean`

- [ ] **Step 1: Append schemas to `src/rules/analysisSchema.ts`**

At the end of the file (after `DiscoveredRuleSchema`):
```ts
/** A saved, reloadable analysis — the full per-window result, keyed by file name. */
export const SavedWindowSchema = z.object({
  mode: z.enum(MODES),
  description: z.string(),
  sections: z.array(z.object({ startSec: z.number(), label: z.string() })).nullable(),
  candidates: z.array(CandidateRuleSchema),
});
export const SavedAnalysisSchema = z.object({
  fileName: z.string().min(1),
  savedAt: z.string(),
  model: z.string(),
  windows: z.array(SavedWindowSchema),
});
export const AnalysisStoreSchema = z.array(SavedAnalysisSchema);
export type SavedWindow = z.infer<typeof SavedWindowSchema>;
export type SavedAnalysis = z.infer<typeof SavedAnalysisSchema>;
```

- [ ] **Step 2: Write the failing store test**

```ts
// src/rules/analysisStore.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readAnalyses, saveAnalysis, getAnalysis, deleteAnalysis } from '@/rules/analysisStore';
import type { SavedAnalysis } from '@/rules/analysisSchema';

const input = (fileName: string): Omit<SavedAnalysis, 'savedAt'> => ({
  fileName, model: 'gpt-audio-1.5',
  windows: [{ mode: 'INTRODUCTION', description: 'd', sections: null, candidates: [] }],
});

let dir: string;
beforeEach(() => { dir = mkdtempSync(path.join(tmpdir(), 'eco-analyses-')); });
const at = (name = 'analyses.json') => path.join(dir, name);

describe('analysisStore', () => {
  it('missing file reads as an empty store', () => {
    expect(readAnalyses(at('does-not-exist.json'))).toEqual([]);
  });
  it('save stamps savedAt and round-trips', () => {
    const saved = saveAnalysis(input('a.mp3'), at());
    expect(new Date(saved.savedAt).getTime()).toBeGreaterThan(0);
    expect(readAnalyses(at())).toEqual([saved]);
  });
  it('save upserts by fileName (same name replaces, count stays 1)', () => {
    saveAnalysis(input('a.mp3'), at());
    saveAnalysis(input('a.mp3'), at());
    saveAnalysis(input('b.mp3'), at());
    const all = readAnalyses(at());
    expect(all).toHaveLength(2);
    expect(all.filter((x) => x.fileName === 'a.mp3')).toHaveLength(1);
  });
  it('getAnalysis hit and miss', () => {
    saveAnalysis(input('a.mp3'), at());
    expect(getAnalysis('a.mp3', at())?.fileName).toBe('a.mp3');
    expect(getAnalysis('nope.mp3', at())).toBeNull();
  });
  it('deleteAnalysis true then false', () => {
    saveAnalysis(input('a.mp3'), at());
    expect(deleteAnalysis('a.mp3', at())).toBe(true);
    expect(deleteAnalysis('a.mp3', at())).toBe(false);
    expect(readAnalyses(at())).toEqual([]);
  });
  it('malformed store throws a clear error', () => {
    writeFileSync(at(), '{"not":"an array"}');
    expect(() => readAnalyses(at())).toThrow(/analyses store/);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/rules/analysisStore.test.ts`
Expected: FAIL — cannot find module `@/rules/analysisStore`.

- [ ] **Step 4: Write `src/rules/analysisStore.ts`**

```ts
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { AnalysisStoreSchema, type SavedAnalysis } from '@/rules/analysisSchema';

const defaultPath = (): string =>
  process.env.ECOSONIC_ANALYSES_PATH ?? path.join(process.cwd(), 'config', 'analyses.json');

export function readAnalyses(filePath: string = defaultPath()): SavedAnalysis[] {
  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf8');
  } catch {
    return []; // no store yet → empty
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error(`analyses store unreadable at ${filePath}`);
  }
  const parsed = AnalysisStoreSchema.safeParse(json);
  if (!parsed.success) throw new Error(`analyses store invalid at ${filePath}`);
  return parsed.data;
}

function write(all: SavedAnalysis[], filePath: string): void {
  writeFileSync(filePath, JSON.stringify(all, null, 2) + '\n');
}

/** Upsert by fileName; latest wins. savedAt is stamped here, not sent by the client. */
export function saveAnalysis(
  input: Omit<SavedAnalysis, 'savedAt'>, filePath: string = defaultPath(),
): SavedAnalysis {
  const entry: SavedAnalysis = { ...input, savedAt: new Date().toISOString() };
  const all = readAnalyses(filePath).filter((a) => a.fileName !== entry.fileName);
  all.push(entry);
  write(all, filePath);
  return entry;
}

export function getAnalysis(fileName: string, filePath: string = defaultPath()): SavedAnalysis | null {
  return readAnalyses(filePath).find((a) => a.fileName === fileName) ?? null;
}

export function deleteAnalysis(fileName: string, filePath: string = defaultPath()): boolean {
  const all = readAnalyses(filePath);
  const next = all.filter((a) => a.fileName !== fileName);
  if (next.length === all.length) return false;
  write(next, filePath);
  return true;
}
```

- [ ] **Step 5: Ignore the runtime store file**

Append to `.gitignore`:
```
config/analyses.json
```

- [ ] **Step 6: Run tests + typecheck**

Run: `npx vitest run src/rules/analysisStore.test.ts && npx tsc --noEmit`
Expected: 6 tests PASS; no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/rules/analysisSchema.ts src/rules/analysisStore.ts src/rules/analysisStore.test.ts .gitignore
git commit -m "feat(rules): server-side analysis store (save/get/delete, upsert by file)"
```

---

### Task 2: API route — `src/app/api/analyses/route.ts`

**Files:**
- Create: `src/app/api/analyses/route.ts`
- Test: `src/app/api/analyses/route.test.ts`

**Interfaces:**
- Consumes: `readAnalyses`, `saveAnalysis`, `getAnalysis`, `deleteAnalysis` (Task 1); `SavedAnalysisSchema` (`@/rules/analysisSchema`).
- Produces: `GET` (list metadata / `?file=` full), `POST` (save), `DELETE` (`?file=`).

- [ ] **Step 1: Write the failing route test**

```ts
// src/app/api/analyses/route.test.ts
// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { GET, POST, DELETE } from '@/app/api/analyses/route';

const body = (fileName: string) => ({
  fileName, model: 'gpt-audio-1.5',
  windows: [{ mode: 'INTRODUCTION', description: 'opens on noise', sections: null, candidates: [] }],
});
const req = (method: string, url: string, json?: unknown) =>
  new Request(url, json === undefined
    ? { method }
    : { method, body: JSON.stringify(json), headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  const store = path.join(mkdtempSync(path.join(tmpdir(), 'eco-analyses-api-')), 'analyses.json');
  vi.stubEnv('ECOSONIC_ANALYSES_PATH', store);
});

describe('/api/analyses', () => {
  it('POST saves; GET lists metadata (no candidate payloads)', async () => {
    expect((await POST(req('POST', 'http://test/api/analyses', body('a.mp3')))).status).toBe(201);
    const list = await (await GET(req('GET', 'http://test/api/analyses'))).json();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ fileName: 'a.mp3', windowCount: 1, candidateCount: 0 });
    expect(list[0].windows).toBeUndefined();
  });
  it('GET ?file returns the full analysis; 404 when absent', async () => {
    await POST(req('POST', 'http://test/api/analyses', body('a.mp3')));
    const full = await (await GET(req('GET', 'http://test/api/analyses?file=a.mp3'))).json();
    expect(full.windows[0].description).toBe('opens on noise');
    expect((await GET(req('GET', 'http://test/api/analyses?file=missing.mp3'))).status).toBe(404);
  });
  it('DELETE removes; 404 when absent', async () => {
    await POST(req('POST', 'http://test/api/analyses', body('a.mp3')));
    expect((await DELETE(req('DELETE', 'http://test/api/analyses?file=a.mp3'))).status).toBe(200);
    expect((await DELETE(req('DELETE', 'http://test/api/analyses?file=a.mp3'))).status).toBe(404);
  });
  it('POST rejects a malformed body', async () => {
    expect((await POST(req('POST', 'http://test/api/analyses', { nope: true }))).status).toBe(400);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/app/api/analyses/route.test.ts`
Expected: FAIL — cannot find module `@/app/api/analyses/route`.

- [ ] **Step 3: Write the route**

```ts
// src/app/api/analyses/route.ts
import { SavedAnalysisSchema } from '@/rules/analysisSchema';
import { readAnalyses, saveAnalysis, getAnalysis, deleteAnalysis } from '@/rules/analysisStore';

export const runtime = 'nodejs';

const SaveInput = SavedAnalysisSchema.omit({ savedAt: true });

export async function GET(req: Request) {
  const file = new URL(req.url).searchParams.get('file');
  if (file) {
    const entry = getAnalysis(file);
    return entry ? Response.json(entry) : Response.json({ error: 'not found' }, { status: 404 });
  }
  return Response.json(readAnalyses().map((a) => ({
    fileName: a.fileName,
    savedAt: a.savedAt,
    model: a.model,
    windowCount: a.windows.length,
    candidateCount: a.windows.reduce((n, w) => n + w.candidates.length, 0),
  })));
}

export async function POST(req: Request) {
  const parsed = SaveInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'bad request' }, { status: 400 });
  return Response.json(saveAnalysis(parsed.data), { status: 201 });
}

export async function DELETE(req: Request) {
  const file = new URL(req.url).searchParams.get('file');
  if (!file) return Response.json({ error: 'file query required' }, { status: 400 });
  return deleteAnalysis(file)
    ? Response.json({ ok: true })
    : Response.json({ error: 'not found' }, { status: 404 });
}
```

- [ ] **Step 4: Run tests + typecheck**

Run: `npx vitest run src/app/api/analyses/route.test.ts && npx tsc --noEmit`
Expected: 4 tests PASS; no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/analyses/route.ts src/app/api/analyses/route.test.ts
git commit -m "feat(analyses): /api/analyses route (list/get/save/delete)"
```

---

### Task 3: Saved-analyses accordion — `src/components/rules/SavedAnalyses.tsx`

**Files:**
- Create: `src/components/rules/SavedAnalyses.tsx`
- Test: `src/components/rules/SavedAnalyses.test.tsx`

**Interfaces:**
- Produces:
  - `interface SavedMeta { fileName: string; savedAt: string; model: string; windowCount: number; candidateCount: number }`
  - `SavedAnalyses({ items: SavedMeta[]; onLoad: (fileName: string) => void; onDelete: (fileName: string) => void }): JSX.Element`

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/rules/SavedAnalyses.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SavedAnalyses, type SavedMeta } from '@/components/rules/SavedAnalyses';

const items: SavedMeta[] = [
  { fileName: 'track.mp3', savedAt: '2026-07-19T00:00:00.000Z', model: 'gpt-audio-1.5', windowCount: 3, candidateCount: 12 },
];

describe('SavedAnalyses', () => {
  it('expands and fires Load / Delete with the file name', async () => {
    const onLoad = vi.fn();
    const onDelete = vi.fn();
    render(<SavedAnalyses items={items} onLoad={onLoad} onDelete={onDelete} />);
    await userEvent.click(screen.getByText(/Saved analyses/i)); // open the accordion
    await userEvent.click(screen.getByRole('button', { name: /load/i }));
    await userEvent.click(screen.getByRole('button', { name: /delete/i }));
    expect(onLoad).toHaveBeenCalledWith('track.mp3');
    expect(onDelete).toHaveBeenCalledWith('track.mp3');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/components/rules/SavedAnalyses.test.tsx`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write the component**

```tsx
// src/components/rules/SavedAnalyses.tsx
'use client';
import { useState } from 'react';

export interface SavedMeta {
  fileName: string;
  savedAt: string;
  model: string;
  windowCount: number;
  candidateCount: number;
}

export function SavedAnalyses({
  items, onLoad, onDelete,
}: {
  items: SavedMeta[];
  onLoad: (fileName: string) => void;
  onDelete: (fileName: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className="rounded-[var(--radius-md)] border border-border bg-card">
      <button type="button" onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium">
        <span>Saved analyses ({items.length})</span>
        <span className="text-muted-foreground">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="flex flex-col gap-1 border-t border-border p-2">
          {items.length === 0 && (
            <p className="px-2 py-1 text-xs text-muted-foreground">No saved analyses yet.</p>
          )}
          {items.map((a) => (
            <div key={a.fileName} className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-muted">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">{a.fileName}</div>
                <div className="text-[11px] text-muted-foreground">
                  {new Date(a.savedAt).toLocaleString()} · {a.windowCount} pass · {a.candidateCount} candidates
                </div>
              </div>
              <button type="button" onClick={() => onLoad(a.fileName)}
                className="rounded-full px-3 py-1 text-xs text-white transition-calm" style={{ background: 'var(--accent-ink)' }}>
                Load
              </button>
              <button type="button" onClick={() => onDelete(a.fileName)}
                className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition-calm hover:text-foreground">
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Run tests + typecheck**

Run: `npx vitest run src/components/rules/SavedAnalyses.test.tsx && npx tsc --noEmit`
Expected: PASS; no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/rules/SavedAnalyses.tsx src/components/rules/SavedAnalyses.test.tsx
git commit -m "feat(rules): SavedAnalyses accordion (Load/Delete rows)"
```

---

### Task 4: Wire auto-save + reload into `src/app/rules/page.tsx`

**Files:**
- Modify: `src/app/rules/page.tsx`

**Interfaces:**
- Consumes: `SavedAnalyses`, `SavedMeta` (Task 3); `/api/analyses` (Task 2); existing `WindowResult`, `config`, `CandidateRule`, `Mode`.
- Produces: auto-save on completion, saved-list state, `loadSaved`/`deleteSaved`, and the accordion rendered below the Discover column.

- [ ] **Step 1: Add imports**

```tsx
import { AnalyzePanel, type WindowResult } from '@/components/rules/AnalyzePanel';
import { AnalysisTimeline } from '@/components/rules/AnalysisTimeline';
import { CandidateCard } from '@/components/rules/CandidateCard';
import { RuleLibrary } from '@/components/rules/RuleLibrary';
import { SavedAnalyses, type SavedMeta } from '@/components/rules/SavedAnalyses';
```

- [ ] **Step 2: Add saved-list state + refresh, and fetch on mount**

Add state near the others:
```tsx
  const [savedList, setSavedList] = useState<SavedMeta[]>([]);
```
Add a refresher beside `refresh`:
```tsx
  const refreshSaved = useCallback(async () => {
    setSavedList(await (await fetch('/api/analyses')).json());
  }, []);
```
In the existing mount `useEffect`, also call it:
```tsx
  useEffect(() => {
    void fetch('/api/analyze').then(async (r) => setReady((await r.json()).ready));
    void refresh();
    void refreshSaved();
  }, [refresh, refreshSaved]);
```

- [ ] **Step 3: Split display from save; add load/delete**

Replace the existing `onResult` with a `showResults` (its current body) plus an `onResult` that also auto-saves, and add `loadSaved` / `deleteSaved`:
```tsx
  const showResults = (results: WindowResult[], name: string) => {
    setFileName(name);
    setGroups(results.map((r) => r.ok
      ? {
          mode: r.mode, error: null, description: r.description,
          cards: (r.candidates as CandidateRule[]).map((candidate) => ({ candidate, keptId: null })),
        }
      : { mode: r.mode, error: r.error, description: '', cards: [] }));
    setActiveTab(results[0]?.mode ?? null);
    setView('timeline');
  };

  const onResult = (results: WindowResult[], name: string) => {
    showResults(results, name);
    const windows = results
      .filter((r): r is Extract<WindowResult, { ok: true }> => r.ok)
      .map((r) => ({ mode: r.mode, description: r.description, sections: r.sections, candidates: r.candidates as CandidateRule[] }));
    if (windows.length > 0) {
      void fetch('/api/analyses', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: name, model: config.analysis.model, windows }),
      }).then(() => refreshSaved());
    }
  };

  const loadSaved = async (name: string) => {
    setActionError(null);
    const res = await fetch(`/api/analyses?file=${encodeURIComponent(name)}`);
    if (!res.ok) { setActionError('Load failed'); return; }
    const saved = await res.json() as { fileName: string; windows: Array<{ mode: Mode; description: string; sections: Array<{ startSec: number; label: string }> | null; candidates: CandidateRule[] }> };
    showResults(saved.windows.map((w) => ({ mode: w.mode, ok: true, description: w.description, sections: w.sections, candidates: w.candidates })), saved.fileName);
  };

  const deleteSaved = async (name: string) => {
    await fetch(`/api/analyses?file=${encodeURIComponent(name)}`, { method: 'DELETE' });
    void refreshSaved();
  };
```

- [ ] **Step 4: Render the accordion below the Discover column**

In the left column `<div className="flex flex-col gap-4">`, immediately **after** the `{groups.length > 0 && (...)}` candidate section and before the closing `</div>` of that column, add:
```tsx
            <SavedAnalyses items={savedList}
              onLoad={(name) => void loadSaved(name)}
              onDelete={(name) => void deleteSaved(name)} />
```

- [ ] **Step 5: Typecheck + full suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no type errors; all tests pass (prior + Tasks 1-3 additions).

- [ ] **Step 6: Manual verification (dev server)**

Run: `npm run dev`, open `/rules`, analyze a track → it appears under "Saved analyses (N)". Reload the page, expand the accordion, click **Load** → the tabs/timeline repopulate with no network call to OpenAI (only `GET /api/analyses?file=`). Click **Delete** → the row disappears.

- [ ] **Step 7: Commit**

```bash
git add src/app/rules/page.tsx
git commit -m "feat(rules): auto-save analyses + reload/delete from the Discover accordion"
```

---

## Self-Review

**Spec coverage:**
- §3 store (readAnalyses missing→[], saveAnalysis upsert+stamp, get, delete) → Task 1. ✓
- §3 schemas (SavedWindow/SavedAnalysis/Store) → Task 1 Step 1. ✓
- §4 API (GET list/`?file`, POST, DELETE) → Task 2. ✓
- §5 client (showResults split, auto-save, loadSaved, savedList, accordion) → Task 4. ✓
- §5 accordion component → Task 3. ✓
- §6 tests (store, route, component) → Tasks 1, 2, 3. ✓
- §7 out of scope → nothing implemented from it. ✓

**Placeholder scan:** none — every step has complete code.

**Type consistency:** `saveAnalysis(input: Omit<SavedAnalysis,'savedAt'>)` defined in Task 1, called by the route in Task 2 with `SaveInput = SavedAnalysisSchema.omit({ savedAt: true })` (matching shape). `SavedMeta` defined in Task 3, imported in Task 4. `WindowResult` narrowed via `Extract<WindowResult,{ok:true}>` in Task 4; `loadSaved` builds `WindowResult` with `ok: true`. `showResults`/`onResult` signatures both `(results: WindowResult[], name: string)`. GET-list omits `windows` (metadata only), asserted in Task 2's test.

# ECOSONIC Layer One — Part 1: Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Next.js project and the non-visual foundation: validated config, a sample manifest, a streaming sample server, and the dB↔gain math — everything later parts depend on.

**Architecture:** A Next.js (App Router, `src/` dir) + TypeScript app. Pure, testable modules for config validation (zod), manifest building, URL resolution, and DSP math. A Node route handler streams the existing `ECOSONIC FILES/` folder with HTTP range support (no copying). Vitest drives TDD for all pure logic.

**Tech Stack:** Next.js 15+, React 19, TypeScript 5+, Tailwind v4, shadcn/ui, Vitest 2+, zod 3+, tsx (for the manifest script).

**Part:** 1 of 5. Next: Part 2 (Selection & State).

## Global Constraints

- **Framework:** Next.js 15+ (App Router, `--src-dir`), React 19, TypeScript 5+. Import alias `@/*` → `./src/*`.
- **Styling:** Tailwind v4 + shadcn/ui. Appearance lives in CSS tokens (`src/app/globals.css`); behavior lives in `config/ecosonic.config.json`. The two never overlap.
- **No magic numbers:** every behavioral constant comes from `config/ecosonic.config.json` via `src/config.ts`. Never hardcode volume ranges, thresholds, counts, or timings.
- **Selection categories (PDF-strict):** `ISO, PLANET, NOISE, ELEMENT, BASS, PAD, MELODY, FX`. `ARP` and `ELEMENT/SUB` are **recorded** in the manifest but **never used** by the builder.
- **Samples:** streamed from `ECOSONIC FILES/` (5.8 GB, git-ignored, never copied). Server must honor `Range` headers.
- **dB→gain:** `gain = db <= minDb ? 0 : 10 ** (db/20)`. Track volume is a *ceiling*.
- **Target:** desktop web browser. No Electron/iPad work in Build 1.
- **Discipline:** TDD, DRY, YAGNI, frequent commits. Tests are real (no placeholder assertions); browser-only behavior uses explicit manual-verification steps.

---

### Task 1: Project scaffold & tooling

**Files:**
- Create (via generator): Next.js app under `src/` with `src/app/{layout.tsx,page.tsx,globals.css}`
- Create: `config/ecosonic.config.json`
- Create: `vitest.config.ts`, `vitest.setup.ts`
- Modify: `package.json` (scripts), `tsconfig.json` (verify alias)
- Keep: existing `.gitignore` (already ignores `ECOSONIC FILES/`, `node_modules/`, `.next/`, `src/manifest.json`)

**Interfaces:**
- Consumes: nothing (first task).
- Produces: a runnable Next dev server; `npm test` runs Vitest; `config/ecosonic.config.json` on disk; shadcn components available under `src/components/ui/`.

- [ ] **Step 1: Scaffold Next.js into the existing repo (via a temp dir to avoid the non-empty-folder error)**

```powershell
npx create-next-app@latest _scaffold --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --turbopack
# Move generated files up, keeping OUR .git and .gitignore:
Get-ChildItem -Path _scaffold -Force | Where-Object { $_.Name -notin '.git','.gitignore' } | Move-Item -Destination . -Force
Remove-Item _scaffold -Recurse -Force
```

- [ ] **Step 2: Verify the dev server runs**

Run: `npm run dev`
Expected: server starts on `http://localhost:3000`; the default Next page renders. Stop it (Ctrl+C).

- [ ] **Step 3: Install test + runtime deps**

```powershell
npm install zod zustand
npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event tsx
```

- [ ] **Step 4: Add shadcn and the components we'll need**

```powershell
npx shadcn@latest init -d
npx shadcn@latest add button slider toggle card tooltip separator scroll-area
```
Expected: files appear under `src/components/ui/` and `src/lib/utils.ts`.

- [ ] **Step 5: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
  },
});
```

- [ ] **Step 6: Create `vitest.setup.ts`**

```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 7: Add npm scripts** — in `package.json` `"scripts"`, add:

```json
"test": "vitest run",
"test:watch": "vitest",
"build:manifest": "tsx scripts/build-manifest.ts"
```

- [ ] **Step 8: Create `config/ecosonic.config.json`**

```json
{
  "audio": {
    "hybridThresholdBytes": 8388608,
    "volume": {
      "minDb": -60, "maxDb": 0,
      "defaultTrackDb": -6, "defaultMasterDb": 0,
      "muteRampMs": 80, "changeRampMs": 200
    },
    "tuning": {
      "baseHz": 440, "defaultHz": 440,
      "presetsHz": [432.0, 432.69, 440.0, 444.0]
    }
  },
  "selection": {
    "ISO":     { "min": 1, "max": 1 },
    "PLANET":  { "min": 2, "max": 2 },
    "NOISE":   { "min": 1, "max": 1 },
    "ELEMENT": { "min": 2, "max": 3 },
    "BASS":    { "min": 1, "max": 1 },
    "PAD":     { "min": 1, "max": 1 },
    "MELODY":  { "min": 1, "max": 1 },
    "FX":      { "min": 1, "max": 2 }
  },
  "motion": { "durFastMs": 200, "durMs": 400, "durSlowMs": 800 }
}
```

- [ ] **Step 9: Add a smoke test so `npm test` is green** — create `src/lib/smoke.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
describe('smoke', () => {
  it('runs the test runner', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 10: Run the test suite**

Run: `npm test`
Expected: PASS (1 test).

- [ ] **Step 11: Commit**

```powershell
git add -A
git commit -m "chore: scaffold Next.js app, shadcn, vitest, and ecosonic config"
```

---

### Task 2: Shared types + validated config loader

**Files:**
- Create: `src/types.ts`
- Create: `src/config.ts`
- Test: `src/config.test.ts`

**Interfaces:**
- Consumes: `config/ecosonic.config.json` (Task 1).
- Produces:
  - `src/types.ts`: `type ElementName`, `const ELEMENTS: ElementName[]`, `type Category`, `interface SampleEntry`, `interface ElementManifest`, `type Manifest`, `interface Track`, `interface Project`.
  - `src/config.ts`: `const ConfigSchema` (zod), `type EcosonicConfig`, `const config: EcosonicConfig`.

- [ ] **Step 1: Create `src/types.ts`** (all shared types in one place)

```ts
export type ElementName = 'EARTH' | 'WATER' | 'AIR' | 'FIRE' | 'ETHER';
export const ELEMENTS: ElementName[] = ['EARTH', 'WATER', 'AIR', 'FIRE', 'ETHER'];

export type Category = 'ISO' | 'PLANET' | 'NOISE' | 'ELEMENT' | 'BASS' | 'PAD' | 'MELODY' | 'FX';

export interface SampleEntry {
  name: string;   // filename without extension
  path: string;   // relative to ECOSONIC FILES, using '/'
  bytes: number;
  ext: string;    // e.g. ".wav"
}

export interface ElementManifest {
  ISO: SampleEntry[];
  PLANET: SampleEntry[];
  NOISE: SampleEntry[];
  ELEMENT: SampleEntry[];
  BASS: SampleEntry[];
  PAD: SampleEntry[];
  MELODY: SampleEntry[];
  FX: SampleEntry[];
  ARP: SampleEntry[];          // recorded for future, NOT used by builder
  ELEMENT_SUB: SampleEntry[];  // recorded for future, NOT used by builder
}

export type Manifest = Record<ElementName, ElementManifest>;

export interface Track {
  id: string;
  category: Category;
  label: string;                         // e.g. "PLANETS A"
  sample: { name: string; path: string; bytes: number };
  volumeDb: number;                      // ceiling level
  muted: boolean;
  playing: boolean;
  locked: boolean;
}

export interface Project {
  element: ElementName | null;
  tracks: Track[];
  masterVolumeDb: number;
  tuningHz: number;
}
```

- [ ] **Step 2: Write the failing test** — `src/config.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { ConfigSchema, config } from '@/config';

const valid = {
  audio: {
    hybridThresholdBytes: 8388608,
    volume: { minDb: -60, maxDb: 0, defaultTrackDb: -6, defaultMasterDb: 0, muteRampMs: 80, changeRampMs: 200 },
    tuning: { baseHz: 440, defaultHz: 440, presetsHz: [432, 440] },
  },
  selection: {
    ISO: { min: 1, max: 1 }, PLANET: { min: 2, max: 2 }, NOISE: { min: 1, max: 1 },
    ELEMENT: { min: 2, max: 3 }, BASS: { min: 1, max: 1 }, PAD: { min: 1, max: 1 },
    MELODY: { min: 1, max: 1 }, FX: { min: 1, max: 2 },
  },
  motion: { durFastMs: 200, durMs: 400, durSlowMs: 800 },
};

describe('config', () => {
  it('parses a valid config', () => {
    expect(ConfigSchema.parse(valid)).toEqual(valid);
  });
  it('rejects a config missing a required field', () => {
    const bad = { ...valid, audio: { ...valid.audio, volume: { ...valid.audio.volume, minDb: undefined } } };
    expect(ConfigSchema.safeParse(bad).success).toBe(false);
  });
  it('loads the real config file', () => {
    expect(config.selection.ELEMENT.max).toBe(3);
  });
});
```

- [ ] **Step 3: Run it to verify failure**

Run: `npx vitest run src/config.test.ts`
Expected: FAIL — cannot import `@/config` (module not found).

- [ ] **Step 4: Create `src/config.ts`**

```ts
import { z } from 'zod';
import raw from '../config/ecosonic.config.json';

const Count = z.object({
  min: z.number().int().min(0),
  max: z.number().int().min(0),
});

export const ConfigSchema = z.object({
  audio: z.object({
    hybridThresholdBytes: z.number().int().positive(),
    volume: z.object({
      minDb: z.number(),
      maxDb: z.number(),
      defaultTrackDb: z.number(),
      defaultMasterDb: z.number(),
      muteRampMs: z.number().nonnegative(),
      changeRampMs: z.number().nonnegative(),
    }),
    tuning: z.object({
      baseHz: z.number().positive(),
      defaultHz: z.number().positive(),
      presetsHz: z.array(z.number().positive()),
    }),
  }),
  selection: z.object({
    ISO: Count, PLANET: Count, NOISE: Count, ELEMENT: Count,
    BASS: Count, PAD: Count, MELODY: Count, FX: Count,
  }),
  motion: z.object({
    durFastMs: z.number(),
    durMs: z.number(),
    durSlowMs: z.number(),
  }),
});

export type EcosonicConfig = z.infer<typeof ConfigSchema>;

// Validates at import time — a malformed config throws loudly at startup.
export const config: EcosonicConfig = ConfigSchema.parse(raw);
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/config.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```powershell
git add src/types.ts src/config.ts src/config.test.ts
git commit -m "feat: shared types and zod-validated config loader"
```

---

### Task 3: Manifest builder (pure fn) + scan script

**Files:**
- Create: `src/session/manifestBuild.ts`
- Test: `src/session/manifestBuild.test.ts`
- Create: `scripts/build-manifest.ts`

**Interfaces:**
- Consumes: `src/types.ts` (`Manifest`, `ElementManifest`, `SampleEntry`, `ELEMENTS`, `ElementName`).
- Produces:
  - `interface RawFile { path: string; bytes: number }`
  - `function buildManifest(files: RawFile[]): Manifest`
  - `scripts/build-manifest.ts` writes `src/manifest.json`.

- [ ] **Step 1: Write the failing test** — `src/session/manifestBuild.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildManifest } from '@/session/manifestBuild';

const files = [
  { path: 'WATER/ISO/5hz.wav', bytes: 100 },
  { path: 'WATER/PLANET/EARTH.wav', bytes: 200 },
  { path: 'WATER/PLANET/VENUS.wav', bytes: 200 },
  { path: 'WATER/NOISE/NOISE WATER.wav', bytes: 300 },
  { path: 'WATER/ELEMENT/OCEAN.wav', bytes: 400 },
  { path: 'WATER/ELEMENT/SUB/WHALES.wav', bytes: 500 },        // SUB → ELEMENT_SUB
  { path: 'WATER/SOUND/BASS/BASS.wav', bytes: 600 },
  { path: 'WATER/SOUND/ARP/ARP.wav', bytes: 700 },             // ARP → recorded only
  { path: 'EARTH/ELEMENT/NATURE.mp3', bytes: 800 },            // mp3 allowed
  { path: 'WATER/.DS_Store', bytes: 1 },                       // cruft
  { path: 'WATER/ISO/._5hz.wav', bytes: 1 },                   // AppleDouble cruft
  { path: 'WATER/SOUND/BASS/notes.txt', bytes: 1 },            // non-audio
];

describe('buildManifest', () => {
  const m = buildManifest(files);

  it('classifies primary categories', () => {
    expect(m.WATER.ISO.map((s) => s.name)).toEqual(['5hz']);
    expect(m.WATER.PLANET).toHaveLength(2);
    expect(m.WATER.NOISE[0].name).toBe('NOISE WATER');
    expect(m.WATER.ELEMENT.map((s) => s.name)).toEqual(['OCEAN']);
    expect(m.WATER.BASS[0].name).toBe('BASS');
  });

  it('records ARP and ELEMENT/SUB separately (not in primary ELEMENT)', () => {
    expect(m.WATER.ELEMENT_SUB.map((s) => s.name)).toEqual(['WHALES']);
    expect(m.WATER.ARP.map((s) => s.name)).toEqual(['ARP']);
  });

  it('keeps mp3, drops cruft and non-audio', () => {
    expect(m.EARTH.ELEMENT.map((s) => s.name)).toEqual(['NATURE']);
    expect(m.WATER.ISO).toHaveLength(1); // ._5hz.wav excluded
    expect(m.WATER.BASS).toHaveLength(1); // notes.txt excluded
  });
});
```

- [ ] **Step 2: Run it to verify failure**

Run: `npx vitest run src/session/manifestBuild.test.ts`
Expected: FAIL — `@/session/manifestBuild` not found.

- [ ] **Step 3: Implement `src/session/manifestBuild.ts`**

```ts
import type { ElementManifest, ElementName, Manifest, SampleEntry } from '@/types';
import { ELEMENTS } from '@/types';

export interface RawFile {
  path: string; // relative to ECOSONIC FILES, '/'-separated
  bytes: number;
}

const AUDIO_EXTS = new Set(['.wav', '.mp3']);
const SOUND_CATEGORIES = new Set(['BASS', 'PAD', 'MELODY', 'FX', 'ARP']);

function emptyElement(): ElementManifest {
  return {
    ISO: [], PLANET: [], NOISE: [], ELEMENT: [],
    BASS: [], PAD: [], MELODY: [], FX: [], ARP: [], ELEMENT_SUB: [],
  };
}

function isCruft(part: string): boolean {
  return part.startsWith('.') || part.startsWith('._');
}

function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i < 0 ? '' : name.slice(i).toLowerCase();
}

function categoryOf(parts: string[]): keyof ElementManifest | null {
  const l1 = parts[1]?.toUpperCase();
  if (l1 === 'ISO' || l1 === 'PLANET' || l1 === 'NOISE') return l1;
  if (l1 === 'ELEMENT') return parts[2]?.toUpperCase() === 'SUB' ? 'ELEMENT_SUB' : 'ELEMENT';
  if (l1 === 'SOUND') {
    const c = parts[2]?.toUpperCase();
    if (c && SOUND_CATEGORIES.has(c)) return c as keyof ElementManifest;
  }
  return null;
}

export function buildManifest(files: RawFile[]): Manifest {
  const manifest = Object.fromEntries(
    ELEMENTS.map((e) => [e, emptyElement()]),
  ) as Manifest;

  for (const f of files) {
    const parts = f.path.split('/').filter(Boolean);
    if (parts.length < 3) continue;
    if (parts.some(isCruft)) continue;

    const element = parts[0].toUpperCase() as ElementName;
    if (!ELEMENTS.includes(element)) continue;

    const fileName = parts[parts.length - 1];
    const ext = extOf(fileName);
    if (!AUDIO_EXTS.has(ext)) continue;

    const category = categoryOf(parts);
    if (!category) continue;

    const entry: SampleEntry = {
      name: fileName.slice(0, fileName.length - ext.length),
      path: f.path,
      bytes: f.bytes,
      ext,
    };
    manifest[element][category].push(entry);
  }

  return manifest;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/session/manifestBuild.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Create the scan script `scripts/build-manifest.ts`**

```ts
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { buildManifest, type RawFile } from '../src/session/manifestBuild';

const ROOT = path.join(process.cwd(), 'ECOSONIC FILES');
const OUT = path.join(process.cwd(), 'src', 'manifest.json');

async function walk(dir: string, rel = ''): Promise<RawFile[]> {
  const out: RawFile[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const abs = path.join(dir, e.name);
    const relPath = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) {
      out.push(...(await walk(abs, relPath)));
    } else if (e.isFile()) {
      const { size } = await fs.stat(abs);
      out.push({ path: relPath, bytes: size });
    }
  }
  return out;
}

async function main() {
  const files = await walk(ROOT);
  const manifest = buildManifest(files);
  await fs.writeFile(OUT, JSON.stringify(manifest, null, 2));
  const total = Object.values(manifest)
    .flatMap((el) => Object.values(el))
    .reduce((n, arr) => n + arr.length, 0);
  console.log(`Wrote ${OUT} with ${total} samples across ${Object.keys(manifest).length} elements.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 6: Generate the real manifest**

Run: `npm run build:manifest`
Expected: console prints a sample count (≈ 80–97) and `src/manifest.json` exists (git-ignored).

- [ ] **Step 7: Commit**

```powershell
git add src/session/manifestBuild.ts src/session/manifestBuild.test.ts scripts/build-manifest.ts
git commit -m "feat: manifest builder and library scan script"
```

---

### Task 4: Sample URL resolver + streaming route handler

**Files:**
- Create: `src/samples.ts`
- Test: `src/samples.test.ts`
- Create: `src/app/api/samples/[...path]/route.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `function resolveSampleUrl(relPath: string): string` → `/api/samples/<encoded>`
  - A `GET` route handler that streams `ECOSONIC FILES/<path>` with `Range` support.

- [ ] **Step 1: Write the failing test** — `src/samples.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { resolveSampleUrl } from '@/samples';

describe('resolveSampleUrl', () => {
  it('encodes each path segment but keeps slashes', () => {
    expect(resolveSampleUrl('WATER/NOISE/NOISE WATER.wav'))
      .toBe('/api/samples/WATER/NOISE/NOISE%20WATER.wav');
  });
  it('encodes ampersands', () => {
    expect(resolveSampleUrl('EARTH/ELEMENT/SUB/FROG&BIRDS.wav'))
      .toBe('/api/samples/EARTH/ELEMENT/SUB/FROG%26BIRDS.wav');
  });
});
```

- [ ] **Step 2: Run it to verify failure**

Run: `npx vitest run src/samples.test.ts`
Expected: FAIL — `@/samples` not found.

- [ ] **Step 3: Implement `src/samples.ts`**

```ts
// The single place that turns a manifest path into a playable URL.
// Swap this for a file:// scheme when wrapping in Electron later.
export function resolveSampleUrl(relPath: string): string {
  const encoded = relPath.split('/').map(encodeURIComponent).join('/');
  return `/api/samples/${encoded}`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/samples.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Implement the route handler** — `src/app/api/samples/[...path]/route.ts`:

```ts
import { createReadStream, promises as fs } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import type { NextRequest } from 'next/server';

export const runtime = 'nodejs';

const ROOT = path.join(process.cwd(), 'ECOSONIC FILES');

const MIME: Record<string, string> = {
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
};

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  const { path: segments } = await ctx.params;
  const rel = segments.map(decodeURIComponent).join(path.sep);
  const filePath = path.join(ROOT, rel);

  // Prevent path traversal outside ROOT.
  if (!filePath.startsWith(ROOT)) {
    return new Response('Forbidden', { status: 403 });
  }

  let size: number;
  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) return new Response('Not found', { status: 404 });
    size = stat.size;
  } catch {
    return new Response('Not found', { status: 404 });
  }

  const type = MIME[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
  const range = req.headers.get('range');

  if (range) {
    const match = /bytes=(\d*)-(\d*)/.exec(range);
    const start = match && match[1] ? parseInt(match[1], 10) : 0;
    const end = match && match[2] ? parseInt(match[2], 10) : size - 1;
    if (start >= size || end >= size || start > end) {
      return new Response('Range Not Satisfiable', {
        status: 416,
        headers: { 'Content-Range': `bytes */${size}` },
      });
    }
    const nodeStream = createReadStream(filePath, { start, end });
    return new Response(Readable.toWeb(nodeStream) as ReadableStream, {
      status: 206,
      headers: {
        'Content-Type': type,
        'Content-Length': String(end - start + 1),
        'Content-Range': `bytes ${start}-${end}/${size}`,
        'Accept-Ranges': 'bytes',
      },
    });
  }

  const nodeStream = createReadStream(filePath);
  return new Response(Readable.toWeb(nodeStream) as ReadableStream, {
    status: 200,
    headers: {
      'Content-Type': type,
      'Content-Length': String(size),
      'Accept-Ranges': 'bytes',
    },
  });
}
```

- [ ] **Step 6: Manually verify range streaming**

Run (in one terminal): `npm run dev`
Run (in another): `curl.exe -s -D - -o NUL -H "Range: bytes=0-1023" "http://localhost:3000/api/samples/EARTH/ISO/1hz.wav"`
Expected: status line `HTTP/1.1 206 Partial Content`, headers include `Content-Range: bytes 0-1023/<size>` and `Accept-Ranges: bytes`. (Use `curl.exe`, not PowerShell's `curl` alias.)

- [ ] **Step 7: Commit**

```powershell
git add src/samples.ts src/samples.test.ts "src/app/api/samples/[...path]/route.ts"
git commit -m "feat: sample URL resolver and range-streaming route handler"
```

---

### Task 5: DSP utilities (dB ↔ gain)

**Files:**
- Create: `src/audio/dsp.ts`
- Test: `src/audio/dsp.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `function dbToGain(db: number, minDb: number): number`
  - `function clampDb(db: number, minDb: number, maxDb: number): number`

- [ ] **Step 1: Write the failing test** — `src/audio/dsp.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { dbToGain, clampDb } from '@/audio/dsp';

describe('dbToGain', () => {
  it('0 dB is unity gain', () => {
    expect(dbToGain(0, -60)).toBeCloseTo(1, 5);
  });
  it('-6 dB is ~0.501', () => {
    expect(dbToGain(-6, -60)).toBeCloseTo(0.50119, 4);
  });
  it('at or below the floor is silence', () => {
    expect(dbToGain(-60, -60)).toBe(0);
    expect(dbToGain(-90, -60)).toBe(0);
  });
});

describe('clampDb', () => {
  it('clamps to range', () => {
    expect(clampDb(5, -60, 0)).toBe(0);
    expect(clampDb(-100, -60, 0)).toBe(-60);
    expect(clampDb(-12, -60, 0)).toBe(-12);
  });
});
```

- [ ] **Step 2: Run it to verify failure**

Run: `npx vitest run src/audio/dsp.test.ts`
Expected: FAIL — `@/audio/dsp` not found.

- [ ] **Step 3: Implement `src/audio/dsp.ts`**

```ts
/** Convert decibels to a linear gain multiplier. At or below `minDb` returns 0 (silence). */
export function dbToGain(db: number, minDb: number): number {
  return db <= minDb ? 0 : Math.pow(10, db / 20);
}

/** Clamp a dB value into the [minDb, maxDb] range. */
export function clampDb(db: number, minDb: number, maxDb: number): number {
  return Math.min(maxDb, Math.max(minDb, db));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/audio/dsp.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS (all tests from Tasks 1–5).

- [ ] **Step 6: Commit**

```powershell
git add src/audio/dsp.ts src/audio/dsp.test.ts
git commit -m "feat: dB-to-gain and clamp DSP utilities"
```

---

## Part 1 self-review

- **Spec coverage (foundation slice):** scaffold ✓ (T1), config-driven constants + zod ✓ (T2), manifest with ARP/SUB recorded-but-excluded + cruft filtering + mp3 ✓ (T3), no-copy range streaming + URL resolver/Electron swap point ✓ (T4), dB→gain ceiling math ✓ (T5).
- **Placeholders:** none — every step has real code/commands and expected output.
- **Type consistency:** `Manifest`/`ElementManifest`/`SampleEntry`/`Track`/`Project` defined once in `src/types.ts`; `buildManifest` returns `Manifest`; `config`/`ConfigSchema` names match across `config.ts` and its test.
- **Deferred to later parts:** `Track`/`Project` are defined here but first *used* in Part 2 (selection/store); `dbToGain` first *used* in Part 3 (engine). Defined-before-used on purpose.

# ECOSONIC Layer One — Part 5: Visualizer & Polish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the organic p5.js visualization driven by the engine's analyser, then a meditation-aesthetic polish pass, and confirm a clean production build.

**Architecture:** A pure `normalizeWaveform` maps analyser bytes to a [-1,1] curve (TDD). `Visualizer` (p5.js, dynamically imported, client-only) draws that curve tinted to the active element's accent, reading live data from `engine.getAnalyser()`. Polish tightens glow/motion/glass using existing tokens.

**Tech Stack:** p5.js, Web Audio `AnalyserNode`, Tailwind v4 tokens, Vitest (pure helper only).

**Part:** 5 of 5. Depends on Parts 1–4. Final part.

## Global Constraints

- All prior constraints apply. Appearance via tokens; behavior via store/config.
- **p5 is client-only and dynamically imported** (`await import('p5')` inside `useEffect`) to avoid SSR errors.
- **The analyser is passive** — the visualizer only reads it; it never alters audio.
- **Accent color for canvas** is read from the themed subtree (so `[data-element]` overrides apply) and resolved to an RGB string (p5 cannot parse `oklch()`).

---

### Task 15: Organic visualizer (p5.js)

**Files:**
- Create: `src/audio/waveform.ts`
- Test: `src/audio/waveform.test.ts`
- Create: `src/components/Visualizer.tsx`
- Modify: `src/components/TransportBar.tsx`
- Modify: `src/components/BuilderScreen.tsx`

**Interfaces:**
- Consumes: `engine.getAnalyser()` (Part 3), `@/audio/waveform` (`normalizeWaveform`).
- Produces: `function normalizeWaveform(bytes: Uint8Array): number[]`; `<Visualizer getAnalyser={() => AnalyserNode | null} />`; `TransportBar` gains an optional `getAnalyser` prop and renders the visualizer when provided.

- [ ] **Step 1: Install p5**

```powershell
npm install p5
npm install -D @types/p5
```

- [ ] **Step 2: Write the failing test** — `src/audio/waveform.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { normalizeWaveform } from '@/audio/waveform';

describe('normalizeWaveform', () => {
  it('maps 0..255 bytes to -1..1 around the 128 midpoint', () => {
    const out = normalizeWaveform(new Uint8Array([128, 255, 0]));
    expect(out[0]).toBeCloseTo(0, 5);
    expect(out[1]).toBeCloseTo(0.9921875, 5);
    expect(out[2]).toBeCloseTo(-1, 5);
  });
  it('preserves length', () => {
    expect(normalizeWaveform(new Uint8Array(2048))).toHaveLength(2048);
  });
});
```

- [ ] **Step 3: Run it to verify failure**

Run: `npx vitest run src/audio/waveform.test.ts`
Expected: FAIL — `@/audio/waveform` not found.

- [ ] **Step 4: Implement `src/audio/waveform.ts`**

```ts
/** Map time-domain bytes (0..255, silence at 128) to a [-1, 1] curve. */
export function normalizeWaveform(bytes: Uint8Array): number[] {
  const out = new Array<number>(bytes.length);
  for (let i = 0; i < bytes.length; i++) out[i] = (bytes[i] - 128) / 128;
  return out;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/audio/waveform.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Implement `src/components/Visualizer.tsx`**

```tsx
'use client';
import { useEffect, useRef } from 'react';
import { normalizeWaveform } from '@/audio/waveform';

function readAccentRgb(container: HTMLElement): string {
  const probe = document.createElement('span');
  probe.style.color = 'var(--accent)';
  container.appendChild(probe);
  const rgb = getComputedStyle(probe).color;
  probe.remove();
  return rgb || 'rgb(150,150,150)';
}

export function Visualizer({ getAnalyser }: { getAnalyser: () => AnalyserNode | null }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let instance: { remove: () => void } | undefined;
    let cancelled = false;

    (async () => {
      const P5 = (await import('p5')).default;
      const container = containerRef.current;
      if (cancelled || !container) return;

      const sketch = (p: import('p5')) => {
        let data = new Uint8Array(2048);
        p.setup = () => {
          p.createCanvas(container.clientWidth, 56).parent(container);
          p.noFill();
        };
        p.windowResized = () => p.resizeCanvas(container.clientWidth, 56);
        p.draw = () => {
          p.clear();
          const accent = readAccentRgb(container);
          p.stroke(accent);
          p.strokeWeight(2);
          const analyser = getAnalyser();
          if (!analyser) {
            p.line(0, p.height / 2, p.width, p.height / 2);
            return;
          }
          if (data.length !== analyser.fftSize) data = new Uint8Array(analyser.fftSize);
          analyser.getByteTimeDomainData(data);
          const pts = normalizeWaveform(data);
          p.beginShape();
          pts.forEach((v, i) => {
            const x = (i / (pts.length - 1)) * p.width;
            const y = p.height / 2 + v * (p.height / 2) * 0.9;
            p.curveVertex(x, y);
          });
          p.endShape();
        };
      };

      instance = new P5(sketch);
    })();

    return () => { cancelled = true; instance?.remove(); };
  }, [getAnalyser]);

  return <div ref={containerRef} className="h-[56px] min-w-[120px] flex-1" aria-hidden="true" />;
}
```

- [ ] **Step 7: Add the visualizer slot to `TransportBar`** — modify `src/components/TransportBar.tsx`:

Change the component signature and add the visualizer between Master and Regenerate.

```tsx
// add import at top:
import { Visualizer } from '@/components/Visualizer';

// change signature:
export function TransportBar({ getAnalyser }: { getAnalyser?: () => AnalyserNode | null }) {
```

Then, just before the Regenerate button, add:

```tsx
      {getAnalyser && <Visualizer getAnalyser={getAnalyser} />}
```

- [ ] **Step 8: Pass the analyser from `BuilderScreen`** — modify `src/components/BuilderScreen.tsx`:

```tsx
// capture the engine:
const engine = useAudioEngine();

// render the transport with the analyser getter:
<TransportBar getAnalyser={() => engine.getAnalyser()} />
```

- [ ] **Step 9: Verify tests still pass and type-check**

Run: `npm test`
Expected: PASS (TransportBar tests still pass — they render without `getAnalyser`, so no p5).
Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 10: Manually verify the visualizer**

Run: `npm run dev`, pick an element, press **Play all**.
Expected: a flowing line in the transport bar moves with the sound and is tinted to the active element's accent; switching elements re-tints it; it sits flat (centered line) when paused.

- [ ] **Step 11: Commit**

```powershell
git add src/audio/waveform.ts src/audio/waveform.test.ts src/components/Visualizer.tsx src/components/TransportBar.tsx src/components/BuilderScreen.tsx
git commit -m "feat: p5.js organic visualizer driven by the analyser"
```

---

### Task 16: Meditation-aesthetic polish + production build

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/components/TrackLane.tsx`
- Modify: `src/components/TransportBar.tsx`
- Modify: `src/components/BuilderScreen.tsx`

**Interfaces:**
- Consumes: existing tokens.
- Produces: glow/motion/glass refinements; a confirmed clean `npm run build`.

- [ ] **Step 1: Add motion + glow helpers to `src/app/globals.css`** (append at the end)

```css
:root {
  --ease-calm: cubic-bezier(0.22, 1, 0.36, 1);
  --dur: 400ms;
}

.transition-calm { transition: all var(--dur) var(--ease-calm); }
.glow-accent { box-shadow: 0 0 40px -8px var(--accent); }
.text-glow { text-shadow: 0 0 24px var(--accent); }
```

- [ ] **Step 2: Glow the active play button while playing** — in `src/components/TransportBar.tsx`, add `glow-accent` to the Play button's className when `globalPlaying` is true:

```tsx
className={`rounded-full transition-calm ${globalPlaying ? 'glow-accent' : ''}`}
```

- [ ] **Step 3: Glow the element title** — in `src/components/BuilderScreen.tsx`, add `text-glow` to the `<h1>`:

```tsx
<h1 className="text-lg text-glow" style={{ color: 'var(--accent)' }}>{element}</h1>
```

- [ ] **Step 4: Soft hover lift on lanes** — in `src/components/TrackLane.tsx`, add `transition-calm hover:bg-card/90` to the lane's outer `div` className.

- [ ] **Step 5: Manually verify polish**

Run: `npm run dev`.
Expected: the play button softly glows when playing; the element title has a gentle halo; lanes respond calmly to hover; overall feel is soft and meditative.

- [ ] **Step 6: Confirm a clean production build**

Run: `npm run build`
Expected: build completes with no type or lint errors.
Run: `npm test`
Expected: PASS (full suite).

- [ ] **Step 7: Commit**

```powershell
git add src/app/globals.css src/components/TrackLane.tsx src/components/TransportBar.tsx src/components/BuilderScreen.tsx
git commit -m "feat: meditation-aesthetic polish and production build check"
```

---

## Part 5 self-review

- **Spec coverage:** live organic visualization via p5 + passive analyser ✓ (T15); element-tinted ✓ (T15 `readAccentRgb`); meditation aesthetic (glow/motion/glass) ✓ (T16); production build green ✓ (T16).
- **Placeholders:** none — full code; visualizer is browser-verified (p5 needs a real canvas), with a TDD'd pure helper (`normalizeWaveform`).
- **Type consistency:** `getAnalyser` prop type `() => AnalyserNode | null` matches `engine.getAnalyser()` from Part 3; `normalizeWaveform` signature matches its use in `Visualizer`.
- **Whole-plan check:** every Build-1 spec item (Parts 1–5) maps to a task; deferred items (effects UI, tuning UI, real waveforms, save/load, iPad/Electron) are explicitly out of scope per the spec.

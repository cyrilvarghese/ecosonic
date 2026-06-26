# ECOSONIC Layer One — Part 4: UI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The visible app — design tokens, element chooser, channel-strip track lanes, transport bar — wired to the store and audio engine. By the end you pick an element and **hear the soundscape**.

**Architecture:** Aether design tokens in `globals.css` with `[data-element]` accent swapping. Presentational components bound to the Zustand store via `useSession`. Only `BuilderScreen` mounts `useAudioEngine()`; every control flows store action → sync controller → engine. Component tests cover the store-bound controls (no audio); `BuilderScreen` is verified in the browser.

**Tech Stack:** Next.js (App Router, client components), Tailwind v4, shadcn/ui, lucide-react, Vitest + Testing Library.

**Part:** 4 of 5. Depends on Parts 1–3. Next: Part 5 (Visualizer & Polish).

## Global Constraints

- All prior constraints apply. Appearance = CSS tokens; behavior = store/config.
- **Element theming via one swappable accent:** components use `--accent`/`--ring`; `[data-element="<el>"]` swaps it. No per-element component variants.
- **Volume sliders** use `config.audio.volume.minDb`/`maxDb` for range; dB is displayed, store clamps.
- **Components are presentational + store-bound.** Only `BuilderScreen` touches the engine (via `useAudioEngine`). Never instantiate `AudioContext` in unit tests (jsdom has none) — that's why no test mounts `BuilderScreen`.
- **Accessibility:** every icon button has an `aria-label` that includes the track label; keep `--foreground` dark for contrast.

---

### Task 10: Aether design tokens + element theming

**Files:**
- Modify (overwrite): `src/app/globals.css`
- Modify: `src/app/layout.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: CSS custom properties (semantic + element accents) and Tailwind `@theme` mappings so utilities like `bg-background`, `text-foreground`, `border-border`, `ring-ring`, `bg-accent` resolve; `[data-element="<el>"]` accent swap; Inter font on `<body>`.

- [ ] **Step 1: Overwrite `src/app/globals.css`**

```css
@import "tailwindcss";

:root {
  /* Neutrals (cool-tinted) */
  --n-50: oklch(0.98 0.005 285);
  --n-100: oklch(0.96 0.008 285);
  --n-200: oklch(0.92 0.01 285);
  --n-500: oklch(0.58 0.02 285);
  --n-800: oklch(0.28 0.03 285);

  /* Element accents */
  --c-earth: oklch(0.80 0.09 140);
  --c-water: oklch(0.82 0.08 225);
  --c-air: oklch(0.89 0.04 255);
  --c-fire: oklch(0.80 0.11 45);
  --c-ether: oklch(0.78 0.10 305);

  /* Semantic */
  --background: var(--n-50);
  --foreground: var(--n-800);
  --card: oklch(1 0 0 / 0.7);
  --card-foreground: var(--n-800);
  --popover: oklch(1 0 0 / 0.9);
  --popover-foreground: var(--n-800);
  --primary: var(--n-800);
  --primary-foreground: var(--n-50);
  --secondary: var(--n-100);
  --secondary-foreground: var(--n-800);
  --muted: var(--n-100);
  --muted-foreground: var(--n-500);
  --accent: var(--c-ether);
  --accent-foreground: var(--n-800);
  --border: var(--n-200);
  --input: var(--n-200);
  --ring: var(--accent);
  --radius: 1rem;

  /* Effects */
  --glass-blur: 16px;
  --hero-gradient: linear-gradient(135deg,
    oklch(0.90 0.05 300), oklch(0.92 0.04 240), oklch(0.92 0.04 20), oklch(0.93 0.04 160));
}

[data-element="earth"] { --accent: var(--c-earth); --ring: var(--c-earth); }
[data-element="water"] { --accent: var(--c-water); --ring: var(--c-water); }
[data-element="air"]   { --accent: var(--c-air);   --ring: var(--c-air); }
[data-element="fire"]  { --accent: var(--c-fire);  --ring: var(--c-fire); }
[data-element="ether"] { --accent: var(--c-ether); --ring: var(--c-ether); }

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --radius-lg: var(--radius);
  --radius-md: calc(var(--radius) - 4px);
  --radius-sm: calc(var(--radius) - 8px);
}

body {
  background: var(--background);
  color: var(--foreground);
}

.label {
  text-transform: uppercase;
  letter-spacing: 0.2em;
  color: var(--muted-foreground);
  font-size: 0.72rem;
}
```

- [ ] **Step 2: Set the Inter font in `src/app/layout.tsx`** (replace the generated file)

```tsx
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });

export const metadata: Metadata = {
  title: 'ECOSONIC — Layer One',
  description: 'Generative meditation sound ecosystem builder',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.variable} font-sans antialiased`}>{children}</body>
    </html>
  );
}
```

- [ ] **Step 3: Verify it builds and renders**

Run: `npm run dev`, open `http://localhost:3000`.
Expected: page compiles with no CSS errors (still the default page body for now). Stop the server.

- [ ] **Step 4: Commit**

```powershell
git add src/app/globals.css src/app/layout.tsx
git commit -m "feat: Aether design tokens and element accent theming"
```

---

### Task 11: ElementGlyph + ElementChooser

**Files:**
- Create: `src/components/ElementGlyph.tsx`
- Create: `src/components/ElementChooser.tsx`
- Test: `src/components/ElementChooser.test.tsx`

**Interfaces:**
- Consumes: `@/types` (`ElementName`, `ELEMENTS`), `@/session/appStore` (`useSession`).
- Produces: `<ElementGlyph element={ElementName} />` (SVG, `currentColor` stroke); `<ElementChooser />` (5 glyph buttons; click → `selectElement`).

- [ ] **Step 1: Implement `src/components/ElementGlyph.tsx`**

```tsx
import type { ElementName } from '@/types';

const PATHS: Record<ElementName, React.ReactNode> = {
  FIRE: <polygon points="24,6 42,40 6,40" />,
  WATER: <polygon points="6,8 42,8 24,42" />,
  AIR: <><polygon points="24,6 42,40 6,40" /><line x1="13" y1="30" x2="35" y2="30" /></>,
  EARTH: <><polygon points="6,8 42,8 24,42" /><line x1="13" y1="20" x2="35" y2="20" /></>,
  ETHER: <><polygon points="24,5 41,38 7,38" /><polygon points="24,43 7,10 41,10" /><circle cx="24" cy="24" r="2.5" /></>,
};

export function ElementGlyph({ element, size = 48 }: { element: ElementName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[element]}
    </svg>
  );
}
```

- [ ] **Step 2: Write the failing test** — `src/components/ElementChooser.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ElementChooser } from '@/components/ElementChooser';
import { sessionStore } from '@/session/appStore';

describe('ElementChooser', () => {
  beforeEach(() => { sessionStore.getState().backToChooser(); });

  it('renders all five elements', () => {
    render(<ElementChooser />);
    for (const name of ['Earth', 'Water', 'Air', 'Fire', 'Ether']) {
      expect(screen.getByRole('button', { name: new RegExp(name, 'i') })).toBeInTheDocument();
    }
  });

  it('selecting an element builds its tracks in the store', async () => {
    render(<ElementChooser />);
    await userEvent.click(screen.getByRole('button', { name: /water/i }));
    expect(sessionStore.getState().project.element).toBe('WATER');
    expect(sessionStore.getState().project.tracks.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 3: Run it to verify failure**

Run: `npx vitest run src/components/ElementChooser.test.tsx`
Expected: FAIL — `@/components/ElementChooser` not found.

- [ ] **Step 4: Implement `src/components/ElementChooser.tsx`**

```tsx
'use client';
import { ELEMENTS, type ElementName } from '@/types';
import { useSession } from '@/session/appStore';
import { ElementGlyph } from '@/components/ElementGlyph';

// Quincunx placement (CSS grid areas): Air top, Water left, Ether center, Fire right, Earth bottom.
const AREA: Record<ElementName, string> = {
  AIR: 'air', WATER: 'water', ETHER: 'ether', FIRE: 'fire', EARTH: 'earth',
};

export function ElementChooser() {
  const selectElement = useSession((s) => s.selectElement);

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center gap-10 p-8"
      style={{ background: 'var(--hero-gradient)' }}
    >
      <p className="label">Layer One — Choose an element to begin</p>
      <div
        className="grid gap-6"
        style={{
          gridTemplateAreas: '". air ." "water ether fire" ". earth ."',
        }}
      >
        {ELEMENTS.map((el) => (
          <button
            key={el}
            aria-label={el}
            onClick={() => selectElement(el)}
            data-element={el.toLowerCase()}
            style={{ gridArea: AREA[el], color: 'var(--accent)' }}
            className="flex h-28 w-28 flex-col items-center justify-center gap-2 rounded-[var(--radius)]
                       bg-card backdrop-blur transition hover:scale-105 focus:outline-none
                       focus:ring-2 ring-ring"
          >
            <ElementGlyph element={el} />
            <span className="label text-foreground">{el}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/components/ElementChooser.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```powershell
git add src/components/ElementGlyph.tsx src/components/ElementChooser.tsx src/components/ElementChooser.test.tsx
git commit -m "feat: element glyphs and chooser screen"
```

---

### Task 12: WaveformStrip + TrackLane

**Files:**
- Create: `src/components/WaveformStrip.tsx`
- Create: `src/components/TrackLane.tsx`
- Test: `src/components/TrackLane.test.tsx`

**Interfaces:**
- Consumes: `@/session/appStore` (`useSession`), `@/config` (`config`), `@/types` (`Track`), shadcn `Button`/`Slider`, lucide icons.
- Produces: `<WaveformStrip seed={string} />` (deterministic stylized bars); `<TrackLane trackId={string} />` (label, name, waveform, Play/Pause, Mute, Volume, Change, Lock — all store-bound).

- [ ] **Step 1: Implement `src/components/WaveformStrip.tsx`**

```tsx
// Stylized placeholder waveform: deterministic bar heights derived from a seed string.
function heights(seed: string, count: number): number[] {
  let h = 2166136261;
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    h ^= seed.charCodeAt(i % seed.length) + i;
    h = Math.imul(h, 16777619);
    out.push(0.2 + (((h >>> 8) & 0xff) / 255) * 0.8); // 0.2..1.0
  }
  return out;
}

export function WaveformStrip({ seed, bars = 48 }: { seed: string; bars?: number }) {
  return (
    <div className="flex h-8 flex-1 items-center gap-[2px] opacity-70" aria-hidden="true">
      {heights(seed, bars).map((v, i) => (
        <span
          key={i}
          style={{ height: `${Math.round(v * 100)}%`, background: 'var(--accent)' }}
          className="w-full rounded-full"
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Write the failing test** — `src/components/TrackLane.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TrackLane } from '@/components/TrackLane';
import { sessionStore } from '@/session/appStore';

function firstTrackId(): string {
  return sessionStore.getState().project.tracks[0].id;
}

describe('TrackLane', () => {
  beforeEach(() => {
    sessionStore.getState().backToChooser();
    sessionStore.getState().selectElement('WATER');
  });

  it('shows the track label and toggles mute', async () => {
    const id = firstTrackId();
    const label = sessionStore.getState().project.tracks[0].label;
    render(<TrackLane trackId={id} />);
    expect(screen.getByText(label)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: new RegExp(`mute ${label}`, 'i') }));
    expect(sessionStore.getState().project.tracks.find((t) => t.id === id)!.muted).toBe(true);
  });

  it('lock disables Change', async () => {
    const id = firstTrackId();
    const label = sessionStore.getState().project.tracks[0].label;
    render(<TrackLane trackId={id} />);
    await userEvent.click(screen.getByRole('button', { name: new RegExp(`lock ${label}`, 'i') }));
    expect(sessionStore.getState().project.tracks.find((t) => t.id === id)!.locked).toBe(true);
    expect(screen.getByRole('button', { name: new RegExp(`change ${label}`, 'i') })).toBeDisabled();
  });
});
```

- [ ] **Step 3: Run it to verify failure**

Run: `npx vitest run src/components/TrackLane.test.tsx`
Expected: FAIL — `@/components/TrackLane` not found.

- [ ] **Step 4: Implement `src/components/TrackLane.tsx`**

```tsx
'use client';
import { Play, Pause, Volume2, VolumeX, RefreshCw, Lock, Unlock } from 'lucide-react';
import { useSession } from '@/session/appStore';
import { config } from '@/config';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { WaveformStrip } from '@/components/WaveformStrip';

const { minDb, maxDb } = config.audio.volume;

export function TrackLane({ trackId }: { trackId: string }) {
  const track = useSession((s) => s.project.tracks.find((t) => t.id === trackId));
  const setTrackVolumeDb = useSession((s) => s.setTrackVolumeDb);
  const toggleMute = useSession((s) => s.toggleMute);
  const toggleLock = useSession((s) => s.toggleLock);
  const toggleTrackPlaying = useSession((s) => s.toggleTrackPlaying);
  const changeTrack = useSession((s) => s.changeTrack);

  if (!track) return null;
  const { label, sample, volumeDb, muted, playing, locked } = track;

  return (
    <div className="flex items-center gap-3 rounded-[var(--radius-md)] border border-border bg-card px-4 py-3 backdrop-blur">
      <div className="w-32 shrink-0">
        <div className="label">{label}</div>
        <div className="truncate text-sm text-foreground">{sample.name}</div>
      </div>

      <WaveformStrip seed={sample.path} />

      <Button variant="ghost" size="icon" aria-label={`${playing ? 'Pause' : 'Play'} ${label}`}
        onClick={() => toggleTrackPlaying(trackId)}>
        {playing ? <Pause size={16} /> : <Play size={16} />}
      </Button>

      <Button variant="ghost" size="icon" aria-label={`Mute ${label}`}
        onClick={() => toggleMute(trackId)}>
        {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
      </Button>

      <div className="flex w-40 items-center gap-2">
        <Slider min={minDb} max={maxDb} step={1} value={[volumeDb]}
          onValueChange={([v]) => setTrackVolumeDb(trackId, v)} aria-label={`Volume ${label}`} />
        <span className="w-12 text-right text-xs tabular-nums text-muted-foreground">{volumeDb} dB</span>
      </div>

      <Button variant="ghost" size="icon" aria-label={`Change ${label}`}
        disabled={locked} onClick={() => changeTrack(trackId)}>
        <RefreshCw size={16} />
      </Button>

      <Button variant="ghost" size="icon" aria-label={`Lock ${label}`}
        onClick={() => toggleLock(trackId)}>
        {locked ? <Lock size={16} /> : <Unlock size={16} />}
      </Button>
    </div>
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/components/TrackLane.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```powershell
git add src/components/WaveformStrip.tsx src/components/TrackLane.tsx src/components/TrackLane.test.tsx
git commit -m "feat: track lane (channel strip) and stylized waveform"
```

---

### Task 13: TransportBar

**Files:**
- Create: `src/components/TransportBar.tsx`
- Test: `src/components/TransportBar.test.tsx`

**Interfaces:**
- Consumes: `@/session/appStore` (`useSession`), `@/config` (`config`), shadcn `Button`/`Slider`, lucide icons.
- Produces: `<TransportBar />` — Global Play/Pause, Master Volume, Regenerate. (A visualizer slot is added in Part 5.)

- [ ] **Step 1: Write the failing test** — `src/components/TransportBar.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TransportBar } from '@/components/TransportBar';
import { sessionStore } from '@/session/appStore';

describe('TransportBar', () => {
  beforeEach(() => {
    sessionStore.getState().backToChooser();
    sessionStore.getState().selectElement('WATER');
  });

  it('toggles global playback', async () => {
    render(<TransportBar />);
    expect(sessionStore.getState().globalPlaying).toBe(false);
    await userEvent.click(screen.getByRole('button', { name: /play all/i }));
    expect(sessionStore.getState().globalPlaying).toBe(true);
  });

  it('regenerate is available', () => {
    render(<TransportBar />);
    expect(screen.getByRole('button', { name: /regenerate/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify failure**

Run: `npx vitest run src/components/TransportBar.test.tsx`
Expected: FAIL — `@/components/TransportBar` not found.

- [ ] **Step 3: Implement `src/components/TransportBar.tsx`**

```tsx
'use client';
import { Play, Pause, RefreshCw } from 'lucide-react';
import { useSession } from '@/session/appStore';
import { config } from '@/config';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';

const { minDb, maxDb } = config.audio.volume;

export function TransportBar() {
  const globalPlaying = useSession((s) => s.globalPlaying);
  const toggleGlobalPlaying = useSession((s) => s.toggleGlobalPlaying);
  const masterVolumeDb = useSession((s) => s.project.masterVolumeDb);
  const setMasterVolumeDb = useSession((s) => s.setMasterVolumeDb);
  const regenerate = useSession((s) => s.regenerate);

  return (
    <div className="sticky bottom-0 flex items-center gap-6 border-t border-border bg-card px-6 py-4 backdrop-blur">
      <Button size="lg" aria-label="Play all" onClick={toggleGlobalPlaying}
        className="rounded-full" style={{ background: 'var(--accent)' }}>
        {globalPlaying ? <Pause size={20} /> : <Play size={20} />}
        <span className="ml-2">{globalPlaying ? 'Pause' : 'Play all'}</span>
      </Button>

      <div className="flex items-center gap-2">
        <span className="label">Master</span>
        <div className="w-40">
          <Slider min={minDb} max={maxDb} step={1} value={[masterVolumeDb]}
            onValueChange={([v]) => setMasterVolumeDb(v)} aria-label="Master volume" />
        </div>
        <span className="w-12 text-right text-xs tabular-nums text-muted-foreground">{masterVolumeDb} dB</span>
      </div>

      <Button variant="outline" aria-label="Regenerate" onClick={regenerate}>
        <RefreshCw size={16} />
        <span className="ml-2">Regenerate</span>
      </Button>
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/TransportBar.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```powershell
git add src/components/TransportBar.tsx src/components/TransportBar.test.tsx
git commit -m "feat: transport bar with global play, master volume, regenerate"
```

---

### Task 14: BuilderScreen + page wiring — AUDIO MILESTONE

**Files:**
- Create: `src/components/BuilderScreen.tsx`
- Modify (overwrite): `src/app/page.tsx`

**Interfaces:**
- Consumes: `@/session/appStore` (`useSession`), `@/audio/useAudioEngine` (`useAudioEngine`), `ElementChooser`, `TrackLane`, `TransportBar`.
- Produces: `<BuilderScreen />` (two states: chooser vs builder; mounts the engine; sets `data-element`); `page.tsx` renders it.

- [ ] **Step 1: Implement `src/components/BuilderScreen.tsx`**

```tsx
'use client';
import { useSession } from '@/session/appStore';
import { useAudioEngine } from '@/audio/useAudioEngine';
import { ElementChooser } from '@/components/ElementChooser';
import { TrackLane } from '@/components/TrackLane';
import { TransportBar } from '@/components/TransportBar';
import { Button } from '@/components/ui/button';

export function BuilderScreen() {
  useAudioEngine(); // create + keep the engine in sync with the store
  const element = useSession((s) => s.project.element);
  const trackIds = useSession((s) => s.project.tracks.map((t) => t.id));
  const backToChooser = useSession((s) => s.backToChooser);

  if (!element) return <ElementChooser />;

  return (
    <div data-element={element.toLowerCase()} className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <div>
          <p className="label">Layer One — Sound Ecosystem Builder</p>
          <h1 className="text-lg" style={{ color: 'var(--accent)' }}>{element}</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={backToChooser}>Change element</Button>
          <Button variant="outline" disabled>Continue to Layer Two</Button>
        </div>
      </header>

      <main className="flex flex-1 flex-col gap-2 overflow-y-auto p-6">
        {trackIds.map((id) => <TrackLane key={id} trackId={id} />)}
      </main>

      <TransportBar />
    </div>
  );
}
```

- [ ] **Step 2: Overwrite `src/app/page.tsx`**

```tsx
'use client';
import { BuilderScreen } from '@/components/BuilderScreen';

export default function Page() {
  return <BuilderScreen />;
}
```

- [ ] **Step 3: Ensure the manifest exists, then run the app**

Run: `npm run build:manifest` (if not already generated)
Run: `npm run dev`, open `http://localhost:3000`.

- [ ] **Step 4: Manually verify the milestone**

Expected, in the browser:
1. The chooser shows 5 element glyphs on the pastel gradient.
2. Click an element (e.g. **Water**) → the accent turns that element's color; track lanes appear (ISO, PLANETS A/B, NOISE, ELEMENTS…, BASS, PAD, MELODY, FX) matching the selection rules.
3. Click **Play all** → all tracks loop together and blend into an evolving soundscape (this is the milestone).
4. **Mute** a track → it goes silent but, on unmute, is still in time with the others.
5. Per-track **Play/Pause** stops/starts just that track.
6. Drag a **Volume** slider → that track's loudness changes; the dB readout updates.
7. **Change** swaps a sample for another of the same type; **Lock** then **Change** → no swap; **Regenerate** re-rolls only unlocked tracks.
8. **Master** slider scales everything; transport **Pause** freezes and resumes in phase.
9. **Change element** returns to the chooser and audio stops.

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: PASS (all unit/component tests across Parts 1–4).

- [ ] **Step 6: Commit**

```powershell
git add src/components/BuilderScreen.tsx src/app/page.tsx
git commit -m "feat: builder screen wiring — element to audible soundscape"
```

---

## Part 4 self-review

- **Spec coverage:** element chooser w/ glyphs ✓ (T11); auto multitrack lanes as channel strips ✓ (T12/T14); per-track Play/Pause, Mute, Volume(dB), Change, Lock ✓ (T12); global Play/Pause, Master, Regenerate ✓ (T13); element-swap theming ✓ (T10); stylized waveform ✓ (T12); header + disabled "Continue to Layer Two" ✓ (T14); audible end-to-end ✓ (T14 manual).
- **Placeholders:** none — full component code; audio behavior verified via concrete browser steps (jsdom can't host Web Audio, so `BuilderScreen` is intentionally browser-verified, not unit-tested).
- **Type consistency:** components consume `useSession` action names exactly as defined in Part 2 (`selectElement`, `toggleMute`, `toggleLock`, `toggleTrackPlaying`, `changeTrack`, `regenerate`, `setTrackVolumeDb`, `setMasterVolumeDb`, `toggleGlobalPlaying`, `backToChooser`); `useAudioEngine` from Part 3 mounted once in `BuilderScreen`.
- **Boundary with Part 5:** `TransportBar` leaves a slot for the visualizer; `BuilderScreen` already mounts `useAudioEngine`, whose `getAnalyser()` Part 5's `Visualizer` will consume.

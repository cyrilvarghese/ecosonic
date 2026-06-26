# ECOSONIC — Layer One (Core) Design Spec

**Date:** 2026-06-26
**Status:** Approved for planning
**Scope:** Build 1 — Layer One "Sound Ecosystem Builder" (Core)

---

## 1. What we're building (plain language)

ECOSONIC is a **generative meditation sound app**. It does not play pre-recorded songs.
Instead it takes a set of short looping sounds and **stacks them so they all play at once,
forever**. Because each loop has a different length, they continuously drift in and out of
alignment, so the result never repeats exactly and slowly evolves on its own. That
self-composing quality is what "generative" means here.

Sounds are grouped into **five elements** — Earth, Water, Air, Fire, Ether. Each element is
a self-contained world of sounds. The user picks **one** element per session; the app uses
only that element's folder.

**Layer One** (this build) is the stage where the user **assembles and balances the raw
material** — like a mixing board, not a timeline. The user picks an element, the app
auto-selects a recipe of sounds, shows them as stacked tracks, and lets the user swap,
balance, mute, lock, and play them together. The output is a fully configured "project"
that a future **Layer Two** will arrange into a timed 30-minute meditation journey.

---

## 2. Scope

### In scope (Build 1 — Core)
- Element selection screen (5 alchemical glyphs).
- Automatic multitrack generation from selection rules.
- DAW-style horizontal track lanes with **stylized placeholder** waveforms.
- Per-track controls: **Play/Pause, Mute, Volume (dB), Change (random in-category), Lock**.
- Global controls: **Master Volume, Global Play/Pause, Regenerate (re-roll unlocked)**.
- Hybrid Web Audio engine (decode small files / stream large files), all tracks looping & mixed.
- Live organic visualization (p5.js driven by an `AnalyserNode`).
- Token-based design system ("Aether").
- Project data model that *already includes* `tuningHz` and a slot for per-track effects
  (no UI yet) so Build 2 extends without restructuring.

### Out of scope (deferred to Build 2)
- Per-track effects UI (**Delay**, **Reverb**).
- **Global Tuning** UI (resampling approach; field exists in model, default 440 Hz).
- **Real precomputed waveforms** (peak extraction at build time).
- **Save/Load project** (the Layer Two handoff file).
- Full sidebar navigation and Layers 2–5.

### Explicitly dropped
- **Per-track fade-in/out** — the detailed Layer One spec lists controls as
  Play/Pause, Mute, Volume, Change, Effect, Lock (no fades). Fades belong to Layer Two.
- **Solo** — not in the spec; Mute + Lock cover the real needs.
- **Manual replace dropdown** — the spec's "Change" is a one-click *random* re-pick.

---

## 3. Decisions log

| Decision | Choice | Rationale |
|---|---|---|
| Platform | **Web app, packaged as Electron later** | Web Audio is ideal; same code wraps in Electron |
| Framework | **Next.js + React + TypeScript** | User choice; shadcn-friendly; static-export for Electron |
| Styling | **Tailwind + shadcn/ui** | Token-driven, minimal, themeable |
| State | **Zustand** | Tiny store outside React render; audio engine reads/acts on it |
| Visualization | **p5.js** + native `AnalyserNode` | Organic generative meditation imagery |
| Audio library | **None (raw Web Audio)** for Build 1 | Tone.js `Player` decodes whole files → breaks raw-file streaming. Revisit for Layer Two after compression |
| Samples | **Used as-is** from `ECOSONIC FILES/` (5.8 GB raw WAV) | No conversion now; decide compression at distribution time |
| Sample access | **Next route handler** streams folder with HTTP range | No copy into `public/` |
| Element pick | **User always picks** first | Per Layer One spec |
| ARP & ELEMENT/SUB | **Ignored by builder** | Follow PDF selection categories strictly |
| Audio engine | **Hybrid:** decode small files, stream large | Avoids RAM blow-up from 150 MB+ WAVs while keeping tones gapless |
| Tunable constants | **Externalized to `config/ecosonic.config.json`** | Volume range, hybrid threshold, selection counts, tuning presets, ramp/motion timings — config-driven, no magic numbers in code |

---

## 4. The sample library (source of truth)

Located at `ECOSONIC FILES/<ELEMENT>/...`. Reality differs slightly from the PDFs:
- Every element also has a `SOUND/ARP` folder and an `ELEMENT/SUB` folder **not** in the
  selection rules — the manifest **records** them (future-proof) but the builder **ignores** them.
- macOS cruft (`.DS_Store`, `._*` AppleDouble files) must be filtered out.
- Mostly `.wav`; one `.mp3` (`EARTH/ELEMENT/NATURE.mp3`). Filenames contain spaces and `&`.

Per element, builder-relevant folders:
```
<ELEMENT>/
  ISO/      (frequency tones)
  PLANET/   (planetary drones)
  NOISE/    (background texture)
  ELEMENT/  (signature elemental sounds)   [SUB/ ignored]
  SOUND/
    BASS/  PAD/  MELODY/  FX/              [ARP/ ignored]
```

---

## 5. Selection rules (auto-builder)

After the user picks an element, draw **randomly within that element**, clamped to what
exists. Each picked sample becomes one track, ordered as below:

| Category | Tracks | Lane labels |
|---|---|---|
| ISO | 1 | `ISO` |
| PLANET | 2 | `PLANETS A`, `PLANETS B` |
| NOISE | 1 | `NOISE` |
| ELEMENT | 2–3 | `ELEMENTS A/B(/C)` |
| BASS | 1 | `BASS` |
| PAD | 1 | `PAD` |
| MELODY | 1 | `MELODY` |
| FX | 1–2 | `FX (A/B)` |

> Counts (per-category `min`/`max`) are read from `config.selection` — the recipe is tunable
> without code changes.

- **Change (per track):** new random pick within the *same* category (prefer different from
  current). Disabled if the track is **locked**. Structure unchanged, only sonic content.
- **Regenerate (global):** re-roll every **unlocked** track's sample (counts/structure fixed).

---

## 6. Architecture

### 6.1 Project structure
```
ecosonic/
├─ ECOSONIC FILES/                 # existing library, untouched (streamed, not copied)
├─ config/
│  └─ ecosonic.config.json         # tunable constants (config-driven)
├─ scripts/
│  └─ build-manifest.mjs           # scans library → manifest.json (filters cruft)
├─ app/
│  ├─ api/samples/[...path]/route.ts  # streams files w/ HTTP range support
│  ├─ globals.css                  # design tokens (single source of truth)
│  ├─ layout.tsx
│  └─ page.tsx                     # "use client" — Layer One
├─ src/
│  ├─ audio/
│  │  ├─ AudioEngine.ts            # AudioContext, master graph, transport
│  │  └─ Layer.ts                  # one track: buffer-or-stream, gain, loop, mute
│  ├─ session/
│  │  ├─ selectionRules.ts         # category counts
│  │  ├─ buildSelection.ts         # element → tracks (respects Lock)
│  │  └─ sessionStore.ts           # Zustand: Project state + actions
│  ├─ samples.ts                   # resolveSampleUrl() — Electron swap point
│  ├─ config.ts                    # typed, zod-validated loader for ecosonic.config.json
│  ├─ manifest.json                # generated
│  └─ components/
│     ├─ ElementChooser.tsx  ElementGlyph.tsx
│     ├─ BuilderScreen.tsx
│     ├─ TrackLane.tsx  WaveformStrip.tsx
│     ├─ TransportBar.tsx
│     └─ Visualizer.tsx            # p5.js
└─ next.config.ts                  # output: 'export' later for Electron
```

### 6.2 Sample serving & manifest
- **`build-manifest.mjs`** scans `ECOSONIC FILES/`, ignores dotfiles/`._*`, records every real
  audio file with `{ name, path, bytes, ext }` grouped by element → category (incl. ARP/SUB
  for the future). Emits `src/manifest.json`. Run via `npm run build:manifest`.
- **Route handler** `app/api/samples/[...path]/route.ts` resolves a request path against the
  absolute `ECOSONIC FILES/` directory and streams the file **honoring `Range` headers**
  (mandatory for `<audio>` streaming/seek). URL-encodes spaces/`&`.
- **`resolveSampleUrl(path)`** is the single function the app uses to turn a manifest path
  into a playable URL (`/api/samples/...` in web; `file://` in Electron). One swap point.

### 6.3 Data model
```ts
type ElementName = 'EARTH' | 'WATER' | 'AIR' | 'FIRE' | 'ETHER';
type Category = 'ISO' | 'PLANET' | 'NOISE' | 'ELEMENT' | 'BASS' | 'PAD' | 'MELODY' | 'FX';

interface Track {
  id: string;
  category: Category;
  label: string;                 // e.g. "PLANETS A"
  sample: { name: string; path: string; bytes: number };
  volumeDb: number;              // CEILING level (default -6); Layer Two won't exceed it
  muted: boolean;
  playing: boolean;              // per-track play/pause
  locked: boolean;
  // Build 2: effects?: { delay: DelayParams; reverb: ReverbParams }
}

interface Project {
  element: ElementName | null;
  tracks: Track[];
  masterVolumeDb: number;        // default 0
  tuningHz: number;              // default 440 (UI in Build 2)
}
```

### 6.4 Audio engine (hybrid)
One `AudioContext`, created/resumed on the first user gesture (element click) to satisfy
autoplay policy. Per-track graph:
```
source ──→ trackGain ──→ masterGain ──→ masterAnalyser ──→ destination
                                              └─ (drives Visualizer)
```
- **Source choice (hybrid):** if `bytes < config.audio.hybridThresholdBytes` → fetch + `decodeAudioData` → looping
  `AudioBufferSourceNode` (gapless, for tones/short loops). Else → `<audio loop>` +
  `MediaElementAudioSourceNode` (streamed, low memory). Both behind one `Layer` interface.
- **Volume (dB → gain):** `gain = db <= minDb ? 0 : 10 ** (db / 20)`. Range and defaults come
  from `config.audio.volume` (`minDb`/`maxDb`, `defaultTrackDb`/`defaultMasterDb`, ramp times).
  Track volume is the **ceiling** for Layer Two.
- **Mute:** ramp `trackGain` to 0 (short ramp), **source keeps running** so the loop stays
  phase-locked; unmute ramps back to the track's level. Mute never stops the source.
- **Per-track Play/Pause:** pause stops/pauses that track; resume restarts a buffer source at
  the phase-aligned offset `((ctx.currentTime − startTime) % duration)` (or restores
  `<audio>.currentTime`) so it lines up with the others.
- **Global Play/Pause:** `ctx.suspend()/resume()` freezes the whole graph's clock (preserves
  phase). Note: streamed `<audio>` elements keep their own clock, so global pause must also
  `pause()` every media element and resume must `play()` them around the context toggle.
- **Change / Regenerate:** swap a track's sample → rebuild that track's source node, preserving
  its volume/mute/lock. Locked tracks are skipped.
- **Tuning (model only in Build 1):** when implemented, set
  `playbackRate = tuningHz / config.audio.tuning.baseHz` on buffer sources and `<audio>`
  (`preservesPitch = false`). Resampling shifts pitch and nudges
  speed <2% — imperceptible for ambient loops, and works in both engine modes.

The engine is an imperative class living **outside** React render; React components call its
methods and read `sessionStore` for display.

### 6.5 Configuration (config-driven constants)
All tunable behavioral values live in **`config/ecosonic.config.json`** — **no magic numbers in
code**. `src/config.ts` imports it, validates it against a **zod** schema (fails loudly at
startup on bad config), and exports a typed `config` object consumed by the engine, builder,
and UI. The loader is the single swap point: today it imports a static JSON; later it can fetch
a remote/per-deployment config or merge user-settings overrides **without touching consumers**.

```jsonc
{
  "audio": {
    "hybridThresholdBytes": 8388608,         // decode below, stream above (~8 MB)
    "volume": {
      "minDb": -60, "maxDb": 0,
      "defaultTrackDb": -6, "defaultMasterDb": 0,
      "muteRampMs": 80, "changeRampMs": 200
    },
    "tuning": {                              // engine reads now; UI in Build 2
      "baseHz": 440, "defaultHz": 440,
      "presetsHz": [432.0, 432.69, 440.0, 444.0]
    }
  },
  "selection": {                            // per-category track counts (the recipe)
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

- **Behavioral constants** (numbers, ranges, counts, timings) live here.
- **Visual tokens** (colors, radius, type) stay in CSS variables / the design system — the two
  layers don't overlap. Behavior = JSON; appearance = CSS tokens.
- Values are read through `config.*`; nothing references raw literals inline.

---

## 7. UI

Single page, two states.

### 7.1 Element selection
Hero screen on an iridescent pastel background: the 5 elements as thin **SVG line-art
glyphs** (Earth ▽̶, Water ▽, Air △̶, Fire △, Ether ✶·) arranged per the mockup. Clicking one
sets `data-element`, resumes the AudioContext, runs the auto-builder, and transitions to the
builder.

### 7.2 Sound Ecosystem Builder
- **Header:** "LAYER ONE — Sound Ecosystem Builder", active-element indicator (with a way back
  to the chooser), a disabled "Continue to Layer Two".
- **Track lanes** (`TrackLane`), grouped in selection order. Each lane:
  category label + sample name · **stylized waveform strip** · **Play/Pause** · **Mute** ·
  **Volume** slider (dB) · **Change** (disabled when locked) · **Lock** toggle.
- **Transport bar** (sticky bottom): **Global Play/Pause**, **Master Volume**, **Regenerate**,
  and the live **Visualizer**.

### 7.3 Visualization
A passive `AnalyserNode` taps `masterGain`. `Visualizer` (p5.js) reads time-domain/frequency
data each frame and renders flowing, organic imagery tinted to the active element's accent.
Inserting the analyser does not alter the sound.

---

## 8. Design System — "Aether"

Soft iridescent pastels, glass surfaces, thin wide-tracked type, line-art glyphs, gentle
glows. Built the shadcn way: **CSS variables are the single source of truth**, mapped into
Tailwind, consumed only via semantic names.

### Principles
1. **Two-tier tokens.** Raw *primitives* → *semantic* roles. Components use only semantic tokens.
2. **One swappable accent = element theming.** A single `--accent`; `[data-element]` swaps it,
   re-tinting rings, glows, waveforms, and the visualizer to the active element.
3. **Minimal.** Tokenize a value only when it repeats. Light-first; dark mode a later drop-in.
4. **Calm motion + accessible contrast** are part of the system.

### Color tokens (OKLCH — perceptually even, clean pastels)
**Primitives**
- Neutrals (cool-tinted): `--n-50: 0.98 0.005 285` → `--n-900: 0.20 0.03 285`.
- Element accents: `--c-earth 0.80 0.09 140`, `--c-water 0.82 0.08 225`,
  `--c-air 0.89 0.04 255`, `--c-fire 0.80 0.11 45`, `--c-ether 0.78 0.10 305`.
- Hero gradient: pastel lavender → sky → blush → mint.

**Semantic (light)**
| Token | Maps to | Use |
|---|---|---|
| `--background` | `--n-50` | page |
| `--foreground` | `--n-800` | text (dark for contrast on pastel) |
| `--card` | white ~70% + blur | glass surfaces |
| `--muted` / `--muted-foreground` | `--n-100` / `--n-500` | fills / secondary text |
| `--border` / `--input` | `--n-200` | hairlines |
| `--accent` / `--ring` | **active element color** | active/focus/play |
| `--primary` | `--n-800` | rare solid controls |

**Effects:** `--glass-bg`, `--glass-blur: 16px`, `--shadow-soft: 0 8px 30px -12px`,
`--glow: 0 0 40px <accent>/.35`.

### Typography
- `--font-sans`: **Inter** (variable). Weights 300 (titles/numbers), 400 (body), 500 (labels).
- **Tracking is the signature:** `--tracking-wide .12em`, `--tracking-wider .2em`,
  `--tracking-widest .3em` → spaced `L A Y E R  O N E` labels.
- `.label` utility: uppercase + wider tracking + muted-foreground.

### Scales
- **Radius** `--radius: 1rem` (cards), pill buttons (`9999px`); shadcn derives sm/md/lg.
- **Spacing** Tailwind 4px base; generous whitespace as a rule.
- **Motion** `--ease-calm: cubic-bezier(.22,1,.36,1)`; `--dur 400ms`, longer for audio fades.

### Implementation
- Tokens in `app/globals.css` `:root`, mapped via Tailwind v4 `@theme inline`.
- **shadcn components** themed by tokens: Button, Slider, Toggle/ToggleGroup, Card, Tooltip,
  Separator, ScrollArea.
- **Custom:** `ElementGlyph`, `TrackLane`, `WaveformStrip`, `Visualizer`, `TransportBar`.
- **Element swap:**
```css
[data-element="water"] { --accent: var(--c-water); --ring: var(--c-water); }
/* ...one rule per element... */
```
- **Accessibility:** keep `--foreground` dark on pastel; verify contrast for any text on
  accent/gradient; visible focus rings via `--ring`.

---

## 9. Build plan (incremental — each step is runnable)

1. **Skeleton** — Next.js + TS + Tailwind + shadcn init; design tokens in `globals.css`; `config/ecosonic.config.json` + zod-validated `config.ts` loader. *(blank themed page)*
2. **Manifest** — `build-manifest.mjs` + `manifest.json`; route handler streams samples with range. *(app "knows" all sounds; a sample plays via direct URL)*
3. **Element chooser** — 5 glyphs, `data-element` swap, hero background. *(pick an element)*
4. **Auto-builder** — selection rules → `Project.tracks`; Zustand store. *(chosen tracks listed)*
5. **Track lanes** — `TrackLane` UI with stylized waveform placeholders. *(looks like the mockup)*
6. **Audio engine** — hybrid load + loop + mix + master; **Global Play/Pause**. *(hear the soundscape — key milestone)*
7. **Per-track controls** — Play/Pause, Mute (sync-preserving), Volume (dB), Change, Lock. *(shape the mix)*
8. **Global controls** — Master Volume, Regenerate (unlocked). *(control the session)*
9. **Visualizer** — p5.js + AnalyserNode, element-tinted. *(it feels alive)*
10. **Polish** — meditation aesthetic pass (glass, glow, motion).

By **step 6** there is a working, evolving soundscape; everything after is control and beauty.

---

## 10. Success criteria
- User picks an element and sees an auto-generated multitrack matching the selection rules.
- Pressing Global Play loops and mixes all tracks together into an evolving soundscape.
- Per-track Play/Pause, Mute (stays in sync), Volume (dB), Change (random in-category), and
  Lock all behave per the Layer One spec.
- Master Volume and Regenerate (unlocked only) work globally.
- Large textures stream without exhausting memory; short tones loop gaplessly.
- The UI reflects the Aether design system and re-tints to the active element.

---

## 11. Assumptions & open questions
- **Assumption:** base tuning of samples is `config.audio.tuning.baseHz` (440 Hz default).
- **Note:** volume range/defaults, hybrid threshold, selection counts, and timings are **not
  hardcoded** — they live in `config/ecosonic.config.json` and change without code edits.
- **Open (Build 2):** reverb impulse-response source (bundled IR vs generated).
- **Open (distribution):** compression format (FLAC vs Ogg) when packaging — out of scope now.
```
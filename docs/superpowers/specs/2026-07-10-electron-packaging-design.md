# ECOSONIC → Electron Desktop App — Design

**Date:** 2026-07-10
**Status:** Approved (user: "go ahead")
**Goal:** Produce an installable desktop build of ECOSONIC (Windows first) that runs
fully offline with the audio sample library bundled in.

## Decisions (locked)

| Question | Decision |
| --- | --- |
| Sample library (5.8 GB `ECOSONIC FILES`) | **Bundle everything** into the app. Zero configuration for the user; large artifact accepted. |
| Packaging approach | **Static export + Electron custom protocol** (not an embedded Next server). |
| Target platform | **Windows** (NSIS installer). macOS can be added later. |
| Code signing | **Unsigned** for now (personal install; Windows SmartScreen prompt is expected and acceptable). |

## Why static export (not embedded Next server)

The app is client-only except one route: [src/app/api/samples/[...path]/route.ts](../../../src/app/api/samples/%5B...path%5D/route.ts)
streams `.wav` files off disk. Everything real (Web Audio, p5 visuals, Zustand) runs
in the browser. The author already left the exact seam for this in
[src/samples.ts](../../../src/samples.ts): *"Swap this for a `file://` scheme when
wrapping in Electron later."*

Static export yields a folder of HTML/JS/CSS with no runtime server, giving a snappy,
fully-offline native app. The only server code (the sample route) is replaced by an
Electron protocol handler.

## Architecture

```
┌─────────────────────────── Electron app ───────────────────────────┐
│  main process (electron/main.ts)                                    │
│   • registers privileged scheme  ecosonic://                        │
│   • protocol.handle('ecosonic', …):                                 │
│       host = app      → serve exported UI from  <resources>/out     │
│       host = samples  → serve .wav from <resources>/ECOSONIC FILES  │
│       (both via net.fetch('file://…') → range + streaming for free) │
│   • BrowserWindow.loadURL('ecosonic://app/')                        │
│                                                                     │
│  renderer (the exported Next app)                                   │
│   • resolveSampleUrl() detects ecosonic: protocol →                 │
│       returns  ecosonic://samples/<encoded path>                    │
│   • Web Audio fetch()es that URL exactly as before                  │
└─────────────────────────────────────────────────────────────────────┘
```

## Components / changes

1. **`next.config.ts`** — when `BUILD_TARGET=electron`: `output: 'export'`,
   `trailingSlash: true`, `images: { unoptimized: true }`. Web dev config unchanged.
2. **Build script** (`scripts/build-electron.mjs`) — temporarily relocates
   `src/app/api` out of the tree (route handlers can't be statically exported), runs
   `next build` → `out/`, restores the route in a `finally`. Web `npm run dev` keeps
   using the API route.
3. **`electron/main.ts`** — window creation, scheme registration, `protocol.handle`
   routing by hostname, SPA path resolution (`/` → `index.html`, `/layer2/` →
   `layer2/index.html`, `.html`/404 fallback), path-traversal guard on both hosts.
4. **`electron/preload.ts`** — minimal, contextIsolation on; no Node exposed to the
   renderer (the app needs none).
5. **`src/samples.ts`** — `resolveSampleUrl` returns `ecosonic://samples/…` when
   `location.protocol === 'ecosonic:'`, else the existing `/api/samples/…` for web.
6. **`electron-builder` config** — bundle `out/` + `ECOSONIC FILES` (as
   `extraResources`); target Windows NSIS. `.exe` installer output.

## Data flow (audio)

`Layer.load()` → `fetch(resolveSampleUrl(path))` → `ecosonic://samples/<path>` →
`protocol.handle` → `net.fetch('file://…/ECOSONIC FILES/<path>')` → blob → WebAudio.
No change to the audio engine itself.

## Risks & mitigations

- **SSR prerender of client components at build time** — module-level `window`/
  `AudioContext` access would crash `next build`. Mitigation: build the static export
  first (fail-fast) and guard any offending top-level access into effects.
- **Absolute asset paths** (`/_next/...`) — resolved by serving the UI under a real
  origin (`ecosonic://app/`), so absolute paths map to the `app` host. No `assetPrefix`.
- **6 GB artifact** — accepted per "bundle everything"; build/copy is slow. Installer
  build run once, not per iteration.
- **`next/font/google`** downloads Inter at build time (needs network during build,
  self-hosted into `out/` afterward → offline at runtime).

## Staging

1. **Stage 1 — prove the static export** builds cleanly (`out/`) with the route excluded.
2. **Stage 2 — Electron dev shell**: main + preload + protocol handler + `resolveSampleUrl`;
   confirm the app loads and audio plays from disk via `ecosonic://`.
3. **Stage 3 — package**: electron-builder → installable `.exe` with `ECOSONIC FILES` bundled.

## Out of scope (for now)

macOS/Linux builds, code signing / notarization, auto-update, letting the user point at
an external sample folder (bundling everything instead).

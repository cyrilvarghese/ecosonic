# Hosting ECOSONIC on the web

**Status:** Living document · **Last updated:** 2026-08-03
**Related:** [design + rationale](./superpowers/specs/2026-08-03-vercel-r2-hosting-design.md) ·
[PRD](./PRD.md)

How the 5.9 GB sample library was moved off local disk, how the web build is produced, and
everything that changed to make the app run without a server. The design doc explains *why*;
this one explains *what it is now* and *how to operate it*.

---

## 1. The shape of it

ECOSONIC runs locally as a normal Next.js app: a server reads the sample library off disk,
writes JSON config files, and calls OpenAI. None of that survives on a static host. So the
hosted build ships **only the instrument**, with audio served from object storage:

```
  Vercel — static export, $0/mo           Cloudflare R2 — public bucket, $0/mo
┌─────────────────────────────────┐     ┌────────────────────────────────────┐
│  /   /layer1   /layer2   /remix │     │  EARTH/ISO/1hz.flac                │
│  + manifest.json (sample index) │ ──► │  EARTH/PAD/BOWLS.m4a               │
│  + sessionStore.json (rules)    │     │  101 files, 585.4 MB               │
│  no server, no API, no API key  │     │  public + CORS + immutable cache   │
└─────────────────────────────────┘     └────────────────────────────────────┘

  Your laptop — unchanged:  npm run dev  →  all six API routes, /rules, writes config/*.json
```

Local development is untouched. Everything below is additive.

## 2. What ships and what does not

The app divides three ways by *what it needs from a server*:

| Tier | Pages | Server need | Hosted? |
| --- | --- | --- | --- |
| Pure client | `/`, `/layer1`, `/layer2` | none — audio only | ✅ |
| Client + read-only data | `/remix` | the authored session rules | ✅ (data baked in) |
| Authoring | `/rules` | writes files, spends `OPENAI_API_KEY` | ❌ stays local |

Tier C is every `writeFileSync` in the codebase and the only use of the API key. Dropping it
removes the need for a server entirely — which is why the hosted app can be static files.

**Authoring locally and committing is the publishing mechanism.** Discover a rule, keep it,
upload a session — then commit `config/discovered-rules.json` / re-run `build:sessions`, and the
next deploy carries it. There is no admin UI in production by design.

## 3. How the audio moved

### 3.1 The problem

The library is 5.9 GB across 101 samples, the largest 171.8 MB. `Layer.load()` downloads each
file **whole** before it can play a note ([Layer.ts:83-85](../src/audio/Layer.ts)). Off local
disk that is instant; over the internet it is a multi-minute wait, and several loaded layers
risk exhausting tab memory (decoded float ≈ 1.3× the WAV).

### 3.2 The pipeline

```
ECOSONIC FILES/          transcode-web.ts        web-audio/         upload-r2.ts      R2 bucket
  (5.9 GB, gitignored)  ──────────────────►   (585 MB, gitignored) ─────────────►  (public URL)
   101 .wav/.mp3          ffmpeg, per file                                          101 objects
```

Then at runtime: `resolveSampleUrl(path)` → `https://<bucket>/<path with new extension>` →
`fetch` → `decodeAudioData`. The audio engine is unchanged; it decodes whatever the browser
supports.

### 3.3 Formats — and the one exception

| | Files | Hosted | Ratio |
| --- | --- | --- | --- |
| **AAC 128 k** (`.m4a`) | 81 | 239.7 MB | ~17.7× |
| **FLAC, lossless** (`.flac`) | 20 | 345.8 MB | ~4.7× |
| **Total** | **101** | **585.4 MB** | **10.3×** |

Everything is AAC 128 k **except `ISO/**`, which stays lossless**. That material is
isochronic/binaural, where the effect lives in the frequency difference *between* channels —
and AAC's joint-stereo coding is specifically designed to discard inter-channel information it
judges inaudible. It costs ~4× the bytes of AAC for 20 files and is worth it.

Consequence worth knowing: ISO is a fifth of the files but **59% of the hosted payload**. If
size ever becomes a problem, ISO is the only lever worth pulling. The largest single download
is 19.1 MB (`ETHER/ISO/33hz.flac`), down from 171.8 MB.

### 3.4 One naming rule, three consumers

[`src/webAudioExt.ts`](../src/webAudioExt.ts) — ~20 lines — decides what a source path is called
once hosted. It is imported by the transcode (which names files), the uploader (which keys
objects), and the player (which builds URLs).

This is deliberate. A filename is a contract between three processes that never run at the same
time, and the failure mode of disagreement is a 404 in production that unit tests cannot catch,
because each side passes its own tests while spelling the name differently. `FROG&BIRDS.wav` is
the case that proves it — verify that key specifically after any change here.

### 3.5 The manifest is the source of truth

Neither the transcode nor the upload walks the library. Both read
[`src/manifest.json`](../src/manifest.json), because the **app** never scans disk either — it
reads that manifest. So the manifest *is* the set of paths that can ever be requested, and
driving from it makes the hosted set exactly 1:1 with what the player can ask for.

An earlier directory-walking version re-derived that rule and got it wrong: the library carries
131 macOS AppleDouble sidecars (`._WIND 2.wav`), which end in `.wav` but are metadata stubs.
`manifestBuild` already filters them; duplicating its logic was the mistake.

## 4. The two seams

Everything server-shaped funnels through two small modules, each with a local branch and a
hosted branch:

| Seam | Local | Hosted |
| --- | --- | --- |
| [`src/samples.ts`](../src/samples.ts) — audio | `/api/samples/<path>.wav` | `<R2 base>/<path>.m4a\|.flac` |
| [`src/sessions.ts`](../src/sessions.ts) — remix rules | `fetch('/api/sessions')` | baked `sessionStore.json` |

Both branch on build-time environment, so the unused branch is compiled out entirely. After a
correct web build there are **zero `/api/` references in the shipped JavaScript** — that grep is
the single best check that hosting is wired right.

**`NEXT_PUBLIC_STATIC_EXPORT`** is set by the build target in
[`next.config.ts`](../next.config.ts), not configured by hand. It states a fact about how the
bundle was built — *this bundle has no API routes* — rather than a deployment preference. The
`/remix` upload control is hidden under it too: a button that can only fail is worse than no
button.

## 5. The build

`npm run build:web` ([scripts/build-web.mjs](../scripts/build-web.mjs)):

1. Moves `src/app/api` and `src/app/rules` out of the tree — route handlers and the authoring
   page cannot be statically exported.
2. Deletes `.next/dev`, which holds per-route type validators generated by `next dev`. A stale
   one referencing a stashed route fails the type check even though the app compiles.
3. Runs `next build` with `BUILD_TARGET=web` → `out/` (~3.3 MB).
4. **Verifies** both directories are back, and throws with the stash path if not.

That last step matters: this script relocates real source files. If it ever reports a failed
restore, move the files back **by hand** — do not `git checkout` those paths, which would
discard uncommitted work still sitting in the stash.

> ⚠️ `scripts/build-electron.mjs` has the same stash design but reports success
> unconditionally, and was observed leaving `src/app/api` in `.electron-build-tmp`. Fix it
> before using the desktop build.

## 6. Runbook

```bash
# One-time / whenever the sample library changes
npm run build:manifest      # rebuild the sample index   → src/manifest.json  (commit it)
npm run transcode:web       # ffmpeg → web-audio/         (resumable, skips existing)
npm run upload:r2           # push to R2                  (resumable, skips matching)
npm run verify:r2           # 101/101 fetchable over the public URL

# Whenever an authored session changes
npm run build:sessions      # config/sessions/*.md → src/sessionStore.json  (commit it)

# Build the deployable bundle
npm run build:web           # → out/

# Rehearse hosting locally — this is `out/`, exactly what Vercel serves
npx serve out -l 4173
```

`transcode:web` and `upload:r2` read `.env.local` and are safe to re-run: both skip work already
done, so an interrupted run costs nothing to repeat.

### Credentials (`.env.local`, gitignored)

```bash
R2_ACCOUNT_ID=…
R2_ACCESS_KEY_ID=…
R2_SECRET_ACCESS_KEY=…          # shown once at creation; never committed
R2_BUCKET=ecosonic
NEXT_PUBLIC_SAMPLE_BASE_URL=https://pub-….r2.dev
```

The repo is **public**. Nothing here may ever be committed.

## 7. Vercel settings

Two settings, both non-default. Getting either wrong produces a page that looks fine until you
press play.

| Setting | Value | Why |
| --- | --- | --- |
| **Build Command** | `npm run build:web` | The default `next build` produces a *server* build including the API routes, which then 404 because the library is not there. |
| **Output Directory** | `out` | Where the static export lands. |
| **Environment Variable** | `NEXT_PUBLIC_SAMPLE_BASE_URL` = the r2.dev URL | Without it, `resolveSampleUrl` compiles in `/api/samples/…`. |

`NEXT_PUBLIC_STATIC_EXPORT` is **not** set here — the build target provides it.

> **`NEXT_PUBLIC_*` values are inlined at build time, not read at runtime.** Adding the variable
> does nothing to an existing deployment. It must be set *and then rebuilt*.

## 8. Troubleshooting

**Console full of `404` on `/api/samples/….wav`, then `EncodingError: Unable to decode audio
data`.**
The single most common failure. `NEXT_PUBLIC_SAMPLE_BASE_URL` was missing when the bundle was
built, so the local branch was compiled in. The `.wav` extension in those URLs is the tell — the
hosted branch would have asked for `.m4a`/`.flac`. Set the variable in Vercel, then **redeploy**;
setting it alone changes nothing. The follow-on decode errors are downstream noise: the app got
a 404 HTML page where it expected audio.

**`/rules` is reachable on the deployed site.**
The build ran `next build` rather than `npm run build:web`. Fix the Build Command and redeploy.

**`/remix` spins forever, or shows "Could not load the authored sessions".**
`src/sessionStore.json` is missing or stale. Run `npm run build:sessions` and commit it.

**A sample 404s in R2 but others work.**
Usually a name with `&` or a space. Check that exact key: the uploader and the player must agree
on encoding. `npm run verify:r2` walks all 101 and reports the failures.

**Build fails on a missing `@/manifest.json`.**
`src/manifest.json` is committed on purpose — it cannot be generated on Vercel, which has no copy
of the library. Do not add it back to `.gitignore`.

## 9. Constraints

- **`r2.dev` is rate-limited** and Cloudflare documents it as development-only. Fine for a few
  listeners; attach a custom domain before it is anything more. That also unlocks Cloudflare
  caching and Access.
- **The bucket is public**, and its URL ships in the client bundle. Anyone who opens the app can
  fetch the audio directly. Signed URLs would need a server.
- **No access control** on the app itself — an unlisted URL only. Vercel's Hobby protection
  admits team members, and a Hobby account has none, so it would lock guests out rather than in.
- **Vercel Hobby is non-commercial.** Revisit if ECOSONIC ever ships commercially.
- **R2 free tier**: 10 GB storage, egress free. The library uses 5.9% of it.

## 10. What changed

16 commits, `da6c49d..8606cc2`. New:

| File | Role |
| --- | --- |
| `src/webAudioExt.ts` | the naming rule, shared by all three consumers |
| `src/sessions.ts` | session-store seam |
| `src/sessionStore.json` | baked authored rules (5 sessions, 109 rules) |
| `scripts/transcode-web.ts` | library → `web-audio/` |
| `scripts/upload-r2.ts` | `web-audio/` → R2, resumable |
| `scripts/verify-r2.ts` | every sample fetchable over the public URL |
| `scripts/build-sessions.ts` | `config/sessions/*.md` → `sessionStore.json` |
| `scripts/build-web.mjs` | the static-export build |
| `.vercelignore` | keep 6.5 GB of audio out of CLI deploys |

Changed: `src/samples.ts` (R2 branch), `next.config.ts` (`web` target + the static-export flag),
`useRemix.ts` / `RemixView.tsx` (use the seam; error handling; hide upload when hosted),
`.gitignore` (**un**-ignore `src/manifest.json`, ignore `web-audio/`).

Two bugs were found along the way that had nothing to do with hosting, and both are fixed:
`/remix` hung forever on any failed session fetch (no `res.ok` check, no `catch`), and
`src/manifest.json` had been stale since 2026-07-10 — it named `EARTH/ELEMENT/ANKLUNG.wav`, which
had moved, so picking that sample 404s in the running app.

517 tests pass.

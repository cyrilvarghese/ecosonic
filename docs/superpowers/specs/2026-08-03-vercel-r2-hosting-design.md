# ECOSONIC → Vercel + R2 Hosting — Design

**Date:** 2026-08-03
**Status:** Awaiting approval · supersedes the 2026-07-27 draft (deleted; see git history)
**Goal:** Put the ECOSONIC *instrument* behind an unlisted URL one friend can open on
Chrome/macOS, at $0/month, without changing how authoring works locally.

**Why rewritten rather than amended:** the first draft was written against a snapshot that is
now 85 commits stale. Remix shipped (`/remix`, PRD §6.4), a sixth API route appeared
(`/api/sessions`), and engine-wide effects landed. Its central claim — *"every `node:fs`
importer is an API route or under `src/rules/`"* — is now false. Patching it would have
preserved a shape the app has outgrown, which is exactly how the 2026-07-10 Electron spec
went quietly wrong.

## Decisions

| Question | Decision |
| --- | --- |
| Audience | One friend, testing on **Chrome/macOS**. Not a public product. |
| App host | **Vercel**, serving a **static export** — no server, no functions. |
| Audio host | **Cloudflare R2** public bucket. |
| Hosted pages | `/`, `/layer1`, `/layer2`, **`/remix`**. `/rules` stays local. |
| Web audio format | **AAC 128 k**, except `ISO/**` which stays **lossless FLAC**. |
| Session store | **Baked at build time** into a committed JSON — see §4. |
| Access control | Unlisted URL, **no password** (user: "dont password protect its fine"). |
| Repo | `github.com/cyrilvarghese/ecosonic`, personal + **deliberately public**. |
| Originals | Never modified. Transcodes go to a separate `web-audio/`. |

## 1. The shape of the app today

Five pages, six API routes. What matters for hosting is not the route list but **what each
page needs from a server**, which splits three ways — the two-way split the previous draft
assumed no longer holds:

| Tier | Pages | Server need |
| --- | --- | --- |
| **A. Pure client** | `/`, `/layer1`, `/layer2` | None. Audio only, via one function. |
| **B. Client + read-only data** | `/remix` | Reads the authored session store. Data is **static and tracked in git**. |
| **C. Authoring** | `/rules` | Writes files, spends `OPENAI_API_KEY`. Genuinely needs a server. |

Tier C is what cannot and should not ship. Tier B is the new case, and the one the design
has to answer deliberately.

**Verified inventory** (2026-08-03):

- Every client→server call is one of: `/api/rules`, `/api/analyses`, `/api/analyze`,
  `/api/analyze-text` (all from `/rules` and its panels — tier C), or `/api/sessions`
  (from `/remix` — tier B).
- `resolveSampleUrl()` in [src/samples.ts](../../../src/samples.ts) is still the **only** audio
  door: [Layer.ts:50](../../../src/audio/Layer.ts) for playback,
  [renderModuleWav.ts:45](../../../src/arrange/render/renderModuleWav.ts) for offline WAV export.
  It survived 85 commits of unrelated work, including all of Remix.
- `OPENAI_API_KEY` is read only by `analyze` and `analyze-text` — both tier C.
- No `middleware.ts` exists, which matters: a static export cannot run one.

## 2. Why static export

Drop tier C and every filesystem writer and the API key leave with it. What remains needs no
server at all, so it deploys as static HTML/JS/CSS with audio fetched cross-origin from R2.

This *sidesteps* three Vercel limits rather than solving them:

1. **4.5 MB request/response cap** on functions, all plans. `config.analysis.maxUploadBytes`
   is 25 MB and [analyze/route.ts](../../../src/app/api/analyze/route.ts) base64-buffers the
   whole upload — it could never work hosted.
2. **Read-only, per-invocation filesystem.** `registry.ts`, `analysisStore.ts`, `promote.ts`
   and `sessions/route.ts` all `writeFileSync` into `config/`. Hosted, those writes would
   return success and evaporate.
3. **No key in production**, so no OpenAI spend on a visitor's behalf.

## 3. Architecture

```
  Vercel — static export, $0/mo          Cloudflare R2 — public bucket, $0/mo
┌────────────────────────────────┐     ┌────────────────────────────────────┐
│  /   /layer1   /layer2  /remix │     │  EARTH/ISO/1hz.flac                │
│  + manifest.json               │ ──► │  EARTH/PAD/BOWLS.m4a               │
│  + sessionStore.json           │     │  101 files, 585 MB (built)         │
│  no server, no API, no key     │     │  CORS: GET from the Vercel origin  │
└────────────────────────────────┘     └────────────────────────────────────┘

  Your laptop — unchanged:  npm run dev → /rules, all six routes, writes config/*.json
```

## 4. Tier B: the session store

`/remix` calls `fetch('/api/sessions')` on mount ([useRemix.ts:74](../../../src/components/remix/useRemix.ts))
and derives its whole track pool from the result. On a static export that 404s — and the call
has **no error handling**, so `res.json()` throws unhandled and `loading` never clears. Shipped
as-is, `/remix` is a permanently-spinning page.

But look at what the route actually returns: `loadSessions()` reads
`config/sessions/*.md` — **five files, 20 KB, all tracked in git** — and parses them with the
pure function `parseSessionTimeline`. There is no user state and no I/O that has to happen at
request time. This is build-time data wearing a runtime costume.

**Decision: bake it.** `scripts/build-sessions.mjs` parses the five markdown files into
`src/sessionStore.json`, committed alongside them. A seam mirroring `resolveSampleUrl` —
`loadSessionStore()` — returns the static import when hosted and keeps fetching `/api/sessions`
locally, so uploads still work in dev. The upload control in
[RemixView.tsx:180](../../../src/components/remix/RemixView.tsx) is hidden when hosted.

Committing derived data is a deliberate trade: it costs a regeneration step when sessions
change, and buys one guaranteed-present file for dev, tests, `build:web`, and Vercel alike.
It also fits the pipeline this design already relies on — **authoring locally and committing is
what publishes**, exactly as `config/discovered-rules.json` already works.

*Alternative considered and rejected:* excluding `/remix` from the hosted build. One stash
entry, nothing can break — but it withholds the newest and most finished feature from the only
person who is going to look at this.

## 5. Components / changes

1. **[src/samples.ts](../../../src/samples.ts)** — the audio seam. Reads
   `NEXT_PUBLIC_SAMPLE_BASE_URL`; when set, maps the extension and returns an absolute R2 URL,
   otherwise today's `/api/samples/…` path unchanged.

   ```ts
   const BASE = process.env.NEXT_PUBLIC_SAMPLE_BASE_URL;

   export function resolveSampleUrl(relPath: string): string {
     const p = BASE ? toWebExt(relPath) : relPath;
     const encoded = p.split('/').map(encodeURIComponent).join('/');
     return BASE ? `${BASE}/${encoded}` : `/api/samples/${encoded}`;
   }
   ```

   `toWebExt` maps `.wav`/`.mp3` → `.m4a`, except paths containing an `ISO/` segment which take
   the lossless extension. It must mirror the transcode script exactly, so both import one
   shared rule rather than duplicating it.

2. **`src/sessions.ts`** — the session seam (§4). `loadSessionStore()`: static import when
   hosted, `fetch('/api/sessions')` otherwise. `useRemix` calls this instead of fetching
   directly. Add the error handling the current fetch lacks while here.

3. **`scripts/build-sessions.mjs`** — `config/sessions/*.md` → `src/sessionStore.json`.

4. **[next.config.ts](../../../next.config.ts)** — ✅ done. `BUILD_TARGET=web` is a static-export
   target alongside `electron`, without electron's `trailingSlash` (Vercel resolves clean URLs).

5. **[scripts/build-web.mjs](../../../scripts/build-web.mjs)** — ✅ done. Stashes `src/app/api`
   and `src/app/rules`, clears `.next/dev` first, and **verifies** the restore.

6. **Commit [src/manifest.json](../../../src/manifest.json)** — remove its `.gitignore` entry.
   14 KB of sample paths, statically imported by
   [appStore.ts:3](../../../src/session/appStore.ts). Unlike the session store it **cannot** be
   generated on Vercel, since that needs the 5.9 GB library. Without this the build fails on a
   missing module before anything else is reached.

7. **`scripts/transcode-web.mjs`** — walks `ECOSONIC FILES/`, shells out to ffmpeg, writes
   `web-audio/` mirroring relative paths. FLAC for `ISO/**`, AAC 128 k otherwise. Skips existing
   outputs so an interrupted run resumes.

8. **Upload + CORS** — push `web-audio/` to R2, then one `GET` rule scoped to the Vercel origin.

9. **`.gitignore` / `.vercelignore`** — ignore `web-audio/`; exclude `ECOSONIC FILES/` and
   `web-audio/` from CLI deploys (Hobby caps source uploads at 100 MB).

## 6. Audio: why transcode, measured

The library is 5.9 GB across **101 samples**; the largest is 171.8 MB, and
[Layer.ts:83-85](../../../src/audio/Layer.ts) downloads each file *whole* before it can play a
note. Locally that is a disk read. Over the internet it is a multi-minute wait, and several
loaded layers risk exhausting tab memory (decoded float ≈ 1.3× the WAV).

**Built 2026-08-03** with ffmpeg 8.1.2 — 101 of 101 encoded, none failed:

| | Files | Hosted | Share |
| --- | --- | --- | --- |
| AAC 128 k | 81 | 239.7 MB | 41% |
| FLAC (`ISO/**`) | 20 | 345.8 MB | 59% |
| **Total** | **101** | **585.4 MB** | 5.9% of R2's free tier |

6018 MB → 585 MB, **10.3× overall**. Per-file the range is wide: `BOWLS.wav` 171.8 → 9.7 MB
(17.7×), one FX bed 57.5 → 0.8 MB (73×), while ISO manages only ~4.7×. The **largest single
download is now 19.1 MB** (`ETHER/ISO/33hz.flac`), down from 171.8 MB.

Note the inversion, which held: ISO is a fifth of the files but **59% of the hosted payload**,
because lossless cannot compete with lossy. If size ever becomes a problem, ISO is the only
lever worth pulling.

**Two corrections this run forced.** The library has 101 samples, not the 198 an earlier count
claimed — 97 of those were macOS AppleDouble `._*.wav` sidecars, metadata stubs that
`manifestBuild` already filters and a naive directory walk does not. And the committed manifest
was stale (generated 2026-07-10): it named `EARTH/ELEMENT/ANKLUNG.wav`, which had since moved to
`EARTH/ELEMENT/SUB/`, and missed `AIR/SOUND/MELODY/MELODY 2.wav`. **That is a live bug in the
running app** — a picked sample that 404s — and it surfaced only because a batch job demands
every manifest entry resolve, where the player fails soft on one silent track. Regenerating is
now part of the workflow: `build:manifest` must be re-run and committed when the library changes.

**Why `ISO/**` stays lossless.** That material is isochronic/binaural, where the effect lives
in the inter-channel frequency difference. AAC's joint-stereo (mid/side) coding is designed to
discard inter-channel information it judges inaudible — the one thing this content cannot lose.
Chrome has decoded FLAC since Chrome 56, so the target browser is fine; Stage 3 confirms before
the bulk run, and the fallback is shipping `ISO/**` as original WAVs (still inside the free tier).

## 7. Platform facts (verified against vendor docs, 2026-07-27)

| Fact | Source | Consequence |
| --- | --- | --- |
| R2 free tier: 10 GB storage, 1M Class A, 10M Class B, **egress free** | [R2 pricing](https://developers.cloudflare.com/r2/pricing/) | 585 MB and one listener sit far inside — 5.9% of storage. $0. |
| `r2.dev` is rate-limited, "development purposes" only | [public buckets](https://developers.cloudflare.com/r2/buckets/public-buckets/) | Fine for one tester; custom domain is the upgrade path. |
| R2 CORS via `wrangler r2 bucket cors set` — `AllowedOrigins` / `AllowedMethods` / `AllowedHeaders` / `ExposeHeaders` | [R2 CORS](https://developers.cloudflare.com/r2/buckets/cors/) | One GET rule. |
| Functions cap bodies at **4.5 MB**, all plans | [limits](https://vercel.com/docs/functions/limitations) | Confirms analyze can't be hosted. |
| Hobby protection is **Vercel Authentication only** | [Hobby](https://vercel.com/docs/plans/hobby) | It admits team members, and Hobby has none — it would lock the friend *out*. |
| Hobby is **non-commercial** | [Hobby](https://vercel.com/docs/plans/hobby) | Fine now; revisit if ECOSONIC ships commercially. |
| Hobby **cannot connect to org-owned repos** | [limits](https://vercel.com/docs/limits) | Personal account — already satisfied. |
| CLI deploys cap source at **100 MB / 15,000 files** | [limits](https://vercel.com/docs/limits) | `.vercelignore` mandatory if not deploying via Git. |

## 8. Access control

**None, by decision.** The URL is unlisted and that is sufficient. Recorded so it is not
reopened: Vercel Authentication would lock the friend out; Password Protection and Sharable
Links are Pro-only; Cloudflare Access on a custom domain is the answer if real auth is ever
needed. And plainly — the R2 bucket is public and its base URL ships in the client bundle, so
anyone who opens the app can fetch the audio directly. Signed URLs need a server; out of scope.

## 9. State and prerequisites

| | |
| --- | --- |
| Worktree | `.claude/worktrees/vercel-r2-hosting`, master merged, **496 tests passing (67 files)** |
| ffmpeg | ✅ 8.1.2, `aac` + `flac` encoders verified |
| Git remote | ✅ `origin` → personal, public repo |
| Cloudflare account + R2 bucket | ❌ **the only missing prerequisite** (needed at Stage 5) |

## 10. Staging

1. ✅ **Static export builds.** `npm run build:web` prerenders `/`, `/layer1`, `/layer2` **and
   `/remix`** — 8 pages, no SSR `window`/`AudioContext` crash. The risk the Electron spec
   flagged and never tested does not exist. Two findings are folded into the build script:
   `.next/dev` must be cleared (stale per-route type validators fail the type check), and the
   stash restore must be *verified* — `build-electron.mjs` reports success unconditionally and
   was observed leaving `src/app/api` in `.electron-build-tmp`.
2. **The two seams.** `resolveSampleUrl` env branch + ISO rule; `loadSessionStore` + the
   session bake script. Tests for both. Nothing external needed.
3. **Codec gate.** One pad to AAC, one ISO to FLAC, hand-uploaded to R2, both confirmed
   decoding in Chrome/macOS. Branch the ISO format on the result.
4. **Transcode.** Full library; spot-check ISO and dense pads by ear.
5. **R2.** Upload `web-audio/`, set CORS, verify a range request.
6. **Deploy.** Commit the manifest and session store, push, connect Vercel, set
   `NEXT_PUBLIC_SAMPLE_BASE_URL`.
7. **Smoke test.** The friend loads it in Chrome/macOS and plays a module *and* a remix.

Stages 1–3 are cheap and falsifiable; every expensive step sits behind them.

## 11. Risks

- **`/remix` fails loudly, not gracefully, if the seam is wrong.** No error handling on the
  current fetch. Stage 2 adds it.
- **The stash trick relocates real source.** A crashed build can leave `src/app/api` or
  `src/app/rules` outside the tree; this happened once already. `build-web.mjs` now fails loudly
  with the stash path — if it fires, move files back **by hand**; do *not* `git checkout` those
  paths, which would discard uncommitted work still held in the stash.
- **Remix's WAV export decodes whole samples** and is already flagged in-app as heavy. Hosted,
  those samples arrive over the network first. Expected to work, unmeasured — worth one check
  at Stage 7.
- **Committed derived data drifts.** `src/sessionStore.json` must be regenerated when sessions
  change; a stale one silently serves old rules.
- **`r2.dev` rate limits.** One listener will not notice; a second or third means custom domain.
- **The 2026-07-10 Electron spec is stale** — claims the app is "client-only except one route",
  untrue since analyze/rules/analyses/sessions landed. Out of scope here; do not trust it.

## 12. Out of scope

Analysis or rule editing in production; session *upload* in production; any database; signed
URLs; a custom domain; auth; and the Electron build, which keeps using the original WAVs —
which is why transcodes go to `web-audio/` rather than replacing anything.

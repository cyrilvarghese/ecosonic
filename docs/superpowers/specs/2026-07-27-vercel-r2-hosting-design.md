# ECOSONIC → Vercel + R2 Hosting — Design

**Date:** 2026-07-27
**Status:** Approved (user: "yes vercel and cloudflare look good")
**Goal:** Put the ECOSONIC *instrument* (play / arrange / remix) behind a private URL a
handful of people can open, at $0/month, without changing how authoring works locally.

## Decisions (locked)

| Question | Decision |
| --- | --- |
| Audience | **Private URL, me + a few people.** Not a public product. |
| Immediate target | **One friend testing on a Mac, in Chrome.** Chrome/macOS is the only browser this must work on. Safari is explicitly untested. |
| App host | **Vercel**, serving a **static export** (no server, no serverless functions). |
| Audio host | **Cloudflare R2** public bucket. 10 GB free tier, zero egress fees. |
| Hosted scope | **Instrument only** — `/`, `/layer1`, `/layer2`. Analysis and rule discovery stay local. |
| Web audio format | **AAC 128 kbps**, **except `ISO/**` which stays lossless (FLAC, with a WAV fallback)**. |
| Originals | Untouched. Transcodes land in a separate `web-audio/` folder. |
| R2 exposure | **`r2.dev` subdomain** for this test; custom domain if it outlives the test. |
| Access control | **Unlisted URL, no password** (user: "dont password protect its fine"). |
| Git remote | `origin` → `github.com/cyrilvarghese/ecosonic` — personal account, satisfies Hobby's org restriction. |
| Repo visibility | **Public**, deliberately (user confirmed). Repo visibility does not affect audio exposure either way: `NEXT_PUBLIC_SAMPLE_BASE_URL` ships in the client bundle by definition. |

## Platform facts (verified against vendor docs, 2026-07-27)

| Fact | Source | Consequence here |
| --- | --- | --- |
| R2 free tier: **10 GB-month storage, 1M Class A, 10M Class B ops, egress free** | [R2 pricing](https://developers.cloudflare.com/r2/pricing/) | ~330 MB–1.9 GB of audio and one listener sit far inside every dimension. $0. |
| `r2.dev` public access is **rate-limited and "should only be used for development purposes"** | [R2 public buckets](https://developers.cloudflare.com/r2/buckets/public-buckets/) | Acceptable for one friend testing; a custom domain is the upgrade path, and it is also what unlocks Cloudflare caching and Zero Trust Access. |
| R2 CORS is set per-bucket via dashboard or `wrangler r2 bucket cors set <BUCKET> --file cors.json`, with `AllowedOrigins` / `AllowedMethods` / `AllowedHeaders` / `ExposeHeaders` | [R2 CORS](https://developers.cloudflare.com/r2/buckets/cors/) | One `GET` rule scoped to the Vercel origin. |
| Vercel Functions cap request **and response** bodies at **4.5 MB**, all plans (`FUNCTION_PAYLOAD_TOO_LARGE`) | [Function limits](https://vercel.com/docs/functions/limitations) | Confirms the analyze route could never work hosted — it accepts up to 25 MB. Excluding it is the fix, not a workaround. |
| Hobby Deployment Protection offers **only Vercel Authentication**; Password Protection and Sharable Links are **Pro** | [Hobby plan](https://vercel.com/docs/plans/hobby) | Vercel Authentication admits only accounts on the team — and Hobby has no team members. It would lock the friend *out*. Unlisted URL it is. |
| Hobby is **non-commercial, personal use only** | [Hobby plan](https://vercel.com/docs/plans/hobby) | Fine for this. Revisit if ECOSONIC ever ships commercially. |
| Hobby **cannot connect to Git repositories owned by a Git organization** | [Vercel limits](https://vercel.com/docs/limits) | The GitHub repo must be under a personal account, not an org. |
| CLI deploys cap **source uploads at 100 MB / 15,000 files** on Hobby | [Vercel limits](https://vercel.com/docs/limits) | If deploying via `vercel` CLI rather than Git, a `.vercelignore` excluding the audio folders is mandatory or the deploy fails. |

## Why static export

The app splits cleanly into two halves that want different homes:

- **Playing** (`/`, `/layer1`, `/layer2`) never writes anything. It reaches the filesystem
  through exactly one door: `resolveSampleUrl()` in [src/samples.ts](../../../src/samples.ts).
- **Authoring** (`/rules`, plus the `analyze`, `analyze-text`, `analyses`, `rules` API
  routes) is the entire set of filesystem writers and the only consumer of `OPENAI_API_KEY`.

Verified: every `node:fs` importer in `src/` is either an API route or lives under
`src/rules/`. Drop the authoring half and the remaining app needs no server at all —
so it deploys as static HTML/JS/CSS with the audio fetched cross-origin from R2.

This also sidesteps three hard Vercel blockers rather than solving them:

1. **Request body limit.** `config.analysis.maxUploadBytes` is 25 MB and
   [analyze/route.ts](../../../src/app/api/analyze/route.ts) buffers the whole upload into
   base64; Vercel caps serverless request bodies at 4.5 MB.
2. **Read-only filesystem.** `registry.ts:22` and `analysisStore.ts:27` both `writeFileSync`
   into `config/`; on Vercel those writes silently evaporate per-invocation.
3. **No OpenAI key in production**, so no spend on behalf of visitors.

None of these need fixing, because none of that code ships.

## Architecture

```
  Vercel — static export, $0/mo          Cloudflare R2 — public bucket, $0/mo
┌────────────────────────────────┐     ┌────────────────────────────────────┐
│  /   /layer1   /layer2         │     │  EARTH/ISO/1hz.flac                │
│  HTML + JS + manifest.json     │ ──► │  EARTH/PAD/….m4a                   │
│  no server, no API, no key     │     │  198 files, ~0.5–1.9 GB            │
│                                │     │  CORS: GET from the Vercel origin  │
└────────────────────────────────┘     └────────────────────────────────────┘

  Your laptop — unchanged:  npm run dev → /rules, /api/analyze, writes config/*.json
```

## Components / changes

1. **[src/samples.ts](../../../src/samples.ts)** — the single seam. Reads
   `NEXT_PUBLIC_SAMPLE_BASE_URL`; when set, swaps the audio extension and returns an
   absolute R2 URL, otherwise returns today's `/api/samples/…` path unchanged.

   ```ts
   const BASE = process.env.NEXT_PUBLIC_SAMPLE_BASE_URL;

   export function resolveSampleUrl(relPath: string): string {
     const p = BASE ? toWebExt(relPath) : relPath;
     const encoded = p.split('/').map(encodeURIComponent).join('/');
     return BASE ? `${BASE}/${encoded}` : `/api/samples/${encoded}`;
   }
   ```

   `toWebExt` maps `.wav`/`.mp3` → `.m4a`, except for paths containing an `ISO/` segment,
   which take the lossless extension chosen at the Stage 3 gate (`.flac`, or `.wav`
   unchanged if the fallback triggers). It must mirror exactly what the transcode script
   emits, so the two share one small rule module rather than duplicating the logic. The same
   seam later gains the `ecosonic://` branch for Electron; the three targets are three
   return values.

2. **[next.config.ts](../../../next.config.ts)** — `BUILD_TARGET=web` becomes a second
   static-export target alongside `electron`: `output: 'export'`, `images: { unoptimized: true }`.
   No `trailingSlash` for web (Vercel serves clean URLs natively); electron keeps it.

3. **`scripts/build-web.mjs`** — generalizes the stash-and-restore trick already proven in
   [scripts/build-electron.mjs](../../../scripts/build-electron.mjs). Temporarily relocates
   **both** `src/app/api` and `src/app/rules` out of the tree, runs `next build`, restores
   them in a `finally`. Route handlers and the authoring page cannot be statically exported;
   `npm run dev` is untouched.

4. **Commit [src/manifest.json](../../../src/manifest.json)** — remove the `src/manifest.json`
   entry from `.gitignore`. The file is 14 KB of sample paths (no audio), statically imported by
   [src/session/appStore.ts:3](../../../src/session/appStore.ts). Vercel builds from a git
   clone, so while it is ignored the build fails on a missing module before anything else
   can go wrong.

5. **`scripts/transcode-web.mjs`** — walks `ECOSONIC FILES/`, shells out to ffmpeg, writes
   into `web-audio/` preserving relative paths. FLAC for `ISO/**`, AAC 128 k for everything
   else. Skips outputs that already exist, so a run interrupted partway resumes. Also
   rewrites a web copy of the manifest's `bytes` values to match the transcoded sizes.

6. **Upload + CORS** — push `web-audio/` to the R2 bucket (`rclone` or
   `wrangler r2 object put`), then a bucket CORS rule allowing `GET` from the Vercel origin.

7. **`.gitignore`** — add `web-audio/` (derived artifacts, never committed).

8. **`.vercelignore`** — exclude `ECOSONIC FILES/` and `web-audio/`. Only strictly required
   for `vercel` CLI deploys, where Hobby caps source uploads at 100 MB, but cheap insurance
   against ever accidentally pushing 6 GB at the platform.

## Data flow (audio)

`Layer.load()` → `fetch(resolveSampleUrl(path))` → `https://<r2-host>/EARTH/PAD/x.m4a`
→ `res.arrayBuffer()` → `ctx.decodeAudioData(arr)` → Web Audio.

No change to the audio engine. `decodeAudioData` decodes whatever container the browser
supports, so a format swap is invisible to [src/audio/Layer.ts](../../../src/audio/Layer.ts)
— provided the chosen format really is supported on the target browser, which is what the
Stage 3 codec gate below exists to establish.

## Why transcode at all

The library is 5.9 GB across 198 audio files — the largest are ~170 MB, and
[Layer.ts:83-85](../../../src/audio/Layer.ts) downloads each file *in full* before it can
play a note. Off local disk that is instant; over the internet it is a multi-minute wait and
a real risk of exhausting tab memory once several layers are loaded (decoded float samples
run ~1.3× the WAV size). AAC 128 k is roughly an 18× reduction — a ~10-minute bed becomes
~9 MB, which is a few seconds to first sound.

**`ISO/**` is the exception — and it is not a rounding error: 40 files, 1.6 GB, 27% of the
library.** That material is isochronic/binaural, where the effect lives entirely in the
inter-channel frequency difference. AAC's joint-stereo (mid/side) coding is specifically
designed to discard inter-channel information it judges inaudible, which is the one thing
this content cannot afford to lose. Those files are pure low-frequency tones, so lossless
compression is unusually effective on them.

**Codec support on the target browser.** Chrome has decoded FLAC since Chrome 56 and AAC for
far longer, on the same internal decoder across platforms — so both formats are expected to
work in Chrome/macOS. Because the cost of being wrong is a wasted multi-hour transcode, this
still gets confirmed empirically before the bulk run, but as a smoke test rather than a
decision point:

> **Gate (Stage 3):** transcode one pad to AAC and one ISO file to FLAC, put both on R2 by
> hand, and confirm `decodeAudioData` resolves for each in Chrome on the friend's Mac.
> **Fallback if FLAC fails:** ship `ISO/**` as the original WAVs — universally decodable, and
> 1.6 GB + ~240 MB of AAC still sits comfortably inside R2's 10 GB free tier.

Safari is a different matter: it only gained FLAC playback in Safari 13 via Core Media, and
whether `decodeAudioData` accepts it there is undocumented. Out of scope — if this ever needs
to work in Safari, re-run this gate there before assuming it does.

## Access control

**Decided: none.** The URL is unlisted and that is deemed sufficient — no password, no auth
layer, no gate of any kind. This is the simplest branch and removes work rather than adding it.

Recorded for the future, since the options are narrower than they look: Vercel Authentication
is Hobby's only protection and would *lock the friend out* rather than let him in (it admits
team members, and Hobby has none); Password Protection and Sharable Links are Pro-only; and
Cloudflare Access on a custom domain is the real answer if this ever needs actual auth.

Stated plainly, so nobody is surprised later: the R2 bucket is public and its base URL ships
inside the client JS bundle, so anyone who opens the app can read where the audio lives and
fetch it directly. Signed URLs would require a server and are out of scope.

## Prerequisites (verified missing as of 2026-07-27)

- **ffmpeg** — not on PATH. `winget install Gyan.FFmpeg`.
- ~~**git remote**~~ — **done.** `origin` → `github.com/cyrilvarghese/ecosonic`, currently
  empty and **public**. Personal account, so Hobby's org restriction is satisfied. Verified
  safe to push: no `.env*` file is tracked or has ever been committed, `.env.local` is
  ignored at `.gitignore:25`, and no tracked file contains a real key.
- **Cloudflare account** with an R2 bucket created.
- **A Mac running Chrome** to run the codec gate — the friend's machine is fine, it is two
  page loads.

## Staging

1. **Stage 1 — prove the static export.** `BUILD_TARGET=web` + stash script → does
   `next build` produce `out/`? Fail fast, before any transcoding work.
2. **Stage 2 — the seam.** `resolveSampleUrl()` + env var, with tests covering both branches
   and the ISO extension rule.
3. **Stage 3 — codec gate.** Transcode one pad to AAC and one ISO file to FLAC, hand-upload
   both to R2, confirm both decode in Chrome on the friend's Mac. Branch the ISO format on
   the result.
4. **Stage 4 — transcode.** Run the script over the full library; spot-check the ISO output
   and a couple of dense pads against the originals by ear.
5. **Stage 5 — R2.** Upload `web-audio/`, set the CORS rule, verify a range request.
6. **Stage 6 — deploy.** Commit the manifest, push to a private personal GitHub repo, connect
   Vercel, set `NEXT_PUBLIC_SAMPLE_BASE_URL`, ship the link.
7. **Stage 7 — smoke test.** The friend loads the app in Chrome/macOS and plays a module end
   to end.

Stages 1–3 are all cheap and all falsifiable; every expensive step is behind them.

## Risks & mitigations

- **The static export has never been run.** The July Electron spec flagged that module-level
  `window`/`AudioContext` access would crash `next build`, and it was never proven either
  way since that build was never executed. Mitigation: Stage 1 exists precisely to find out
  first, and any offending top-level access moves into an effect.
- **The 2026-07-10 Electron spec is now stale** — it asserts the app is "client-only except
  one route", which stopped being true when the analysis and rules routes landed. Its build
  script would today produce a desktop app silently missing those features. Out of scope to
  fix here, but it must not be trusted as-is.
- **Autoplay gesture policy** — low risk now that the target is Chrome/macOS, which enforces
  the same policy as the Chrome/Windows this app was built against.
  [AudioEngine.ts:84](../../../src/audio/AudioEngine.ts) already creates the context lazily
  and calls `resume()`. Stage 7 confirms; if it ever does misbehave, the fix is ensuring
  `ensure()` first runs inside a real user-gesture handler.
- **`r2.dev` is rate-limited by design.** One listener will not notice; the moment a second
  or third person is added, move to a custom domain.
- **Lossy artifacts on ambient material.** Mitigated by the ISO carve-out and a listening
  spot-check in Stage 4; the originals are never modified, so re-encoding at a higher bitrate
  is always available.
- **Transcoding ~6 GB is a long single run.** Mitigated by skip-if-exists resumability.
- **Manifest `bytes` drift** — the committed manifest records WAV sizes. Cosmetic unless the
  UI surfaces it; the transcode script rewrites the web copy.

## What does not change

The entire local authoring workflow. `npm run dev` still serves `/rules`, still analyzes
tracks against OpenAI, still writes `config/discovered-rules.json` — which is already tracked
in git. So authoring locally and committing *is* the publishing mechanism for new grammar.
The split is a pipeline, not a compromise.

## Out of scope

Analysis or rule editing in production; any database; signed URLs; a custom domain; auth
beyond an unlisted URL; and the Electron build, which is unaffected — it keeps using the
original WAVs, which is why transcodes go to a separate `web-audio/` folder rather than
replacing anything.

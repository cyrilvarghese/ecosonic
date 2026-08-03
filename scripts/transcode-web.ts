// Build the hosted copy of the sample library.
//
// The originals are never touched: output goes to a separate web-audio/ tree mirroring the source
// layout, so the Electron build (which wants the untouched WAVs) and the web build can coexist.
//
// Naming comes from src/webAudioExt.ts — the same rule resolveSampleUrl uses to ask for these
// files, so the two cannot drift apart. AAC 128k everywhere except ISO/, which stays lossless.
//
// Resumable by design: an existing non-empty output is skipped, so an interrupted run picks up
// where it stopped. That matters — this is ~6 GB through ffmpeg.
//
//   npm run transcode:web
//   ECOSONIC_AUDIO_DIR=/path/to/library ECOSONIC_WEB_AUDIO_DIR=/path/to/out npm run transcode:web

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { isLossless, toWebExt } from '../src/webAudioExt';
import manifestJson from '../src/manifest.json';

const SRC = process.env.ECOSONIC_AUDIO_DIR ?? path.join(process.cwd(), 'ECOSONIC FILES');
const OUT = process.env.ECOSONIC_WEB_AUDIO_DIR ?? path.join(process.cwd(), 'web-audio');
// ffmpeg is single-threaded for these encoders, so a small pool is most of the win.
const CONCURRENCY = Number(process.env.ECOSONIC_TRANSCODE_JOBS ?? 4);

const mb = (bytes: number): string => (bytes / 1048576).toFixed(1);

/** Every sample the player can ask for, straight from the manifest.
 *
 *  Deliberately NOT a directory walk. The app never scans the disk — it reads this manifest — so
 *  the manifest *is* the set of files that can ever be requested. Re-deriving it here would
 *  duplicate `manifestBuild`'s rules and let them drift: an earlier walk-based version swept up
 *  the library's 97 macOS AppleDouble `._*.wav` sidecars, which are metadata stubs, not audio.
 *  Reading the manifest makes the hosted set 1:1 with what resolveSampleUrl will fetch. */
function manifestPaths(): string[] {
  const byElement = manifestJson as Record<string, Record<string, { path: string }[]>>;
  return Object.values(byElement)
    .flatMap((categories) => Object.values(categories).flat())
    .map((sample) => sample.path)
    .sort();
}

function ffmpeg(src: string, out: string, lossless: boolean): Promise<void> {
  // No shell: the library path contains a space, and arg arrays sidestep quoting entirely.
  const encoder = lossless ? ['-c:a', 'flac'] : ['-c:a', 'aac', '-b:a', '128k'];
  const args = ['-hide_banner', '-loglevel', 'error', '-y', '-i', src, ...encoder, out];
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'inherit'] });
    proc.on('error', reject);
    proc.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code} on ${src}`)),
    );
  });
}

async function main() {
  if (!existsSync(SRC)) throw new Error(`source library not found at ${SRC}`);

  const rels = manifestPaths();
  console.log(`[transcode] ${rels.length} samples from the manifest, sourced from ${SRC}`);

  let done = 0, skipped = 0, srcBytes = 0, outBytes = 0;
  const failures: string[] = [];

  const work = async (rel: string) => {
    const src = path.join(SRC, rel.split('/').join(path.sep));
    const out = path.join(OUT, toWebExt(rel).split('/').join(path.sep));

    // Everything is inside the try: a manifest can outlive the file it names, and one absent
    // sample must be reported at the end rather than taking the whole run down with it.
    try {
      await mkdir(path.dirname(out), { recursive: true });

      const before = (await stat(src)).size;
      srcBytes += before;

      // Resume: a previous run already produced this one.
      //
      // The size is awaited into a variable before the `+=`. Writing
      // `outBytes += (await stat(out)).size` reads outBytes, suspends at the await, and lets
      // another worker's write land in between — then overwrites it. Lost updates, and a total
      // that differs run to run over the same files.
      if (existsSync(out)) {
        const existing = (await stat(out)).size;
        if (existing > 0) {
          outBytes += existing;
          skipped += 1;
          return;
        }
      }

      await ffmpeg(src, out, isLossless(rel));
      const after = (await stat(out)).size;
      outBytes += after;
      done += 1;
      const n = done + skipped;
      console.log(
        `[${String(n).padStart(3)}/${rels.length}] ${rel} — ${mb(before)} → ${mb(after)} MB` +
          ` (${(before / after).toFixed(1)}x)`,
      );
    } catch (e) {
      failures.push(`${rel}: ${(e as Error).message}`);
    }
  };

  // Fixed-size pool: each worker pulls the next index until the list is exhausted.
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, rels.length) }, async () => {
      while (next < rels.length) await work(rels[next++]);
    }),
  );

  console.log(
    `\n[transcode] ${done} encoded, ${skipped} already present, ${failures.length} failed\n` +
      `[transcode] ${mb(srcBytes)} MB source → ${mb(outBytes)} MB hosted` +
      ` (${(srcBytes / outBytes).toFixed(1)}x smaller)\n` +
      `[transcode] written to ${OUT}`,
  );
  if (failures.length) {
    console.error('\n[transcode] failures:\n  ' + failures.join('\n  '));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

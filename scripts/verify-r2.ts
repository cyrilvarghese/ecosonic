// Check that every sample the player can request is actually fetchable from the public bucket.
//
// Distinct from `upload:r2`, which asks the S3 API whether an object exists. This asks the public
// URL the browser will use — so it also proves public access, CORS and naming are right. Those are
// different systems agreeing: the uploader could store a key the player spells differently (an `&`
// encoded one way and not the other) and only this catches it.
//
//   npm run verify:r2

import { toWebExt } from '../src/webAudioExt';
import manifestJson from '../src/manifest.json';

const BASE = process.env.NEXT_PUBLIC_SAMPLE_BASE_URL;
const CONCURRENCY = 12;

function manifestPaths(): string[] {
  const byElement = manifestJson as Record<string, Record<string, { path: string }[]>>;
  return Object.values(byElement).flatMap((c) => Object.values(c).flat()).map((s) => s.path);
}

/** Exactly what resolveSampleUrl builds, so this checks the real URL and not an approximation. */
const urlFor = (relPath: string): string =>
  `${BASE!.replace(/\/+$/, '')}/${toWebExt(relPath).split('/').map(encodeURIComponent).join('/')}`;

async function main() {
  if (!BASE) throw new Error('NEXT_PUBLIC_SAMPLE_BASE_URL is not set — add it to .env.local');

  const paths = manifestPaths();
  console.log(`[verify] ${paths.length} samples against ${BASE}`);

  let ok = 0, bytes = 0;
  const bad: string[] = [];

  let next = 0;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (next < paths.length) {
      const rel = paths[next++];
      const url = urlFor(rel);
      try {
        const res = await fetch(url, { method: 'HEAD' });
        if (res.ok) {
          ok += 1;
          bytes += Number(res.headers.get('content-length') ?? 0);
        } else {
          bad.push(`${res.status} ${rel}`);
        }
      } catch (e) {
        bad.push(`${rel}: ${(e as Error).message}`);
      }
    }
  }));

  console.log(`[verify] ${ok}/${paths.length} reachable, ${(bytes / 1048576).toFixed(1)} MB total`);
  if (bad.length) {
    console.error(`[verify] ${bad.length} unreachable:\n  ` + bad.slice(0, 20).join('\n  '));
    process.exit(1);
  }
  console.log('[verify] every sample the player can ask for is served.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

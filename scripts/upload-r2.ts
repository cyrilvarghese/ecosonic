// Push the hosted copy of the library (web-audio/) to the R2 bucket.
//
// Keys mirror the manifest paths exactly, with the extension the transcode chose — so
// `${NEXT_PUBLIC_SAMPLE_BASE_URL}/${toWebExt(manifestPath)}` resolves for every sample. The
// manifest drives the list for the same reason the transcode does: it is the only set of paths
// the player can ever request.
//
// Resumable: an object already in the bucket with the right size is skipped, so an interrupted
// run costs nothing to repeat.
//
// Credentials come from .env.local (gitignored) and are never logged.
//
//   npm run upload:r2          # upload what is missing
//   npm run upload:r2 -- --dry # list what would be uploaded, touch nothing

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { toWebExt } from '../src/webAudioExt';
import manifestJson from '../src/manifest.json';
import { loadEnv, required } from './loadEnv';

const DRY = process.argv.includes('--dry');
const WEB_AUDIO = process.env.ECOSONIC_WEB_AUDIO_DIR ?? path.join(process.cwd(), 'web-audio');
const CONCURRENCY = Number(process.env.ECOSONIC_UPLOAD_JOBS ?? 6);

// decodeAudioData sniffs the bytes, but a correct type keeps range requests and caches honest.
const MIME: Record<string, string> = { '.m4a': 'audio/mp4', '.flac': 'audio/flac' };

function manifestKeys(): string[] {
  const byElement = manifestJson as Record<string, Record<string, { path: string }[]>>;
  return Object.values(byElement)
    .flatMap((categories) => Object.values(categories).flat())
    .map((sample) => toWebExt(sample.path))
    .sort();
}

async function main() {
  loadEnv();

  const bucket = required('R2_BUCKET');
  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${required('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: required('R2_ACCESS_KEY_ID'),
      secretAccessKey: required('R2_SECRET_ACCESS_KEY'),
    },
  });

  const keys = manifestKeys();
  console.log(`[upload] ${keys.length} objects → r2://${bucket}${DRY ? '  (dry run)' : ''}`);

  let sent = 0, skipped = 0, sentBytes = 0;
  const failures: string[] = [];

  const work = async (key: string) => {
    const local = path.join(WEB_AUDIO, key.split('/').join(path.sep));
    try {
      const size = (await stat(local)).size;

      // Already there at the same size? Nothing to do. Size is enough here: these objects are
      // immutable once transcoded, so same-name-same-size means same bytes.
      try {
        const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        if (head.ContentLength === size) {
          skipped += 1;
          return;
        }
      } catch {
        // Not found — fall through and upload.
      }

      if (DRY) {
        console.log(`  would upload ${key} (${(size / 1048576).toFixed(1)} MB)`);
        sent += 1;
        sentBytes += size;
        return;
      }

      await client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: createReadStream(local),
        ContentLength: size,
        ContentType: MIME[path.extname(key).toLowerCase()] ?? 'application/octet-stream',
        // Transcoded audio never changes under the same name; let browsers keep it.
        CacheControl: 'public, max-age=31536000, immutable',
      }));

      sent += 1;
      sentBytes += size;
      console.log(`[${String(sent + skipped).padStart(3)}/${keys.length}] ${key} — ${(size / 1048576).toFixed(1)} MB`);
    } catch (e) {
      failures.push(`${key}: ${(e as Error).message}`);
    }
  };

  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, keys.length) }, async () => {
      while (next < keys.length) await work(keys[next++]);
    }),
  );

  console.log(
    `\n[upload] ${sent} uploaded, ${skipped} already present, ${failures.length} failed` +
      `\n[upload] ${(sentBytes / 1048576).toFixed(1)} MB transferred`,
  );
  if (failures.length) {
    console.error('\n[upload] failures:\n  ' + failures.join('\n  '));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

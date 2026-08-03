import { toWebExt } from './webAudioExt';

// The single place that turns a manifest path into a playable URL.
//
// Local dev serves the untouched library off disk through the /api/samples route. Hosted, there
// is no route to serve it — the app is a static export — so audio comes from R2 under the names
// scripts/transcode-web.ts gave it. `toWebExt` is that naming rule, shared with the transcode and
// upload scripts so the three cannot disagree about a filename.
//
// Swap this for a file:// scheme when wrapping in Electron later.
//
// The env var is read inside the function rather than captured at module scope: Next inlines
// NEXT_PUBLIC_* wherever it appears, and reading here keeps both branches reachable in tests.
export function resolveSampleUrl(relPath: string): string {
  const base = process.env.NEXT_PUBLIC_SAMPLE_BASE_URL;
  const encoded = (base ? toWebExt(relPath) : relPath)
    .split('/')
    .map(encodeURIComponent)
    .join('/');
  return base ? `${base.replace(/\/+$/, '')}/${encoded}` : `/api/samples/${encoded}`;
}

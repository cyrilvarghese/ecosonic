// The single rule mapping a library path to its hosted counterpart.
//
// Two callers must agree exactly or the player 404s: `scripts/transcode-web.ts` names the files
// it writes, and `resolveSampleUrl` asks R2 for them. Keeping the rule here means they cannot
// drift apart.
//
// Why ISO is the exception: that material is isochronic/binaural, where the effect lives in the
// frequency difference *between* channels. AAC's joint-stereo coding is designed to discard
// inter-channel information it judges inaudible — precisely what this content cannot lose. It
// costs ~4x the bytes of AAC and is worth it for 40 files.

const LOSSLESS_SEGMENT = 'ISO';

/** True when a path's audio must survive intact rather than be encoded lossily. */
export function isLossless(relPath: string): boolean {
  return relPath.split('/').includes(LOSSLESS_SEGMENT);
}

/** `EARTH/PAD/BOWLS.wav` → `EARTH/PAD/BOWLS.m4a`; `EARTH/ISO/1hz.wav` → `EARTH/ISO/1hz.flac`. */
export function toWebExt(relPath: string): string {
  const ext = isLossless(relPath) ? '.flac' : '.m4a';
  return relPath.replace(/\.(wav|mp3|mpeg)$/i, ext);
}

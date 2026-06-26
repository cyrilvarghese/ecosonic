export type SourceKind = 'buffer' | 'stream';

/** Small files decode fully (gapless); large files stream (low memory). */
export function chooseSourceKind(bytes: number, thresholdBytes: number): SourceKind {
  return bytes < thresholdBytes ? 'buffer' : 'stream';
}

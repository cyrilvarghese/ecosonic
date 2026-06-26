// The single place that turns a manifest path into a playable URL.
// Swap this for a file:// scheme when wrapping in Electron later.
export function resolveSampleUrl(relPath: string): string {
  const encoded = relPath.split('/').map(encodeURIComponent).join('/');
  return `/api/samples/${encoded}`;
}

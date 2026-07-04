/** Equal-ish-power cosine crossfade across a bridge overlap window [0, overlapSec]. */
export function crossfade(tInBridgeSec: number, overlapSec: number): { out: number; in: number } {
  if (overlapSec <= 0) return { out: 0, in: 1 };
  const x = Math.min(1, Math.max(0, tInBridgeSec / overlapSec));
  const inc = 0.5 * (1 - Math.cos(Math.PI * x)); // 0→1
  return { out: 1 - inc, in: inc };
}

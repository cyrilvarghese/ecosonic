import type { RegionTiming } from '@/arrange/types';

export const secToPx = (sec: number, pxPerSec: number): number => sec * pxPerSec;
export const pxToSec = (px: number, pxPerSec: number): number => px / pxPerSec;

export const clampOverlap = (overlapSec: number, maxOverlapSec: number): number =>
  Math.min(maxOverlapSec, Math.max(0, overlapSec));

/** Clamp a region into [bounds.min, bounds.max], preserving at least minWidthSec. */
export function clampRegion(
  r: RegionTiming,
  bounds: { min: number; max: number },
  minWidthSec: number,
): RegionTiming {
  const enterSec = Math.min(Math.max(r.enterSec, bounds.min), bounds.max - minWidthSec);
  const exitSec = Math.min(Math.max(r.exitSec, enterSec + minWidthSec), bounds.max);
  return { ...r, enterSec, exitSec };
}

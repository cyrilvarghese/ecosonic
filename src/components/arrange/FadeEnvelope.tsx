import type { TemplateRegion } from '@/arrange/types';
import { regionEnvAt } from '@/arrange/regionEnv';
import { config } from '@/config';

const { trackMinDb, trackMaxDb } = config.audio.volume;

/** Map a track's dB ceiling onto the drawable height (0..1); floored so the line stays visible even
 *  at the bottom of the range. */
export const ceilingFrac = (db: number) =>
  Math.max(0.08, Math.min(1, (db - trackMinDb) / (trackMaxDb - trackMinDb)));

/** The volume line over one region: silence at the edges, rising through the fade-in, held at the
 *  track's ceiling, falling through the fade-out.
 *
 *  Sampled from `regionEnvAt` — the same function the scheduler drives the live gain with and the
 *  offline renderer bakes into its curve — so the line is what you hear rather than a drawing of
 *  what it ought to be. Shared by Layer Two's ModuleDesigner and the remix timeline; they differ
 *  only in `stroke`, because one draws dark-on-pale and the other light-on-saturated. */
export function FadeEnvelope({
  region, ceilFrac, stroke = 'rgba(0,0,0,0.95)', fill = 'none', dots = true,
}: {
  region: TemplateRegion;
  /** 0..1 — how high the held level sits, i.e. the track's volume ceiling. */
  ceilFrac: number;
  stroke?: string;
  /** Shades the area under the curve — the path runs silence-to-silence, so SVG closes it along the
   *  bottom and the fill is exactly what the region contributes. 'none' leaves it a bare line. */
  fill?: string;
  /** Breakpoint dots. Useful on a tall lane, noise on a thin one. */
  dots?: boolean;
}) {
  const dur = region.exitSec - region.enterSec;
  if (dur <= 0) return null;
  // env 0 → y90 (bottom), 1 → y10 (top); the hold level is scaled by ceilFrac so the automation
  // tops out at the track's volume ceiling rather than the full lane height.
  const Y = (env: number) => (90 - ceilFrac * env * 80).toFixed(1);
  // Piecewise, with exact breakpoints: cosine samples across each fade, straight hold between,
  // and a true vertical edge when a fade is 0 (BASS enter, spanning NOISE exit) — so the line
  // is exactly what the audio does, not a uniform-sampling approximation.
  const X = (s: number) => (((s - region.enterSec) / dur) * 100).toFixed(2);
  const K = 24;
  const pts: string[] = [`0 ${Y(0)}`];
  if (region.fadeInSec > 0) {
    for (let j = 1; j <= K; j++) {
      const s = region.enterSec + (j / K) * region.fadeInSec;
      pts.push(`${X(s)} ${Y(regionEnvAt(region, Math.min(s, region.exitSec)))}`);
    }
  } else {
    pts.push(`0 ${Y(1)}`); // no fade-in: vertical rise at the left edge
  }
  const foStart = region.exitSec - region.fadeOutSec;
  if (region.fadeOutSec > 0) {
    pts.push(`${X(Math.max(foStart, region.enterSec))} ${Y(1)}`);
    for (let j = 1; j <= K; j++) {
      const s = foStart + (j / K) * region.fadeOutSec;
      pts.push(`${X(s)} ${Y(regionEnvAt(region, Math.min(s, region.exitSec - 1e-6)))}`);
    }
    pts.push(`100 ${Y(0)}`);
  } else {
    pts.push(`100 ${Y(1)}`, `100 ${Y(0)}`); // no fade-out: vertical drop at the right edge
  }
  const bps: Array<[number, number]> = [
    [0, 0],
    [Math.min(1, region.fadeInSec / dur) * 100, 1],
    [(1 - Math.min(1, region.fadeOutSec / dur)) * 100, 1],
    [100, 0],
  ];
  return (
    <svg
      data-testid="fade-envelope"
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden
    >
      <path d={`M${pts.join(' L')}`} fill={fill} stroke={stroke}
        strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      {/* zero-length round-cap subpaths render as circular dots even under non-uniform scale */}
      {dots && (
        <path d={bps.map(([x, e]) => `M${x.toFixed(2)} ${Y(e)} l0.01 0`).join(' ')} fill="none"
          stroke={stroke} strokeWidth={5.5} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      )}
    </svg>
  );
}

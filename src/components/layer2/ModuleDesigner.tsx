'use client';
import { useRef } from 'react';
import type { ArrTrack, TemplateRegion } from '@/arrange/types';
import { useArrangement } from '@/arrange/arrangementStore';
import { clampRegion } from '@/arrange/geometry';
import { regionEnvAt } from '@/arrange/regionEnv';
import { heights } from '@/components/WaveformStrip';
import { Slider } from '@/components/ui/slider';
import { config } from '@/config';

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const { trackMinDb, trackMaxDb } = config.audio.volume;
/** Map a track's dB ceiling onto the lane's drawable height (0..1); floored so the line stays visible. */
const ceilingFrac = (db: number) =>
  Math.max(0.08, Math.min(1, (db - trackMinDb) / (trackMaxDb - trackMinDb)));

/** One module: every handed-off track as a draggable clip on a [0, moduleSeconds] timeline,
 *  with a single playhead sweeping across all lanes. */
export function ModuleDesigner({
  tracks,
  regions,
  trackDurations,
  positionSec,
  showVolume = false,
}: {
  tracks: ArrTrack[];
  regions: TemplateRegion[];
  trackDurations: Record<string, number>;
  positionSec: number;
  /** Overlay each clip's volume automation line on the track visualization. */
  showVolume?: boolean;
}) {
  const D = config.layerTwo.moduleSeconds;

  return (
    <div className="relative flex flex-col gap-1.5">
      <div className="flex gap-3 px-4 text-[11px] tabular-nums text-muted-foreground">
        <span className="w-28 shrink-0" />
        <span className="flex flex-1 justify-between">
          <span>0:00</span><span>{clock(D / 2)}</span><span>{clock(D)}</span>
        </span>
        <span className="w-40 shrink-0 text-center">volume</span>
        <span className="w-24 shrink-0">played / total</span>
      </div>

      {tracks.map((track) => (
        <ClipRow
          key={track.id}
          track={track}
          region={regions.find((r) => r.trackId === track.id) ?? null}
          total={trackDurations[track.id]}
          D={D}
          showVolume={showVolume}
        />
      ))}

      {/* single playhead across every lane — aligned to the timeline column */}
      <div className="pointer-events-none absolute inset-0 z-20 flex gap-3 px-4">
        <div className="w-28 shrink-0" />
        <div className="relative flex-1">
          <div
            className="absolute top-0 bottom-0 w-[2px] -translate-x-1/2 rounded bg-[var(--accent-ink)]"
            style={{ left: `${Math.min(100, (positionSec / D) * 100)}%` }}
          >
            <div className="absolute -top-1 left-1/2 h-3 w-3 -translate-x-1/2 rounded-full bg-[var(--accent-ink)]" />
          </div>
        </div>
        <div className="w-40 shrink-0" />
        <div className="w-24 shrink-0" />
      </div>
    </div>
  );
}

function ClipRow({
  track,
  region,
  total,
  D,
  showVolume,
}: {
  track: ArrTrack;
  region: TemplateRegion | null;
  total: number | undefined;
  D: number;
  showVolume: boolean;
}) {
  const laneRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ kind: 'left' | 'right' | 'move'; startX: number; enter: number; exit: number; pxPerSec: number } | null>(null);
  const updateModuleRegion = useArrangement((s) => s.updateModuleRegion);
  const setTrackCeilingDb = useArrangement((s) => s.setTrackCeilingDb);

  const begin = (kind: 'left' | 'right' | 'move') => (e: React.PointerEvent) => {
    if (!region || !laneRef.current) return;
    const rect = laneRef.current.getBoundingClientRect();
    drag.current = { kind, startX: e.clientX, enter: region.enterSec, exit: region.exitSec, pxPerSec: rect.width / D };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    e.stopPropagation();
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || !region) return;
    const dSec = (e.clientX - d.startX) / d.pxPerSec;
    if (d.kind === 'move') {
      const shift = Math.max(-d.enter, Math.min(D - d.exit, dSec));
      updateModuleRegion(track.id, { enterSec: d.enter + shift, exitSec: d.exit + shift });
    } else {
      const enter = d.kind === 'left' ? d.enter + dSec : d.enter;
      const exit = d.kind === 'right' ? d.exit + dSec : d.exit;
      const c = clampRegion(
        { enterSec: enter, exitSec: exit, fadeInSec: region.fadeInSec, fadeOutSec: region.fadeOutSec },
        { min: 0, max: D },
        5,
      );
      updateModuleRegion(track.id, { enterSec: c.enterSec, exitSec: c.exitSec });
    }
  };
  const end = (e: React.PointerEvent) => {
    drag.current = null;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* noop */ }
  };

  const clipDur = region ? region.exitSec - region.enterSec : 0;
  const played = total ? Math.min(clipDur, total) : clipDur;
  const partial = total != null && clipDur < total;
  // Sample shorter than the clip → it loops. Show the repeats as segments so the engineer
  // can see how many times it plays (the last segment is a partial repeat when it doesn't fit evenly).
  const loops = total != null && total > 0 && clipDur > total + 0.5 ? Math.ceil(clipDur / total) : 1;
  // Draw one waveform per loop (identical shapes = it loops). Cap the divider count so a very short
  // sample in a long clip doesn't become a picket fence — the ×N readout still carries the count.
  const segmented = loops > 1 && loops <= 40;
  const unit = segmented ? total! : clipDur;
  const readout =
    total == null ? `${clock(clipDur)} / …`
    : loops > 1 ? `${clock(total)} ×${loops}`
    : `${clock(played)} / ${clock(total)}`;

  return (
    <div className="flex items-center gap-3 rounded-[var(--radius-md)] border border-border bg-card px-4 py-2">
      <div className="w-28 shrink-0">
        <div className="label">{track.category}</div>
        <div className="truncate text-sm text-foreground">{track.sample.name}</div>
      </div>
      <div ref={laneRef} className="relative h-9 flex-1 overflow-hidden rounded-md bg-muted">
        {region && (
          <div
            className="absolute inset-y-1 flex touch-none select-none rounded-[6px] shadow-sm"
            style={{
              left: `${(region.enterSec / D) * 100}%`,
              width: `${((region.exitSec - region.enterSec) / D) * 100}%`,
              background: 'var(--accent-ink)',
            }}
            onPointerDown={begin('move')}
            onPointerMove={move}
            onPointerUp={end}
            title={
              loops > 1
                ? `${clock(region.enterSec)} – ${clock(region.exitSec)} · loops ${loops}× (${clock(total!)} each)`
                : `${clock(region.enterSec)} – ${clock(region.exitSec)}`
            }
          >
            {/* Texture: the sample's stylized waveform, repeated once per loop — identical shapes
                show it looping N×; the last repeat is a partial (prefix) when it doesn't fit evenly. */}
            <div className="pointer-events-none absolute inset-0 flex overflow-hidden rounded-[6px]">
              {Array.from({ length: segmented ? loops : 1 }).map((_, i) => {
                const segSec = Math.min(unit, clipDur - i * unit);
                const pts = Math.max(16, Math.min(240, Math.round(segSec / 1.5)));
                // Audio-editor look: a filled envelope mirrored around the mid-line. Smooth the
                // hash noise into an organic contour and ride it on a slow loudness swell.
                const raw = heights(track.sample.name, pts);
                const amps = raw.map((_, j) => {
                  let s = 0, n = 0;
                  for (let k = -2; k <= 2; k++) {
                    if (j + k >= 0 && j + k < raw.length) { s += raw[j + k]; n++; }
                  }
                  const swell = 0.55 + 0.45 * Math.abs(Math.sin((j / raw.length) * Math.PI * 2.5 + raw[0] * 9));
                  return Math.max(0.06, (s / n) * swell);
                });
                const top = amps.map((a, x) => `L${x} ${(50 - a * 45).toFixed(1)}`).join(' ');
                const bottom = amps
                  .map((_, x) => {
                    const j = amps.length - 1 - x;
                    return `L${j} ${(50 + amps[j] * 45).toFixed(1)}`;
                  })
                  .join(' ');
                const d = `M0 50 ${top} ${bottom} Z`;
                return (
                  <div
                    key={i}
                    style={{ width: `${(segSec / clipDur) * 100}%` }}
                    className={`h-full ${i > 0 ? 'border-l-2 border-white/90' : ''} ${i % 2 === 1 ? 'bg-black/30' : ''}`}
                  >
                    <svg className="h-full w-full" viewBox={`0 0 ${amps.length - 1} 100`} preserveAspectRatio="none">
                      <path d={d} fill="color-mix(in oklch, var(--accent) 35%, white)" fillOpacity={0.85} />
                      <line x1={0} y1={50} x2={amps.length - 1} y2={50}
                        stroke="color-mix(in oklch, var(--accent) 25%, white)" strokeWidth={0.75}
                        vectorEffect="non-scaling-stroke" strokeOpacity={0.6} />
                    </svg>
                  </div>
                );
              })}
            </div>
            {showVolume && <FadeEnvelope region={region} ceilFrac={ceilingFrac(track.ceilingDb)} />}
            <span className="relative z-10 w-2.5 shrink-0 cursor-ew-resize rounded-l-[6px] bg-black/25"
              onPointerDown={begin('left')} onPointerMove={move} onPointerUp={end} />
            <span className="relative z-10 flex-1 cursor-grab" />
            <span className="relative z-10 w-2.5 shrink-0 cursor-ew-resize rounded-r-[6px] bg-black/25"
              onPointerDown={begin('right')} onPointerMove={move} onPointerUp={end} />
          </div>
        )}
      </div>
      {/* Volume ceiling — inherited from Layer One; always-visible level like Layer One's track
          slider. Drives live audio + the automation envelope / clip-fill intensity. */}
      <div className="flex w-40 shrink-0 items-center gap-2">
        <Slider
          min={trackMinDb}
          max={trackMaxDb}
          step={1}
          value={[track.ceilingDb]}
          onValueChange={(v) => setTrackCeilingDb(track.id, Array.isArray(v) ? v[0] : v)}
          aria-label={`Volume ${track.category}`}
          className="flex-1"
        />
        <span className="w-12 text-right text-xs tabular-nums text-muted-foreground">{track.ceilingDb} dB</span>
      </div>
      <span
        className={`w-24 shrink-0 pl-3 text-right text-xs tabular-nums ${partial ? 'font-medium text-[var(--accent-ink)]' : 'text-muted-foreground'}`}
        title={
          partial
            ? 'Clip is shorter than the track — only part plays'
            : loops > 1
              ? `Track loops ${loops}× (${clock(total!)} each) to fill the clip`
              : 'Whole track plays once'
        }
      >
        {readout}
      </span>
    </div>
  );
}

/** DAW-style volume automation over a clip: the region's actual audible envelope (regionEnvAt —
 *  cosine rise over fadeIn, hold at the ceiling, cosine fall over fadeOut), with breakpoint dots
 *  at the four automation corners. Pointer-transparent; sits under the drag handles. */
function FadeEnvelope({ region, ceilFrac }: { region: TemplateRegion; ceilFrac: number }) {
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
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden
    >
      <path d={`M${pts.join(' L')}`} fill="none" stroke="rgba(0,0,0,0.95)"
        strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      {/* zero-length round-cap subpaths render as circular dots even under non-uniform scale */}
      <path d={bps.map(([x, e]) => `M${x.toFixed(2)} ${Y(e)} l0.01 0`).join(' ')} fill="none"
        stroke="rgba(0,0,0,0.95)" strokeWidth={5.5} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

'use client';
import { useRef } from 'react';
import type { ArrTrack, TemplateRegion } from '@/arrange/types';
import { useArrangement } from '@/arrange/arrangementStore';
import { clampRegion } from '@/arrange/geometry';
import { config } from '@/config';

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** One module: every handed-off track as a draggable clip on a [0, moduleSeconds] timeline,
 *  with a single playhead sweeping across all lanes. */
export function ModuleDesigner({
  tracks,
  regions,
  trackDurations,
  positionSec,
  playing,
}: {
  tracks: ArrTrack[];
  regions: TemplateRegion[];
  trackDurations: Record<string, number>;
  positionSec: number;
  playing: boolean;
}) {
  const D = config.layerTwo.moduleSeconds;

  return (
    <div className="relative flex flex-col gap-1.5">
      <div className="flex px-4 text-[11px] tabular-nums text-muted-foreground">
        <span className="w-28 shrink-0" />
        <span className="mx-3 flex flex-1 justify-between">
          <span>0:00</span><span>{clock(D / 2)}</span><span>{clock(D)}</span>
        </span>
        <span className="w-24 shrink-0 pl-3">played / total</span>
      </div>

      {tracks.map((track) => (
        <ClipRow
          key={track.id}
          track={track}
          region={regions.find((r) => r.trackId === track.id) ?? null}
          total={trackDurations[track.id]}
          D={D}
        />
      ))}

      {/* single playhead across every lane — aligned to the timeline column */}
      {playing && (
        <div className="pointer-events-none absolute inset-0 z-20 flex px-4">
          <div className="w-28 shrink-0" />
          <div className="relative mx-3 flex-1">
            <div
              className="absolute top-0 bottom-0 w-[2px] -translate-x-1/2 rounded bg-[var(--accent-ink)]"
              style={{ left: `${Math.min(100, (positionSec / D) * 100)}%` }}
            >
              <div className="absolute -top-1 left-1/2 h-3 w-3 -translate-x-1/2 rounded-full bg-[var(--accent-ink)]" />
            </div>
          </div>
          <div className="w-24 shrink-0" />
        </div>
      )}
    </div>
  );
}

function ClipRow({
  track,
  region,
  total,
  D,
}: {
  track: ArrTrack;
  region: TemplateRegion | null;
  total: number | undefined;
  D: number;
}) {
  const laneRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ kind: 'left' | 'right' | 'move'; startX: number; enter: number; exit: number; pxPerSec: number } | null>(null);
  const updateModuleRegion = useArrangement((s) => s.updateModuleRegion);

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
  const readout = total != null ? `${clock(played)} / ${clock(total)}` : `${clock(clipDur)} / …`;

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
            title={`${clock(region.enterSec)} – ${clock(region.exitSec)}`}
          >
            <span className="w-2.5 shrink-0 cursor-ew-resize rounded-l-[6px] bg-black/25"
              onPointerDown={begin('left')} onPointerMove={move} onPointerUp={end} />
            <span className="flex-1 cursor-grab" />
            <span className="w-2.5 shrink-0 cursor-ew-resize rounded-r-[6px] bg-black/25"
              onPointerDown={begin('right')} onPointerMove={move} onPointerUp={end} />
          </div>
        )}
      </div>
      <span
        className={`w-24 shrink-0 pl-3 text-right text-xs tabular-nums ${partial ? 'font-medium text-[var(--accent-ink)]' : 'text-muted-foreground'}`}
        title={partial ? 'Clip is shorter than the track — only part plays' : 'Whole track plays (loops if the clip is longer)'}
      >
        {readout}
      </span>
    </div>
  );
}

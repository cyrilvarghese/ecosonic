import type { ArrTrack, TemplateRegion } from '@/arrange/types';

const NICE_STEPS = [30, 60, 120, 300, 600, 900, 1800];

/** The coarsest nice step that still yields at most 8 labels — keeps the scale readable whether the
 *  timeline is a 30-minute session or a 10-minute section module. */
export function tickStep(totalSec: number): number {
  return NICE_STEPS.find((s) => totalSec / s <= 7) ?? NICE_STEPS[NICE_STEPS.length - 1];
}

const clock = (s: number): string =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** The assembled free-mix on one continuous 0–totalSec timeline: a time scale, then one lane per
 *  track with each region positioned by its absolute time. Section boundaries are not hard cuts —
 *  the scale is the only reference, and it rescales with the draw. */
export function ResultTimeline({ regions, totalSec, tracks, positionSec, trackElements }: {
  regions: TemplateRegion[];
  totalSec: number;
  tracks: ArrTrack[];
  /** Playhead position; omitted when nothing is playing. */
  positionSec?: number;
  /** trackId → the element its rules came from, colouring its bars. */
  trackElements?: Record<string, string>;
}) {
  const pct = (sec: number) => `${(Math.min(Math.max(sec, 0), totalSec) / totalSec) * 100}%`;
  const step = tickStep(totalSec);
  const ticks = Array.from({ length: Math.floor(totalSec / step) + 1 }, (_, i) => i * step);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-end gap-2">
        <span className="w-28 shrink-0" aria-hidden />
        <div className="relative h-4 flex-1">
          {ticks.map((t) => (
            <span
              key={t}
              data-testid={`tick-${t}`}
              className="absolute bottom-0 -translate-x-1/2 text-[10px] tabular-nums text-muted-foreground"
              style={{ left: pct(t) }}
            >
              {clock(t)}
            </span>
          ))}
        </div>
      </div>

      {tracks.map((t) => (
        <div key={t.id} className="flex items-center gap-2">
          <span className="w-28 shrink-0 truncate text-xs text-muted-foreground">{t.label}</span>
          <div className="relative h-4 flex-1 rounded bg-muted/30">
            {ticks.slice(1, -1).map((tick) => (
              <span key={tick} className="absolute inset-y-0 w-px bg-border/60" style={{ left: pct(tick) }} aria-hidden />
            ))}
            {regions.filter((r) => r.trackId === t.id).map((r, i) => (
              <div
                key={i}
                data-testid={`region-${r.trackId}-${r.enterSec}`}
                // data-element rebinds --accent-ink to that element's brand colour (globals.css),
                // so each fragment is coloured by the element it was authored in.
                data-element={trackElements?.[r.trackId]?.toLowerCase()}
                className="absolute inset-y-0.5 rounded bg-[var(--accent-ink)]"
                style={{ left: pct(r.enterSec), width: pct(r.exitSec - r.enterSec) }}
              />
            ))}
            {positionSec !== undefined && (
              <div
                data-testid="playhead"
                aria-hidden
                // White core with a dark outline: element bars run from bright fire orange to
                // near-black air, and a single-colour playhead disappears against one end or the other.
                className="pointer-events-none absolute inset-y-0 z-10 w-0.5 -translate-x-1/2 bg-white shadow-[0_0_0_1px_var(--foreground)]"
                style={{ left: pct(positionSec) }}
              />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

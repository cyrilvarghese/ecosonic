import type { ArrTrack, TemplateRegion } from '@/arrange/types';

const NICE_STEPS = [30, 60, 120, 300, 600, 900, 1800];

/** The coarsest nice step that still yields at most 8 labels — keeps the scale readable whether the
 *  timeline is a 30-minute session or a 10-minute section module. */
export function tickStep(totalSec: number): number {
  return NICE_STEPS.find((s) => totalSec / s <= 7) ?? NICE_STEPS[NICE_STEPS.length - 1];
}

const clock = (s: number): string =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** `M:SS`, with a tenth when the value isn't within a twentieth of a whole second. Sample lengths
 *  are floats: showing a 116.2s sample as "1:56" makes "1:56 ×5" read as 9:40 when the interval is
 *  really 9:41. The tenth is what makes the arithmetic on screen check out. */
const clockPrecise = (s: number): string => {
  if (Math.abs(s - Math.round(s)) < 0.05) return clock(Math.round(s));
  const whole = Math.floor(s);
  return `${clock(whole)}.${Math.round((s - whole) * 10)}`;
};

/** How a sample of `total` seconds fills a clip of `clipDur`.
 *
 *  `source` describes the MATERIAL (sample length × repeats), never the interval — "10:00 ×3" would
 *  read as thirty minutes of audio. The interval length is shown separately.
 *
 *  `×N` is a *product*: sample × N is the interval. When the sample does not divide the interval
 *  evenly the count is written `×N+`, meaning N whole passes and part of another — because there is
 *  no integer that multiplies out, and printing one would be a lie. (Layer Two's ModuleDesigner
 *  counts passes-touched with `ceil` instead, which reads as N+1 for a sliver of a final pass.) */
function loopFit(clipDur: number, total: number | undefined) {
  if (total == null || total <= 0) {
    return { panels: 1, segmented: false, unit: clipDur, source: '', note: '' };
  }
  if (clipDur < total) {
    return {
      panels: 1, segmented: false, unit: clipDur,
      source: clockPrecise(total),
      note: ` · sample ${clockPrecise(total)}, ${clockPrecise(clipDur)} heard`,
    };
  }
  const exact = clipDur / total;
  // Tolerant of float drift: an interval built as 5 × 116.2 can land on 4.999999 or 5.000001.
  const divides = Math.abs(exact - Math.round(exact)) < 0.02;
  const full = divides ? Math.round(exact) : Math.floor(exact);
  const panels = divides ? full : full + 1; // the extra panel is the partial pass
  // Cap the dividers: a 5-second sample in a 10-minute bar would be a picket fence, and the count
  // still carries the number.
  const segmented = panels > 1 && panels <= 40;
  const source = full > 1 || !divides
    ? `${clockPrecise(total)} ×${full}${divides ? '' : '+'}`
    : clockPrecise(total);
  return { panels, segmented, unit: segmented ? total : clipDur, source, note: ` · sample ${source}` };
}

/** The assembled free-mix on one continuous 0–totalSec timeline: a time scale, one lane per track
 *  with each region positioned by its absolute time and coloured by its element, and a single
 *  playhead sweeping every lane — draggable, like Layer Two's module designer. */
export function ResultTimeline({
  regions, totalSec, tracks, positionSec = 0, trackElements,
  onScrub, onScrubStart, onScrubEnd, mutedIds, onToggleMute, onToggleLock, trackDurations,
}: {
  regions: TemplateRegion[];
  totalSec: number;
  tracks: ArrTrack[];
  /** Playhead position in seconds. */
  positionSec?: number;
  /** trackId → the element its rules came from, colouring its bars. */
  trackElements?: Record<string, string>;
  /** Omit all three to render a non-scrubbable timeline. */
  onScrub?: (sec: number) => void;
  onScrubStart?: () => void;
  onScrubEnd?: () => void;
  /** Omit onToggleMute to render without mute controls. */
  mutedIds?: ReadonlySet<string>;
  onToggleMute?: (trackId: string) => void;
  /** Omit to render without lock controls. Whether a lane IS locked is read off the track itself
   *  (`ArrTrack.locked`), which the generator sets — no second source of truth for the same fact. */
  onToggleLock?: (trackId: string) => void;
  /** trackId → real sample length in seconds; only known once the engine has loaded it. */
  trackDurations?: Record<string, number>;
}) {
  const pct = (sec: number) => `${(Math.min(Math.max(sec, 0), totalSec) / totalSec) * 100}%`;
  const step = tickStep(totalSec);
  const ticks = Array.from({ length: Math.floor(totalSec / step) + 1 }, (_, i) => i * step);

  const secondsAt = (clientX: number, el: HTMLElement): number => {
    const rect = el.getBoundingClientRect();
    const frac = rect.width > 0 ? (clientX - rect.left) / rect.width : 0;
    return Math.min(Math.max(frac, 0), 1) * totalSec;
  };

  return (
    <div className="relative flex flex-col gap-1">
      <div className="flex items-end gap-2">
        <span className="w-44 shrink-0" aria-hidden />
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

      {tracks.map((t) => {
        const muted = mutedIds?.has(t.id) ?? false;
        return (
          <div key={t.id} className="flex items-center gap-2">
            <span className="flex w-44 shrink-0 items-center gap-1">
              {onToggleLock && (
                <button
                  type="button"
                  aria-pressed={t.locked}
                  aria-label={`${t.locked ? 'Unlock' : 'Lock'} ${t.label}`}
                  title={t.locked
                    ? 'Locked — Regenerate leaves this track alone. Click to release it.'
                    : 'Lock this track, so Regenerate rerolls the others around it'}
                  onClick={() => onToggleLock(t.id)}
                  className={`rounded px-1 text-xs leading-none transition-calm hover:bg-muted/60 ${
                    t.locked ? 'bg-[var(--accent-ink)]/15' : 'opacity-45 hover:opacity-100'
                  }`}
                >
                  {t.locked ? '🔒' : '🔓'}
                </button>
              )}
              {onToggleMute && (
                <button
                  type="button"
                  aria-pressed={muted}
                  aria-label={`${muted ? 'Unmute' : 'Mute'} ${t.label}`}
                  onClick={() => onToggleMute(t.id)}
                  className="rounded px-1 text-xs leading-none transition-calm hover:bg-muted/60"
                >
                  {muted ? '🔇' : '🔊'}
                </button>
              )}
              <span className={`truncate text-xs ${muted ? 'text-muted-foreground/50 line-through' : 'text-muted-foreground'}`}>
                {t.label}
              </span>
            </span>
            <div className={`relative h-5 flex-1 rounded bg-muted/30 ${muted ? 'opacity-35' : ''}`}>
              {ticks.slice(1, -1).map((tick) => (
                <span key={tick} className="absolute inset-y-0 w-px bg-border/60" style={{ left: pct(tick) }} aria-hidden />
              ))}
              {regions.filter((r) => r.trackId === t.id).map((r, i) => {
                const clipDur = r.exitSec - r.enterSec;
                const { panels, segmented, unit, source, note } = loopFit(clipDur, trackDurations?.[t.id]);
                return (
                  <div
                    key={i}
                    data-testid={`region-${r.trackId}-${r.enterSec}`}
                    // data-element rebinds --accent-ink to that element's brand colour (globals.css),
                    // so each fragment is coloured by the element it was authored in.
                    data-element={trackElements?.[r.trackId]?.toLowerCase()}
                    title={`${t.label} · ${clock(r.enterSec)}–${clock(r.exitSec)}${note} · interval ${clock(clipDur)}`}
                    className="absolute inset-y-0.5 flex items-center justify-between gap-1 overflow-hidden rounded bg-[var(--accent-ink)] px-1"
                    style={{ left: pct(r.enterSec), width: pct(clipDur) }}
                  >
                    {/* One panel per repeat — identical widths make the loop points legible. */}
                    {segmented && (
                      <div className="pointer-events-none absolute inset-0 flex overflow-hidden rounded">
                        {Array.from({ length: panels }).map((_, s) => (
                          <div
                            key={s}
                            data-testid="loop-seg"
                            style={{ width: `${(Math.min(unit, clipDur - s * unit) / clipDur) * 100}%` }}
                            className={`h-full ${s > 0 ? 'border-l border-white/70' : ''} ${s % 2 === 1 ? 'bg-black/20' : ''}`}
                          />
                        ))}
                      </div>
                    )}
                    {/* Left: what the material IS. Right: how long the window is. Both clipped away
                        on narrow bars, where the title carries the whole reading. */}
                    <span
                      data-testid="interval-source"
                      className="relative z-10 truncate text-[10px] leading-none text-white/90"
                    >
                      {t.label}{source ? ` ${source}` : ''}
                    </span>
                    <span
                      data-testid="interval-length"
                      className="relative z-10 shrink-0 text-[10px] leading-none tabular-nums text-white/70"
                    >
                      {clock(clipDur)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* One playhead over every lane, aligned to the same label gutter as the rows above. */}
      <div className="pointer-events-none absolute inset-0 z-20 flex gap-2">
        <span className="w-44 shrink-0" aria-hidden />
        <div
          data-testid="scrub-strip"
          className={`relative flex-1 ${onScrub ? 'pointer-events-auto cursor-ew-resize' : ''}`}
          onPointerDown={onScrub && ((e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            onScrubStart?.();
            onScrub(secondsAt(e.clientX, e.currentTarget));
          })}
          onPointerMove={onScrub && ((e) => {
            if (e.buttons === 0) return; // hovering, not dragging
            onScrub(secondsAt(e.clientX, e.currentTarget));
          })}
          onPointerUp={onScrub && (() => onScrubEnd?.())}
          onPointerCancel={onScrub && (() => onScrubEnd?.())}
        >
          <div
            data-testid="playhead"
            className="pointer-events-none absolute inset-y-0 w-[2px] -translate-x-1/2 rounded bg-[var(--accent-ink)]"
            style={{ left: pct(positionSec) }}
          >
            <div className="absolute -top-1 left-1/2 h-3 w-3 -translate-x-1/2 rounded-full bg-[var(--accent-ink)]" />
          </div>
        </div>
      </div>
    </div>
  );
}

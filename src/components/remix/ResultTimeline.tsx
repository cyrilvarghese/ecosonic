import type { ArrTrack, TemplateRegion } from '@/arrange/types';
import { FadeEnvelope, ceilingFrac } from '@/components/arrange/FadeEnvelope';

/** The lane's toggles: square, bordered, and large enough to aim at. Lit variants carry the state,
 *  so the control looks pressed rather than merely coloured. */
const ICON_BTN = 'flex h-7 w-7 shrink-0 items-center justify-center rounded-md border text-sm '
  + 'leading-none transition-calm';
const ICON_IDLE = 'border-border text-muted-foreground hover:bg-muted/60 hover:text-foreground';
const ICON_LIT = 'border-[var(--accent-ink)]/50 bg-[var(--accent-ink)]/15 text-[var(--accent-ink)]';

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
  highlightedIds, onHoverTrack, pendingIds,
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
  /** Lanes to wash with the accent — the pool row under the cursor drives these, which is how a row
   *  shows you which lanes it actually governs. */
  highlightedIds?: ReadonlySet<string>;
  /** Hovering a lane reports it back, so the link runs both ways. null on leave. */
  onHoverTrack?: (trackId: string | null) => void;
  /** trackId → real sample length in seconds; only known once the engine has loaded it. */
  trackDurations?: Record<string, number>;
  /** Lanes whose sample has not loaded yet. Their bars are drawn but their loop count is not known,
   *  so the readout is a shimmer rather than a number that would only be a guess. Omitted ⇒ nothing
   *  is pending, which is what every caller outside /remix wants. */
  pendingIds?: ReadonlySet<string>;
}) {
  const pct = (sec: number) => `${(Math.min(Math.max(sec, 0), totalSec) / totalSec) * 100}%`;
  const step = tickStep(totalSec);
  const ticks = Array.from({ length: Math.floor(totalSec / step) + 1 }, (_, i) => i * step);

  /** One row per LANE, not per track. A lane that rotates its samples across the sections is
   *  several tracks — one per file, because a track carries exactly one — but it is one voice
   *  taking turns, so it reads as a single row whose blocks happen to name different files.
   *  Everything else, PLANET's pair included, is its own row and this is a no-op. */
  const rows = tracks.reduce<{
    id: string; label: string; head: ArrTrack; ids: Set<string>; byId: Map<string, ArrTrack>;
  }[]>((acc, t) => {
    const id = t.row?.id ?? t.id;
    const found = acc.find((r) => r.id === id);
    if (found) {
      found.ids.add(t.id);
      found.byId.set(t.id, t);
      return acc;
    }
    acc.push({
      id,
      label: t.row?.label ?? t.label,
      head: t,
      ids: new Set([t.id]),
      byId: new Map([[t.id, t]]),
    });
    return acc;
  }, []);

  const secondsAt = (clientX: number, el: HTMLElement): number => {
    const rect = el.getBoundingClientRect();
    const frac = rect.width > 0 ? (clientX - rect.left) / rect.width : 0;
    return Math.min(Math.max(frac, 0), 1) * totalSec;
  };

  return (
    <div className="relative flex flex-col gap-1.5">
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

      {rows.map((row) => {
        // The row's representative: lock state and the controls address it, and for every lane but
        // a rotating one it IS the lane. Kept as `t` so the row reads the same as a single track.
        const t = row.head;
        const muted = mutedIds?.has(t.id) ?? false;
        const lit = highlightedIds?.has(t.id) ?? false;
        return (
          <div
            key={row.id}
            data-testid={`lane-${row.id}`}
            data-highlighted={lit}
            onMouseEnter={() => onHoverTrack?.(t.id)}
            onMouseLeave={() => onHoverTrack?.(null)}
            className={`flex items-center gap-2 rounded-sm transition-calm ${
              lit ? 'bg-[var(--accent-ink)]/8 ring-1 ring-inset ring-[var(--accent-ink)]/25' : ''
            }`}
          >
            <span className="flex w-44 shrink-0 items-center gap-1.5">
              {onToggleLock && (
                <button
                  type="button"
                  aria-pressed={t.locked}
                  aria-label={`${t.locked ? "Unlock" : "Lock"} ${row.label}`}
                  title={t.locked
                    ? 'Locked — Regenerate leaves this track alone. Click to release it.'
                    : 'Lock this track, so Regenerate rerolls the others around it'}
                  onClick={() => onToggleLock(t.id)}
                  className={`${ICON_BTN} ${t.locked ? ICON_LIT : ICON_IDLE}`}
                >
                  {t.locked ? '🔒' : '🔓'}
                </button>
              )}
              {onToggleMute && (
                <button
                  type="button"
                  aria-pressed={muted}
                  aria-label={`${muted ? "Unmute" : "Mute"} ${row.label}`}
                  onClick={() => onToggleMute(t.id)}
                  className={`${ICON_BTN} ${muted ? ICON_LIT : ICON_IDLE}`}
                >
                  {muted ? '🔇' : '🔊'}
                </button>
              )}
              <span className={`truncate text-xs ${muted ? 'text-muted-foreground/50 line-through' : 'text-muted-foreground'}`}>
                {row.label}
              </span>
            </span>
            <div className={`relative h-12 flex-1 rounded bg-muted/30 ${muted ? 'opacity-35' : ''}`}>
              {ticks.slice(1, -1).map((tick) => (
                <span key={tick} className="absolute inset-y-0 w-px bg-border/60" style={{ left: pct(tick) }} aria-hidden />
              ))}
              {regions.filter((r) => row.ids.has(r.trackId)).map((r, i) => {
                // Which file THIS block plays. A rotating row hands its sections to different
                // samples, so the length, the loop count and the name all come from the block's own
                // track rather than from the row.
                const own = row.byId.get(r.trackId) ?? t;
                // Length unknown yet: the bar is real, the loop count is not.
                const pending = pendingIds?.has(r.trackId) ?? false;
                const clipDur = r.exitSec - r.enterSec;
                const { panels, segmented, unit, note } = loopFit(clipDur, trackDurations?.[r.trackId]);
                return (
                  <div
                    key={i}
                    data-testid={`region-${r.trackId}-${r.enterSec}`}
                    // data-element rebinds --accent-ink to that element's brand colour (globals.css),
                    // so each fragment is coloured by the element it was authored in.
                    data-element={trackElements?.[r.trackId]?.toLowerCase()}
                    data-pending={pending}
                    title={pending
                      ? `${own.label} · ${clock(r.enterSec)}–${clock(r.exitSec)} · Loading Samples — the loop count is not known until this one has loaded`
                      : `${own.label} · ${clock(r.enterSec)}–${clock(r.exitSec)}${note} · interval ${clock(clipDur)}`}
                    className={`absolute inset-y-0.5 flex items-start justify-between gap-1 overflow-hidden rounded bg-[var(--accent-ink)] px-1 pt-1 ${
                      pending ? 'animate-pulse opacity-50' : ''
                    }`}
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
                    {/* The volume line: silence at the edges, up through the fade-in, held at the track's
                        ceiling, down through the fade-out. Sampled from the same regionEnvAt the
                        scheduler drives the gain with, so it is what you hear. White rather than
                        Layer Two's black — these bars are saturated, not pale. */}
                    <FadeEnvelope
                      region={r}
                      ceilFrac={ceilingFrac(own.ceilingDb)}
                      stroke="rgba(255,255,255,0.7)"
                      fill="rgba(255,255,255,0.3)"
                      dots
                    />
                    {/* Left: what the material IS. Right: how long the window is. Both clipped away
                        on narrow bars, where the title carries the whole reading. */}
                    <span
                      data-testid="interval-source"
                      className="relative z-10 flex min-w-0 items-center gap-1 truncate text-[10px] leading-none text-white/90"
                    >
                      {own.sample.name}
                      {/* Only the loop count waits on the sample; the bar itself is already real. */}
                      {pending
                        ? (
                          <span
                            data-testid="source-skeleton"
                            className="inline-block shrink-0 rounded-sm bg-white/55 px-1 py-px text-[9px] leading-none text-[var(--accent-ink)]"
                          >
                            Loading Samples
                          </span>
                        )
                        : null}
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

import type { ArrTrack, TemplateRegion } from '@/arrange/types';

/** The assembled free-mix on one continuous 0–totalSec timeline: one lane per track, each region
 *  positioned by its absolute time. Section boundaries are faint labels, not hard cuts. */
export function ResultTimeline({ regions, totalSec, tracks }: {
  regions: TemplateRegion[];
  totalSec: number;
  tracks: ArrTrack[];
}) {
  const pct = (sec: number) => `${(sec / totalSec) * 100}%`;
  return (
    <div className="flex flex-col gap-1">
      {tracks.map((t) => (
        <div key={t.id} className="flex items-center gap-2">
          <span className="w-28 shrink-0 truncate text-xs text-muted-foreground">{t.label}</span>
          <div className="relative h-4 flex-1 rounded bg-muted/30">
            <span className="absolute inset-y-0 w-px bg-border" style={{ left: '33.3333%' }} aria-hidden />
            <span className="absolute inset-y-0 w-px bg-border" style={{ left: '66.6667%' }} aria-hidden />
            {regions.filter((r) => r.trackId === t.id).map((r, i) => (
              <div
                key={i}
                data-testid={`region-${r.trackId}-${r.enterSec}`}
                className="absolute inset-y-0.5 rounded bg-[var(--accent-ink)]"
                style={{ left: pct(r.enterSec), width: pct(r.exitSec - r.enterSec) }}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

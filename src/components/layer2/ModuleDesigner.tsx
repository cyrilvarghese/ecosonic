'use client';
import type { Composition, Mode } from '@/arrange/types';
import { config } from '@/config';

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** Detail view for one mode: each selected track's clip within a 10-min module, straight
 *  from the mode rules (absent categories shown as empty). Read-only for now; drag comes next. */
export function ModuleDesigner({ composition, mode }: { composition: Composition; mode: Mode }) {
  const D = config.layerTwo.moduleSeconds;
  const tpl = composition.templates[mode];

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between px-32 text-[11px] tabular-nums text-muted-foreground">
        <span>0:00</span><span>{clock(D / 2)} · peak</span><span>{clock(D)}</span>
      </div>
      {composition.tracks.map((track) => {
        const region = tpl.regions.find((r) => r.trackId === track.id);
        return (
          <div key={track.id} className="flex items-center gap-3 rounded-[var(--radius-md)] border border-border bg-card px-4 py-2">
            <div className="w-28 shrink-0">
              <div className="label">{track.category}</div>
              <div className="truncate text-sm text-foreground">{track.sample.name}</div>
            </div>
            <div className="relative h-7 flex-1 overflow-hidden rounded-md bg-muted">
              {region ? (
                <div
                  className="absolute inset-y-1 rounded-[6px]"
                  style={{
                    left: `${(region.enterSec / D) * 100}%`,
                    width: `${((region.exitSec - region.enterSec) / D) * 100}%`,
                    background: 'var(--accent-ink)',
                    opacity: 0.85,
                  }}
                  title={`${clock(region.enterSec)} – ${clock(region.exitSec)}`}
                />
              ) : (
                <span className="absolute inset-0 flex items-center justify-center text-[11px] italic text-muted-foreground">
                  absent in {mode.toLowerCase()}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

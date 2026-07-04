'use client';
import type { Mode, ModuleInstance } from '@/arrange/types';

const MODE_GRADIENT: Record<Mode, string> = {
  RELAXATION: 'linear-gradient(160deg,#d9ccf6,#c3b0ec)',
  IMMERSION: 'linear-gradient(160deg,#c6b6ef,#a992e2)',
  RETURN: 'linear-gradient(160deg,#bfe6d6,#a6d3c4)',
};

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** The composition's module track: overlapping lens modules + a playhead. */
export function ModuleBand({
  sequence,
  totalSec,
  positionSec,
}: {
  sequence: ModuleInstance[];
  totalSec: number;
  positionSec: number;
}) {
  return (
    <div className="relative h-24 w-full rounded-[var(--radius-md)] bg-card/60">
      {sequence.map((m, i) => (
        <div
          key={m.id}
          className="absolute top-2 bottom-2 flex flex-col items-center justify-center rounded-[999px] text-[color:var(--n-800)] shadow-md"
          style={{
            left: `${(m.startSec / totalSec) * 100}%`,
            width: `${(m.durationSec / totalSec) * 100}%`,
            background: MODE_GRADIENT[m.mode],
            mixBlendMode: 'multiply',
          }}
        >
          <span className="text-[10px] tracking-widest opacity-70">{String(i + 1).padStart(2, '0')}</span>
          <span className="text-xs font-medium">{m.mode}</span>
          <span className="text-[10px] opacity-70 tabular-nums">{clock(m.durationSec)}</span>
        </div>
      ))}
      {/* playhead */}
      <div
        className="absolute top-0 bottom-0 z-10 w-px bg-[var(--accent-ink)]"
        style={{ left: `${Math.min(100, (positionSec / totalSec) * 100)}%` }}
      >
        <div className="absolute -left-1 -top-1 h-2.5 w-2.5 rounded-full bg-[var(--accent-ink)]" />
      </div>
    </div>
  );
}

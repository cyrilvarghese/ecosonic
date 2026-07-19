'use client';
import type { Mode } from '@/arrange/types';
import type { CandidateRule } from '@/rules/analysisSchema';
import { config } from '@/config';
import { partition, ghostBand, ruleFor } from '@/rules/timeline';

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

const TINT: Record<CandidateRule['kind'], string> = {
  confirms: 'bg-emerald-500/70 border-emerald-600',
  contradicts: 'bg-red-500/70 border-red-600',
  novel: 'bg-[color-mix(in_oklch,var(--accent)_60%,transparent)] border-[var(--accent-ink)]',
};
const CHIP: Record<CandidateRule['kind'], string> = {
  confirms: 'bg-emerald-600/15 text-emerald-700 dark:text-emerald-400',
  contradicts: 'bg-red-600/15 text-red-700 dark:text-red-400',
  novel: 'bg-[color-mix(in_oklch,var(--accent)_25%,transparent)] text-[var(--accent-ink)]',
};

export function AnalysisTimeline({ candidates, mode }: { candidates: CandidateRule[]; mode: Mode }) {
  const D = config.layerTwo.moduleSeconds;
  const { lanes, untimed } = partition(candidates, D);
  const pct = (s: number) => `${Math.max(0, Math.min(100, (s / D) * 100))}%`;

  if (lanes.length === 0 && untimed.length === 0) {
    return <p className="text-sm text-muted-foreground">No candidates to plot.</p>;
  }

  return (
    <div className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-border bg-card p-4">
      <div className="flex gap-3 text-[11px] tabular-nums text-muted-foreground">
        <span className="w-24 shrink-0" />
        <span className="flex flex-1 justify-between"><span>0:00</span><span>{clock(D / 2)}</span><span>{clock(D)}</span></span>
      </div>

      {lanes.map(({ category, items }) => {
        const ghost = ghostBand(ruleFor(mode, category), D);
        return (
          <div key={category} className="flex items-center gap-3">
            <div className="label w-24 shrink-0">{category}</div>
            <div className="relative h-8 flex-1 overflow-hidden rounded-md bg-muted">
              {ghost && (
                <div className="absolute inset-y-0 bg-foreground/10"
                  style={{ left: pct(ghost.startSec), width: pct(ghost.endSec - ghost.startSec) }}
                  aria-hidden />
              )}
              {items.map((it, i) => (
                <div key={i}
                  className={`absolute inset-y-1.5 rounded-[4px] border ${TINT[it.kind]}`}
                  style={it.mark === 'bar'
                    ? { left: pct(it.startSec), width: pct((it.endSec ?? it.startSec) - it.startSec) }
                    : { left: pct(it.startSec), width: '3px' }}
                  title={`${clock(it.startSec)}${it.endSec != null ? `–${clock(it.endSec)}` : ''} · ${it.candidate.text}`} />
              ))}
            </div>
          </div>
        );
      })}

      {untimed.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1.5">
          {untimed.map((c, i) => (
            <span key={i} className={`rounded-full px-2.5 py-0.5 text-xs ${CHIP[c.kind]}`} title={c.text}>
              {c.relatedRule ? `${c.relatedRule}: ` : ''}{c.text.length > 48 ? `${c.text.slice(0, 47)}…` : c.text}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

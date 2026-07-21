'use client';
import type { Mode } from '@/arrange/types';
import type { CandidateRule } from '@/rules/analysisSchema';
import { config } from '@/config';
import { partition, ghostBand, ruleFor } from '@/rules/timeline';
import { explainRule } from '@/rules/explain';

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
  const minutes = Array.from({ length: Math.floor(D / 60) + 1 }, (_, i) => i * 60); // 0:00 … D at 1-min steps

  if (lanes.length === 0 && untimed.length === 0) {
    return <p className="text-sm text-muted-foreground">No candidates to plot.</p>;
  }

  return (
    <div className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-border bg-card p-4">
      <div className="flex gap-3 text-[11px] tabular-nums text-muted-foreground">
        <span className="w-24 shrink-0" />
        <span className="flex flex-1 justify-between">
          {minutes.map((m) => <span key={m}>{clock(m)}</span>)}
        </span>
      </div>

      {lanes.map(({ category, items }) => {
        const ghost = ghostBand(ruleFor(mode, category), D);
        return (
          <div key={category} className="flex items-center gap-3">
            <div className="label w-24 shrink-0">{category}</div>
            <div className="relative h-8 flex-1 overflow-hidden rounded-md bg-muted">
              {/* 1-minute gridlines (interior only — edges sit under the rounded border) */}
              {minutes.slice(1, -1).map((m) => (
                <div key={m} className="absolute inset-y-0 w-px bg-foreground/10" style={{ left: pct(m) }} aria-hidden />
              ))}
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
        <div className="mt-1 flex flex-col gap-1.5">
          {untimed.map((c, i) => (
            <div key={i} className={`rounded-[6px] px-3 py-2 text-xs ${CHIP[c.kind]}`}>
              <div className="font-medium">{explainRule(c.relatedRule, c.kind)}</div>
              <div className="mt-0.5 leading-snug opacity-90">{c.text}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

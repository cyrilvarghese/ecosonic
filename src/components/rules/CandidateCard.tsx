'use client';
import type { CandidateRule } from '@/rules/analysisSchema';
import { rulePhrase } from '@/rules/explain';

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

const BADGE: Record<CandidateRule['kind'], { label: string; cls: string }> = {
  confirms: { label: '✓ matches', cls: 'bg-emerald-600/15 text-emerald-700 dark:text-emerald-400' },
  contradicts: { label: '✗ contradicts', cls: 'bg-red-600/15 text-red-700 dark:text-red-400' },
  novel: { label: '★ new', cls: 'bg-[color-mix(in_oklch,var(--accent)_25%,transparent)] text-[var(--accent-ink)]' },
};

export function CandidateCard({
  candidate, keptId, onKeep, onDiscard, onPromote,
}: {
  candidate: CandidateRule;
  keptId: string | null;            // registry id once kept, else null
  onKeep: () => void;
  onDiscard: () => void;
  onPromote: () => void;
}) {
  const badge = BADGE[candidate.kind];
  const phrase = rulePhrase(candidate.relatedRule);
  const promotable = keptId !== null && candidate.structured !== null && candidate.mode !== null;
  return (
    <div className="rounded-[var(--radius-md)] border border-border bg-card p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.cls}`}
          title={candidate.relatedRule ?? undefined}>
          {badge.label}
        </span>
        {candidate.layer && <span className="label">{candidate.layer}</span>}
        {candidate.structured && (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">structured</span>
        )}
        <span className="ml-auto text-xs tabular-nums text-muted-foreground">
          {(candidate.confidence * 100).toFixed(0)}%
        </span>
      </div>
      {phrase && <p className="mb-2 text-xs font-medium text-muted-foreground">{phrase}</p>}
      <p className="text-sm text-foreground">{candidate.text}</p>
      {candidate.evidence.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {candidate.evidence.map((e, i) => (
            <span key={i} className="rounded bg-muted px-1.5 py-0.5 text-[11px] tabular-nums text-muted-foreground"
              title={e.note}>
              {mmss(e.atSec)} — {e.note}
            </span>
          ))}
        </div>
      )}
      <div className="mt-3 flex items-center gap-2">
        {keptId === null ? (
          <>
            <button type="button" onClick={onKeep}
              className="rounded-full px-3 py-1 text-xs text-white transition-calm"
              style={{ background: 'var(--accent-ink)' }}>
              Keep
            </button>
            <button type="button" onClick={onDiscard}
              className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition-calm hover:text-foreground">
              Discard
            </button>
          </>
        ) : (
          <>
            <span className="text-xs text-muted-foreground">kept ✓</span>
            {promotable && (
              <button type="button" onClick={onPromote}
                className="rounded-full border border-[var(--accent)] px-3 py-1 text-xs text-[var(--accent-ink)] transition-calm">
                Promote to grammar
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

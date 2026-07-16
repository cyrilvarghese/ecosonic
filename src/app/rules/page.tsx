'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { config } from '@/config';
import type { CandidateRule, DiscoveredRule } from '@/rules/analysisSchema';
import { AnalyzePanel, type AnalyzeResponse } from '@/components/rules/AnalyzePanel';
import { CandidateCard } from '@/components/rules/CandidateCard';
import { RuleLibrary } from '@/components/rules/RuleLibrary';

export default function RulesPage() {
  const [ready, setReady] = useState<boolean | null>(null);
  const [discovered, setDiscovered] = useState<DiscoveredRule[]>([]);
  const [description, setDescription] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [cards, setCards] = useState<Array<{ candidate: CandidateRule; keptId: string | null }>>([]);
  const [actionError, setActionError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setDiscovered(await (await fetch('/api/rules')).json());
  }, []);
  useEffect(() => {
    void fetch('/api/analyze').then(async (r) => setReady((await r.json()).ready));
    void refresh();
  }, [refresh]);

  const onResult = (r: AnalyzeResponse, name: string) => {
    setDescription(r.description);
    setFileName(name);
    setCards((r.candidates as CandidateRule[]).map((candidate) => ({ candidate, keptId: null })));
  };

  const keep = async (i: number) => {
    setActionError(null);
    const res = await fetch('/api/rules', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        candidate: cards[i].candidate,
        source: { file: fileName, model: config.analysis.model },
      }),
    });
    if (!res.ok) { setActionError('Keep failed'); return; }
    const kept: DiscoveredRule = await res.json();
    setCards((c) => c.map((x, j) => (j === i ? { ...x, keptId: kept.id } : x)));
    void refresh();
  };
  const patch = async (id: string, action: 'promote' | 'discard') => {
    setActionError(null);
    const res = await fetch('/api/rules', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action }),
    });
    if (!res.ok) setActionError((await res.json()).error ?? `${action} failed`);
    void refresh();
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <div>
          <p className="label">Rule Discovery</p>
          <h1 className="text-lg font-medium">Composition rules — existing, and discovered from tracks</h1>
        </div>
        <Link href="/layer2" className="text-sm text-muted-foreground hover:text-foreground">
          ← Module Designer
        </Link>
      </header>
      <main className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
        <RuleLibrary discovered={discovered}
          onPromote={(id) => void patch(id, 'promote')}
          onDiscard={(id) => void patch(id, 'discard')} />
        <AnalyzePanel ready={ready} onResult={onResult} />
        {actionError && <p className="text-xs text-red-600 dark:text-red-400">{actionError}</p>}
        {description && (
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-medium">Description — {fileName}</h2>
            <p className="whitespace-pre-wrap rounded-[var(--radius-md)] border border-border bg-card p-4 text-sm leading-relaxed">
              {description}
            </p>
            <h2 className="text-sm font-medium">Candidate rules ({cards.length})</h2>
            {cards.map((c, i) => (
              <CandidateCard key={i} candidate={c.candidate} keptId={c.keptId}
                onKeep={() => void keep(i)}
                onDiscard={() => setCards((all) => all.filter((_, j) => j !== i))}
                onPromote={() => { if (c.keptId) void patch(c.keptId, 'promote'); }} />
            ))}
          </section>
        )}
      </main>
    </div>
  );
}

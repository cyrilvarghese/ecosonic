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
      <main className="mx-auto w-full max-w-[1680px] p-6">
        <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-2">
          {/* LEFT — Discover: analyze a track, review candidate rules */}
          <div className="flex flex-col gap-4">
            <div>
              <h2 className="text-base font-medium">Discover</h2>
              <p className="text-sm text-muted-foreground">
                Analyze a track to surface candidate rules. Keep the good ones — promote structured
                ones into the grammar on the right.
              </p>
            </div>
            <AnalyzePanel ready={ready} onResult={onResult} />
            {actionError && <p className="text-sm text-red-600 dark:text-red-400">{actionError}</p>}
            {description && (
              <section className="flex flex-col gap-3">
                <h3 className="text-sm font-medium">Description — {fileName}</h3>
                <p className="whitespace-pre-wrap rounded-[var(--radius-md)] border border-border bg-card p-4 text-sm leading-relaxed">
                  {description}
                </p>
                <h3 className="text-sm font-medium">Candidate rules ({cards.length})</h3>
                {cards.map((c, i) => (
                  <CandidateCard key={i} candidate={c.candidate} keptId={c.keptId}
                    onKeep={() => void keep(i)}
                    onDiscard={() => setCards((all) => all.filter((_, j) => j !== i))}
                    onPromote={() => { if (c.keptId) void patch(c.keptId, 'promote'); }} />
                ))}
              </section>
            )}
          </div>

          {/* RIGHT — Exists: the rules the generator already knows (promoted rules land here) */}
          <div className="flex flex-col gap-4">
            <div>
              <h2 className="text-base font-medium">Exists</h2>
              <p className="text-sm text-muted-foreground">
                What the generator already knows — principles, invariants, the live grammar, and
                rules you&apos;ve kept.
              </p>
            </div>
            <RuleLibrary discovered={discovered}
              onPromote={(id) => void patch(id, 'promote')}
              onDiscard={(id) => void patch(id, 'discard')} />
          </div>
        </div>
      </main>
    </div>
  );
}

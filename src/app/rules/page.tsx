'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { config } from '@/config';
import type { Mode } from '@/arrange/types';
import type { CandidateRule, DiscoveredRule } from '@/rules/analysisSchema';
import { AnalyzePanel, type WindowResult } from '@/components/rules/AnalyzePanel';
import { AnalysisTimeline } from '@/components/rules/AnalysisTimeline';
import { CandidateCard } from '@/components/rules/CandidateCard';
import { RuleLibrary } from '@/components/rules/RuleLibrary';
import { SavedAnalyses, type SavedMeta } from '@/components/rules/SavedAnalyses';

const MODE_LABEL: Record<Mode, string> = {
  INTRODUCTION: 'Introduction', DEEP_RELAXATION: 'Deep Relaxation', RETURN: 'Return',
};

type Group = {
  mode: Mode;
  error: string | null;
  description: string;
  cards: Array<{ candidate: CandidateRule; keptId: string | null }>;
};

export default function RulesPage() {
  const [ready, setReady] = useState<boolean | null>(null);
  const [discovered, setDiscovered] = useState<DiscoveredRule[]>([]);
  const [fileName, setFileName] = useState<string>('');
  const [groups, setGroups] = useState<Group[]>([]);
  const [activeTab, setActiveTab] = useState<Mode | null>(null);
  const [view, setView] = useState<'timeline' | 'cards'>('timeline');
  const [savedList, setSavedList] = useState<SavedMeta[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setDiscovered(await (await fetch('/api/rules')).json());
  }, []);
  const refreshSaved = useCallback(async () => {
    setSavedList(await (await fetch('/api/analyses')).json());
  }, []);
  useEffect(() => {
    void fetch('/api/analyze').then(async (r) => setReady((await r.json()).ready));
    void refresh();
    void refreshSaved();
  }, [refresh, refreshSaved]);

  const showResults = (results: WindowResult[], name: string) => {
    setFileName(name);
    setGroups(results.map((r) => r.ok
      ? {
          mode: r.mode, error: null, description: r.description,
          cards: (r.candidates as CandidateRule[]).map((candidate) => ({ candidate, keptId: null })),
        }
      : { mode: r.mode, error: r.error, description: '', cards: [] }));
    setActiveTab(results[0]?.mode ?? null);
    setView('timeline');
  };

  const onResult = (results: WindowResult[], name: string) => {
    showResults(results, name);
    const windows = results
      .filter((r): r is Extract<WindowResult, { ok: true }> => r.ok)
      .map((r) => ({ mode: r.mode, description: r.description, sections: r.sections, candidates: r.candidates as CandidateRule[] }));
    if (windows.length > 0) {
      void fetch('/api/analyses', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: name, model: config.analysis.model, windows }),
      }).then(() => refreshSaved());
    }
  };

  const loadSaved = async (name: string) => {
    setActionError(null);
    const res = await fetch(`/api/analyses?file=${encodeURIComponent(name)}`);
    if (!res.ok) { setActionError('Load failed'); return; }
    const saved = await res.json() as {
      fileName: string;
      windows: Array<{ mode: Mode; description: string; sections: Array<{ startSec: number; label: string }> | null; candidates: CandidateRule[] }>;
    };
    showResults(
      saved.windows.map((w) => ({ mode: w.mode, ok: true, description: w.description, sections: w.sections, candidates: w.candidates })),
      saved.fileName,
    );
  };

  const deleteSaved = async (name: string) => {
    await fetch(`/api/analyses?file=${encodeURIComponent(name)}`, { method: 'DELETE' });
    void refreshSaved();
  };

  const keep = async (mode: Mode, i: number) => {
    setActionError(null);
    const group = groups.find((g) => g.mode === mode);
    if (!group) return;
    const res = await fetch('/api/rules', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        candidate: group.cards[i].candidate,
        source: { file: fileName, model: config.analysis.model },
      }),
    });
    if (!res.ok) { setActionError('Keep failed'); return; }
    const kept: DiscoveredRule = await res.json();
    setGroups((gs) => gs.map((g) => g.mode !== mode ? g : {
      ...g, cards: g.cards.map((x, j) => (j === i ? { ...x, keptId: kept.id } : x)),
    }));
    void refresh();
  };
  const discard = (mode: Mode, i: number) =>
    setGroups((gs) => gs.map((g) => g.mode !== mode ? g : { ...g, cards: g.cards.filter((_, j) => j !== i) }));
  const patch = async (id: string, action: 'promote' | 'discard') => {
    setActionError(null);
    const res = await fetch('/api/rules', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action }),
    });
    if (!res.ok) setActionError((await res.json()).error ?? `${action} failed`);
    void refresh();
  };

  const active = groups.find((g) => g.mode === activeTab) ?? null;

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
          {/* LEFT — Discover: analyze a track, review candidate rules per mode */}
          <div className="flex flex-col gap-4">
            <div>
              <h2 className="text-base font-medium">Discover</h2>
              <p className="text-sm text-muted-foreground">
                Analyze a track to surface candidate rules per section. Keep the good ones — promote
                structured ones into the grammar on the right.
              </p>
            </div>
            <AnalyzePanel ready={ready} onResult={onResult} />
            {actionError && <p className="text-sm text-red-600 dark:text-red-400">{actionError}</p>}
            {groups.length > 0 && (
              <section className="flex flex-col gap-3">
                <h3 className="text-sm font-medium">Candidate rules — {fileName}</h3>
                <div className="flex gap-1 border-b border-border" role="tablist">
                  {groups.map((g) => (
                    <button key={g.mode} type="button" role="tab" aria-selected={g.mode === activeTab}
                      onClick={() => setActiveTab(g.mode)}
                      className={`-mb-px border-b-2 px-3 py-1.5 text-sm transition-calm ${
                        g.mode === activeTab
                          ? 'border-[var(--accent-ink)] text-foreground'
                          : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
                      {MODE_LABEL[g.mode]} {g.error ? '⚠' : `(${g.cards.length})`}
                    </button>
                  ))}
                </div>
                {active && (active.error ? (
                  <p className="rounded-[var(--radius-md)] border border-border bg-card p-4 text-sm text-red-600 dark:text-red-400">
                    {MODE_LABEL[active.mode]} pass failed: {active.error}
                  </p>
                ) : (
                  <>
                    <div className="flex gap-1 self-start rounded-full border border-border p-0.5 text-xs">
                      {(['timeline', 'cards'] as const).map((v) => (
                        <button key={v} type="button" onClick={() => setView(v)}
                          className={`rounded-full px-3 py-1 capitalize transition-calm ${
                            view === v ? 'bg-[var(--accent-ink)] text-white' : 'text-muted-foreground hover:text-foreground'}`}>
                          {v}
                        </button>
                      ))}
                    </div>
                    <p className="whitespace-pre-wrap rounded-[var(--radius-md)] border border-border bg-card p-4 text-sm leading-relaxed">
                      {active.description}
                    </p>
                    {view === 'timeline' ? (
                      <AnalysisTimeline candidates={active.cards.map((c) => c.candidate)} mode={active.mode} />
                    ) : (
                      active.cards.map((c, i) => (
                        <CandidateCard key={`${active.mode}-${i}`} candidate={c.candidate} keptId={c.keptId}
                          onKeep={() => void keep(active.mode, i)}
                          onDiscard={() => discard(active.mode, i)}
                          onPromote={() => { if (c.keptId) void patch(c.keptId, 'promote'); }} />
                      ))
                    )}
                  </>
                ))}
              </section>
            )}
            <SavedAnalyses items={savedList}
              onLoad={(name) => void loadSaved(name)}
              onDelete={(name) => void deleteSaved(name)} />
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

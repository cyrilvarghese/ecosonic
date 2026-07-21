'use client';
import { useRef, useState } from 'react';
import type { Mode } from '@/arrange/types';
import type { WindowResult } from '@/components/rules/AnalyzePanel';

type TextWindow = { mode: Mode; description: string; sections: Array<{ startSec: number; label: string }> | null; candidates: unknown[] };

export function AnalyzeTextPanel({
  ready, onResult,
}: {
  ready: boolean | null;
  onResult: (results: WindowResult[], fileName: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFile = async (file: File) => {
    setName((n) => n || file.name);
    setText(await file.text());
  };

  const analyze = async () => {
    setError(null);
    if (!text.trim()) { setError('Paste or upload a description first.'); return; }
    const finalName = name.trim() || 'Pasted description';
    setBusy(true);
    try {
      const res = await fetch('/api/analyze-text', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, name: finalName }),
      });
      const body = await res.json();
      if (!res.ok) { setError(body.error ?? `Analysis failed (${res.status})`); return; }
      const results: WindowResult[] = (body as TextWindow[]).map((w) => ({
        mode: w.mode, ok: true, description: w.description, sections: w.sections, candidates: w.candidates,
      }));
      onResult(results, finalName);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-[var(--radius-md)] border border-border bg-card p-4">
      <h2 className="mb-1 text-sm font-medium">Analyze a written description</h2>
      <p className="mb-3 text-xs text-muted-foreground">
        Paste a per-section production description (or upload a .txt/.md). No audio — the model reads
        the text and extracts the same candidate rules, per section.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Paste the track description here…"
        disabled={busy || ready !== true}
        className="mb-2 h-32 w-full resize-y rounded-[var(--radius-md)] border border-border bg-background p-2 text-xs"
      />
      <div className="flex flex-wrap items-center gap-3">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (for save/reload)"
          disabled={busy || ready !== true}
          className="rounded-[var(--radius-md)] border border-border bg-background px-2 py-1 text-xs" />
        <input ref={fileRef} type="file" accept=".txt,.md,text/plain,text/markdown" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void loadFile(f); }} disabled={busy || ready !== true} />
        <button type="button" onClick={() => fileRef.current?.click()} disabled={busy || ready !== true}
          className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition-calm hover:text-foreground disabled:opacity-50">
          Upload .txt
        </button>
        <button type="button" onClick={() => void analyze()} disabled={busy || ready !== true}
          className="rounded-full px-4 py-1.5 text-xs text-white transition-calm hover:scale-105 disabled:opacity-50 disabled:hover:scale-100"
          style={{ background: 'var(--accent-ink)' }}>
          {busy ? 'Analyzing…' : 'Analyze description'}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </section>
  );
}

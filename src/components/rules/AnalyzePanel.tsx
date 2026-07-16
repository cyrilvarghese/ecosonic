'use client';
import { useRef, useState } from 'react';
import { config } from '@/config';

export interface AnalyzeResponse {
  description: string;
  sections: Array<{ startSec: number; label: string }> | null;
  candidates: unknown[];
}

export function AnalyzePanel({
  ready, onResult,
}: {
  ready: boolean | null; // null = probing
  onResult: (r: AnalyzeResponse, fileName: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);

  const analyze = async (file: File) => {
    setError(null);
    if (!/\.(mp3|mpeg|wav)$/i.test(file.name)) { setError('MP3, MPEG, or WAV only.'); return; }
    if (file.size > config.analysis.maxUploadBytes) {
      setError(`File is ${(file.size / 1048576).toFixed(1)} MB — the limit is ` +
        `${Math.round(config.analysis.maxUploadBytes / 1048576)} MB. Re-encode around 128 kbps mono.`);
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.set('file', file);
      const res = await fetch('/api/analyze', { method: 'POST', body: form });
      const body = await res.json();
      if (!res.ok) { setError(body.error ?? `Analysis failed (${res.status})`); return; }
      onResult(body as AnalyzeResponse, file.name);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-[var(--radius-md)] border border-border bg-card p-4">
      <h2 className="mb-1 text-sm font-medium">Analyze a reference track</h2>
      <p className="mb-3 text-xs text-muted-foreground">
        MP3/WAV up to {Math.round(config.analysis.maxUploadBytes / 1048576)} MB. The model hears the
        audio blind — it is told what layers sound like, never the house rules. Timings on long
        tracks are approximate; the Keep gate is the filter.
      </p>
      {ready === false && (
        <p className="mb-3 rounded bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          OPENAI_API_KEY is not configured. Add it to <code>.env.local</code> and restart the dev server.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <input ref={inputRef} type="file" accept=".mp3,.mpeg,.wav,audio/mpeg,audio/wav" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) { setPicked(f.name); void analyze(f); } }}
          disabled={busy || ready !== true} />
        <button type="button" onClick={() => inputRef.current?.click()}
          disabled={busy || ready !== true}
          className="rounded-full px-4 py-1.5 text-xs text-white transition-calm hover:scale-105 disabled:opacity-50 disabled:hover:scale-100"
          style={{ background: 'var(--accent-ink)' }}>
          {busy ? 'Analyzing…' : picked ? 'Analyze another track' : 'Choose a track'}
        </button>
        {busy
          ? <span className="text-xs text-muted-foreground">a long track can take a minute…</span>
          : picked && <span className="text-xs text-muted-foreground">{picked}</span>}
      </div>
      {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </section>
  );
}

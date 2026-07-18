'use client';
import { useRef, useState } from 'react';
import type { Mode } from '@/arrange/types';
import { sliceAudio } from '@/rules/sliceAudio';

export type WindowResult =
  | { mode: Mode; ok: true; description: string; sections: Array<{ startSec: number; label: string }> | null; candidates: unknown[] }
  | { mode: Mode; ok: false; error: string };

// The original file is decoded in-browser and never uploaded (only ~18 MB slices are), so this is a
// memory guard on decodeAudioData, not the OpenAI/route upload cap.
const MAX_DECODE_BYTES = 150 * 1048576;

export function AnalyzePanel({
  ready, onResult,
}: {
  ready: boolean | null; // null = probing
  onResult: (results: WindowResult[], fileName: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);

  const analyze = async (file: File) => {
    setError(null);
    if (!/\.(mp3|mpeg|wav)$/i.test(file.name)) { setError('MP3, MPEG, or WAV only.'); return; }
    if (file.size > MAX_DECODE_BYTES) {
      setError(`File is ${(file.size / 1048576).toFixed(1)} MB — too large to decode in the browser ` +
        `(limit ${Math.round(MAX_DECODE_BYTES / 1048576)} MB).`);
      return;
    }
    setBusy(true);
    try {
      console.info(`[three-pass] analyzing "${file.name}" (${(file.size / 1048576).toFixed(1)} MB)`);
      let windows: Array<{ mode: Mode; blob: Blob }>;
      try {
        setProgress('Decoding audio…');
        windows = await sliceAudio(file);
      } catch {
        setError('Could not decode this audio file.'); return;
      }
      if (windows.length === 0) { setError('Track is too short to analyze.'); return; }

      let done = 0;
      // Each window resolves to a WindowResult and never throws → true per-tab isolation.
      const results = await Promise.all(windows.map(async ({ mode, blob }): Promise<WindowResult> => {
        try {
          console.info(`[three-pass] → POST /api/analyze (${mode})`);
          const form = new FormData();
          form.set('file', new File([blob], `${file.name}.${mode}.wav`, { type: 'audio/wav' }));
          form.set('mode', mode);
          const res = await fetch('/api/analyze', { method: 'POST', body: form });
          const body = await res.json();
          setProgress(`Analyzed ${++done} of ${windows.length}…`);
          if (!res.ok) {
            console.warn(`[three-pass] ✗ ${mode}: ${body.error ?? res.status}`);
            return { mode, ok: false, error: body.error ?? `Analysis failed (${res.status})` };
          }
          console.info(`[three-pass] ✓ ${mode}: ${body.candidates?.length ?? 0} candidate(s)`);
          return { mode, ok: true, description: body.description, sections: body.sections, candidates: body.candidates };
        } catch (e) {
          setProgress(`Analyzed ${++done} of ${windows.length}…`);
          console.warn(`[three-pass] ✗ ${mode}: ${(e as Error).message}`);
          return { mode, ok: false, error: (e as Error).message };
        }
      }));
      console.info(`[three-pass] done — ${results.filter((r) => r.ok).length}/${results.length} window(s) analyzed`);
      onResult(results, file.name);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  return (
    <section className="rounded-[var(--radius-md)] border border-border bg-card p-4">
      <h2 className="mb-1 text-sm font-medium">Analyze a reference track</h2>
      <p className="mb-3 text-xs text-muted-foreground">
        MP3/WAV up to {Math.round(MAX_DECODE_BYTES / 1048576)} MB. The track is split into three
        10-minute passes — Introduction, Deep Relaxation, Return — each heard blind and checked
        against that section&apos;s grammar.
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
          ? <span className="text-xs text-muted-foreground">{progress ?? 'working…'}</span>
          : picked && <span className="text-xs text-muted-foreground">{picked}</span>}
      </div>
      {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </section>
  );
}

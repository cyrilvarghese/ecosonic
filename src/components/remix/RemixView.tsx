'use client';
import { useState } from 'react';
import { ELEMENTS } from '@/types';
import type { Mode } from '@/arrange/types';
import { useArrangement } from '@/arrange/arrangementStore';
import { useLayer2Engine } from '@/arrange/useLayer2Engine';
import { useModuleScheduler } from '@/arrange/useModuleScheduler';
import { exportFreeMixWav } from '@/remix/renderFreeMix';
import { useRemix, type RemixMode } from './useRemix';
import { TrackPoolRow } from './TrackPoolRow';
import { ResultTimeline } from './ResultTimeline';

const BTN = 'rounded-md border border-border px-3 py-1.5 text-sm transition-calm hover:bg-muted/40';
const BTN_PRIMARY = 'rounded-md bg-[var(--accent-ink)] px-3 py-1.5 text-sm font-medium text-white';
const PILL = 'rounded px-3 py-1 text-sm transition-calm';
const CHIP = 'rounded-full border px-2.5 py-0.5 text-xs transition-calm';
const LIT = 'border-[var(--accent-ink)] bg-[var(--accent-ink)] text-white';

const clock = (s: number): string =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

const MODES: { value: RemixMode; label: string }[] = [
  { value: 'cross', label: 'Cross-element' },
  { value: 'scoped', label: 'Scoped' },
];
/** null draws the whole authored session on its absolute timeline; a Mode draws one module. */
const SECTIONS: { value: Mode | null; label: string }[] = [
  { value: null, label: 'Full session' },
  { value: 'INTRODUCTION', label: 'Intro' },
  { value: 'DEEP_RELAXATION', label: 'Deep Relaxation' },
  { value: 'RETURN', label: 'Return' },
];
const HINT: Record<RemixMode, string> = {
  cross: 'every track draws from the whole pool — its sample follows the element it picked',
  scoped: "every track draws from one element's rules, and that element's samples",
};

export function RemixView() {
  // /remix owns its own playback: without these two, playFreeMix flips store state that nothing
  // consumes — no engine to load the samples, no clock to trigger them.
  const engine = useLayer2Engine();
  useModuleScheduler(engine);

  const {
    tracks, picks, regions, totalSec, warnings, loading,
    mode, element, section, candidatesFor, setMode, setElement, setSection, regenerate, refetch,
  } = useRemix();
  const masterDb = useArrangement((s) => s.masterDb);
  const playFreeMix = useArrangement((s) => s.playFreeMix);
  const playing = useArrangement((s) => s.playing);
  const positionSec = useArrangement((s) => s.positionSec);
  const pause = useArrangement((s) => s.pause);
  const resume = useArrangement((s) => s.resume);

  // Mid-mix, resume where we paused; from a standstill (or after a redraw, which resets the
  // playhead) start the mix fresh so the scheduler picks up the current regions.
  const onTransport = () => {
    if (playing) pause();
    else if (positionSec > 0) resume();
    else playFreeMix(regions, totalSec);
  };
  // A full-session draw takes one rule per section, so a track can have several picks lit.
  const pickedRules = new Set(picks.map((p) => p.rule));
  const [exportState, setExportState] = useState<'idle' | 'rendering' | 'error'>('idle');

  const onExport = async () => {
    setExportState('rendering');
    try {
      const blob = await exportFreeMixWav({ tracks, regions, totalSec, masterDb });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = section ? `remix-${section.toLowerCase()}.wav` : 'remix.wav';
      a.click();
      URL.revokeObjectURL(url);
      setExportState('idle');
    } catch {
      // Offline rendering decodes whole samples; a missing file or an out-of-memory render both
      // land here, and both used to look identical to nothing happening.
      setExportState('error');
    }
  };

  const onUpload = async (file: File) => {
    const markdown = await file.text();
    await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: file.name, markdown }),
    });
    await refetch();
  };

  return (
    <div className="flex flex-col gap-4">
      {loading && <p className="text-sm text-muted-foreground">Loading rules…</p>}
      {warnings.length > 0 && (
        <p className="text-xs text-amber-600 dark:text-amber-400">{warnings.length} warning(s)</p>
      )}

      <section className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-md border border-border p-0.5">
          {MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              aria-pressed={mode === m.value}
              onClick={() => setMode(m.value)}
              className={`${PILL} ${mode === m.value ? LIT : 'text-muted-foreground hover:bg-muted/40'}`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {mode === 'scoped' && (
          <div className="flex flex-wrap gap-1">
            {ELEMENTS.map((el) => (
              <button
                key={el}
                type="button"
                aria-pressed={el === element}
                onClick={() => setElement(el)}
                className={`${CHIP} ${el === element ? LIT : 'border-border text-muted-foreground opacity-70 hover:opacity-100'}`}
              >
                {el}
              </button>
            ))}
          </div>
        )}

        <p className="text-xs text-muted-foreground">{HINT[mode]}</p>

        <div className="flex w-full flex-wrap items-center gap-1">
          {SECTIONS.map((s) => (
            <button
              key={s.label}
              type="button"
              aria-pressed={section === s.value}
              onClick={() => setSection(s.value)}
              className={`${CHIP} ${section === s.value ? LIT : 'border-border text-muted-foreground opacity-70 hover:opacity-100'}`}
            >
              {s.label}
            </button>
          ))}
          <span className="ml-1 text-xs text-muted-foreground">
            {section
              ? 'one module, rules rebased to the section start'
              : 'the whole authored session on one timeline'}
          </span>
        </div>
      </section>

      <section>
        <h2 className="mb-1 text-base font-medium">Tracks — pool &amp; pick</h2>
        {tracks.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {loading
              ? 'Loading rules…'
              : mode === 'scoped'
                ? `No authored rules for ${element} — pick another element, or upload a session below.`
                : 'No authored rules loaded — upload a session below to start.'}
          </p>
        ) : (
          tracks.map((t) => (
            <TrackPoolRow
              key={t.id}
              track={t}
              candidates={candidatesFor(t.category)}
              picked={pickedRules}
            />
          ))
        )}
      </section>

      <section className="rounded-[var(--radius-md)] border border-[var(--accent-ink)] bg-card p-4">
        <h3 className="mb-2 text-sm font-medium">
          Final result — {SECTIONS.find((s) => s.value === section)?.label ?? 'full session'}
        </h3>
        <ResultTimeline
          regions={regions}
          totalSec={totalSec}
          tracks={tracks}
          positionSec={playing || positionSec > 0 ? positionSec : undefined}
        />
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button type="button" className={BTN_PRIMARY} onClick={regenerate}>🎲 Regenerate</button>
          <button type="button" className={BTN} onClick={onTransport}>
            {playing ? '⏸ Pause' : '▶ Play'}
          </button>
          <span data-testid="transport-clock" className="text-xs tabular-nums text-muted-foreground">
            {clock(positionSec)} / {clock(totalSec)}
          </span>
          <button
            type="button"
            className={BTN}
            disabled={exportState === 'rendering'}
            onClick={() => void onExport()}
          >
            {exportState === 'rendering' ? '⏳ Rendering…' : '⬇ Export WAV'}
          </button>
          <label className={`${BTN} cursor-pointer`}>
            ⬆ Upload session
            <input
              type="file"
              accept=".md"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onUpload(f);
              }}
            />
          </label>
        </div>
        {exportState === 'error' && (
          <p className="mt-2 text-xs text-red-600 dark:text-red-400">
            Export failed — check the sample files are reachable, or try a single section rather than
            the full session.
          </p>
        )}
      </section>
    </div>
  );
}

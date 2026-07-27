'use client';
import { useEffect, useState } from 'react';
import { ELEMENTS, type ElementName } from '@/types';
import type { Mode } from '@/arrange/types';
import { useArrangement } from '@/arrange/arrangementStore';
import { useLayer2Engine } from '@/arrange/useLayer2Engine';
import { useModuleScheduler } from '@/arrange/useModuleScheduler';
import { estimatedWavBytes, exportFreeMixWav } from '@/remix/renderFreeMix';
import { adjustToWholeLoops } from '@/remix/wholeLoops';
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
  const seek = useArrangement((s) => s.seek);
  const setScrubbing = useArrangement((s) => s.setScrubbing);
  // Real sample lengths, filled in by useLayer2Engine once each file has loaded.
  const trackDurations = useArrangement((s) => s.trackDurations);

  // Always install the mix, even when resuming: initFrom seeds moduleRegions with a Layer Two
  // module template that stops at moduleSeconds, so merely flipping `playing` played ten minutes
  // of the wrong arrangement.
  const onTransport = () => {
    if (playing) pause();
    else playFreeMix(mixRegions, totalSec, positionSec);
  };
  // A full-session draw takes one rule per section, so a track can have several picks lit.
  const pickedRules = new Set(picks.map((p) => p.rule));
  // Every rule of a track comes from one element, so a track has exactly one colour.
  const trackElements = Object.fromEntries(picks.map((p) => [p.track.id, p.rule.source.element]));
  // null = not exporting. 0 = samples still downloading/decoding, which is the slow part and
  // reports nothing — the render only starts emitting progress once every sample is decoded.
  const [renderPct, setRenderPct] = useState<number | null>(null);
  const [exportFailed, setExportFailed] = useState(false);
  const [mutedIds, setMutedIds] = useState<ReadonlySet<string>>(new Set());

  const toggleMute = (trackId: string) =>
    setMutedIds((prev) => {
      const next = new Set(prev);
      if (!next.delete(trackId)) next.add(trackId);
      return next;
    });

  // Re-applied on every redraw: the engine reloads its layers when the draw changes, and a fresh
  // layer starts unmuted.
  useEffect(() => {
    for (const t of tracks) engine.setMute(t.id, mutedIds.has(t.id));
  }, [engine, tracks, mutedIds]);

  // Trim every interval to a whole number of loops so nothing is cut mid-sample. Needs the engine's
  // reported sample lengths, so it does nothing until those arrive.
  const [wholeLoops, setWholeLoops] = useState(false);
  const mixRegions = wholeLoops ? adjustToWholeLoops(regions, trackDurations, totalSec) : regions;

  // Mute is part of the mix, not just monitoring — a muted track is absent from the export too.
  const audible = tracks.filter((t) => !mutedIds.has(t.id));
  const audibleRegions = mixRegions.filter((r) => !mutedIds.has(r.trackId));

  const onExport = async () => {
    setExportFailed(false);
    setRenderPct(0);
    try {
      const blob = await exportFreeMixWav({
        tracks: audible, regions: audibleRegions, totalSec, masterDb, onProgress: setRenderPct,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = section ? `remix-${section.toLowerCase()}.wav` : 'remix.wav';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // Offline rendering decodes whole samples; a missing file or an out-of-memory render both
      // land here, and both used to look identical to nothing happening.
      setExportFailed(true);
    } finally {
      setRenderPct(null);
    }
  };

  const exportLabel =
    renderPct === null ? '⬇ Export WAV'
      : renderPct === 0 ? '⏳ Loading samples…'
        : `⏳ Rendering ${Math.round(renderPct * 100)}%`;

  // Which element an uploaded session is filed under. The server stores it with that prefix, which
  // is how loadSessions finds it again — it is not inferred from the file's name.
  const [uploadAs, setUploadAs] = useState<ElementName>(ELEMENTS[0]);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const onUpload = async (file: File) => {
    setUploadError(null);
    try {
      const markdown = await file.text();
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, markdown, element: uploadAs }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) { setUploadError(body.error ?? 'upload failed'); return; }
      await refetch();
    } catch {
      setUploadError('upload failed');
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {loading && <p className="text-sm text-muted-foreground">Loading rules…</p>}
      {warnings.length > 0 && (
        <details className="text-xs text-amber-600 dark:text-amber-400">
          <summary className="cursor-pointer">
            {warnings.length} warning{warnings.length > 1 ? 's' : ''}
          </summary>
          <ul className="mt-1 list-disc pl-5">
            {warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </details>
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
          regions={mixRegions}
          totalSec={totalSec}
          tracks={tracks}
          positionSec={positionSec}
          trackElements={trackElements}
          onScrub={seek}
          onScrubStart={() => setScrubbing(true)}
          onScrubEnd={() => setScrubbing(false)}
          mutedIds={mutedIds}
          onToggleMute={toggleMute}
          trackDurations={trackDurations}
        />
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button type="button" className={BTN_PRIMARY} onClick={regenerate}>🎲 Regenerate</button>
          <button type="button" className={BTN} onClick={onTransport}>
            {playing ? '⏸ Pause' : '▶ Play'}
          </button>
          <span data-testid="transport-clock" className="text-xs tabular-nums text-muted-foreground">
            {clock(positionSec)} / {clock(totalSec)}
          </span>
          <label
            className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground"
            title="Resize every interval to a whole number of loops, so no sample is cut part-way through a pass. Rounds to the nearest whole loop, never below one."
          >
            <input
              type="checkbox"
              checked={wholeLoops}
              onChange={(e) => setWholeLoops(e.target.checked)}
              style={{ accentColor: 'var(--accent-ink)' }}
            />
            Adjust intervals to whole loops
          </label>
          <button
            type="button"
            className={BTN}
            disabled={renderPct !== null}
            title={`≈${Math.round(estimatedWavBytes(totalSec) / 1e6)} MB WAV — samples are decoded whole, so a full session is heavy`}
            onClick={() => void onExport()}
          >
            {exportLabel}
          </button>
          <label className={`${BTN} cursor-pointer`}>
            ⬆ Upload session
            <input
              type="file"
              accept=".md"
              aria-label="Session file"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onUpload(f);
                e.target.value = ''; // let the same file be re-uploaded after a fix
              }}
            />
          </label>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            Upload as
            <select
              value={uploadAs}
              onChange={(e) => setUploadAs(e.target.value as ElementName)}
              className="rounded-md border border-border bg-transparent px-1.5 py-1 text-xs"
            >
              {ELEMENTS.map((el) => <option key={el} value={el}>{el}</option>)}
            </select>
          </label>
        </div>
        {uploadError && (
          <p className="mt-2 text-xs text-red-600 dark:text-red-400">Upload failed — {uploadError}</p>
        )}
        {exportFailed && (
          <p className="mt-2 text-xs text-red-600 dark:text-red-400">
            Export failed — check the sample files are reachable, or try a single section rather than
            the full session.
          </p>
        )}
      </section>
    </div>
  );
}

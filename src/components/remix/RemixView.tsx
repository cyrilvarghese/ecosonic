'use client';
import { ELEMENTS } from '@/types';
import { useArrangement } from '@/arrange/arrangementStore';
import { exportFreeMixWav } from '@/remix/renderFreeMix';
import { useRemix, type RemixMode } from './useRemix';
import { TrackPoolRow } from './TrackPoolRow';
import { ResultTimeline } from './ResultTimeline';

const BTN = 'rounded-md border border-border px-3 py-1.5 text-sm transition-calm hover:bg-muted/40';
const BTN_PRIMARY = 'rounded-md bg-[var(--accent-ink)] px-3 py-1.5 text-sm font-medium text-white';
const PILL = 'rounded px-3 py-1 text-sm transition-calm';
const CHIP = 'rounded-full border px-2.5 py-0.5 text-xs transition-calm';
const LIT = 'border-[var(--accent-ink)] bg-[var(--accent-ink)] text-white';

const MODES: { value: RemixMode; label: string }[] = [
  { value: 'cross', label: 'Cross-element' },
  { value: 'scoped', label: 'Scoped' },
];
const HINT: Record<RemixMode, string> = {
  cross: 'every track draws from the whole pool — its sample follows the element it picked',
  scoped: "every track draws from one element's rules, and that element's samples",
};

export function RemixView() {
  const {
    tracks, picks, regions, totalSec, warnings, loading,
    mode, element, candidatesFor, setMode, setElement, regenerate, refetch,
  } = useRemix();
  const masterDb = useArrangement((s) => s.masterDb);
  const playFreeMix = useArrangement((s) => s.playFreeMix);
  const pickByTrack = new Map(picks.map((p) => [p.track.id, p]));

  const onExport = async () => {
    const blob = await exportFreeMixWav({ tracks, regions, totalSec, masterDb });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'remix.wav';
    a.click();
    URL.revokeObjectURL(url);
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
              pick={pickByTrack.get(t.id)}
            />
          ))
        )}
      </section>

      <section className="rounded-[var(--radius-md)] border border-[var(--accent-ink)] bg-card p-4">
        <h3 className="mb-2 text-sm font-medium">Final result — full session</h3>
        <ResultTimeline regions={regions} totalSec={totalSec} tracks={tracks} />
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className={BTN_PRIMARY} onClick={regenerate}>🎲 Regenerate</button>
          <button type="button" className={BTN} onClick={() => playFreeMix(regions, totalSec)}>▶ Play</button>
          <button type="button" className={BTN} onClick={() => void onExport()}>⬇ Export WAV</button>
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
      </section>
    </div>
  );
}

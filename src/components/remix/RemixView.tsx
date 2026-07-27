'use client';
import { useArrangement } from '@/arrange/arrangementStore';
import { poolFor } from '@/remix/sessionRules';
import { exportFreeMixWav } from '@/remix/renderFreeMix';
import { useRemix } from './useRemix';
import { TrackPoolRow } from './TrackPoolRow';
import { ResultTimeline } from './ResultTimeline';

const BTN = 'rounded-md border border-border px-3 py-1.5 text-sm transition-calm hover:bg-muted/40';
const BTN_PRIMARY = 'rounded-md bg-[var(--accent-ink)] px-3 py-1.5 text-sm font-medium text-white';

export function RemixView() {
  const { tracks, picks, regions, totalSec, store, warnings, loading, regenerate, refetch } = useRemix();
  const masterDb = useArrangement((s) => s.masterDb);
  const playFreeMix = useArrangement((s) => s.playFreeMix);
  const pickByTrack = new Map(picks.map((p) => [p.trackId, p]));

  if (tracks.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Set up an Arrangement first — the Remix view draws on its tracks &amp; samples.
      </p>
    );
  }

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
        <p className="text-xs text-amber-600 dark:text-amber-400">{warnings.length} parser warning(s)</p>
      )}

      <section>
        <h2 className="mb-1 text-base font-medium">Tracks — pool &amp; pick</h2>
        {tracks.map((t) => (
          <TrackPoolRow key={t.id} track={t} candidates={poolFor(store, t.category)} pick={pickByTrack.get(t.id)} />
        ))}
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

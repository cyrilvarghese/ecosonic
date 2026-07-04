'use client';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Play, Pause } from 'lucide-react';
import { useArrangement } from '@/arrange/arrangementStore';
import { useLayer2Engine } from '@/arrange/useLayer2Engine';
import { useArrangementScheduler } from '@/arrange/useArrangementScheduler';
import { trackScalarAt } from '@/arrange/trackScalar';
import { ModuleBand } from '@/components/layer2/ModuleBand';
import { Button } from '@/components/ui/button';
import { config } from '@/config';

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export function ArrangeScreen() {
  const router = useRouter();
  const engine = useLayer2Engine();
  useArrangementScheduler(engine);

  const composition = useArrangement((s) => s.composition);
  const playing = useArrangement((s) => s.playing);
  const positionSec = useArrangement((s) => s.positionSec);
  const durationMin = useArrangement((s) => s.durationMin);
  const play = useArrangement((s) => s.play);
  const pause = useArrangement((s) => s.pause);
  const setDurationMin = useArrangement((s) => s.setDurationMin);

  if (!composition) return null;
  const total = composition.totalSec;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" aria-label="Return to Layer One" onClick={() => router.push('/layer1')}>
            <ArrowLeft size={18} />
          </Button>
          <div>
            <p className="label">Layer Two — Arrangement Engine</p>
            <h1 className="text-lg font-medium">Generative Wave Module Sequencing</h1>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex gap-1">
            {config.layerTwo.durationPresetsMin.map((min) => (
              <button
                key={min}
                onClick={() => setDurationMin(min)}
                className={`rounded-full px-3 py-1 text-xs tabular-nums transition-calm ${
                  durationMin === min ? 'bg-[var(--accent-ink)] text-white' : 'bg-card text-muted-foreground'
                }`}
              >
                {min}m
              </button>
            ))}
          </div>
          <button
            type="button"
            aria-label={playing ? 'Pause' : 'Play'}
            onClick={() => (playing ? pause() : play())}
            className="flex h-12 w-12 items-center justify-center rounded-full text-white shadow-lg transition-calm hover:scale-105"
            style={{ background: 'var(--accent-ink)' }}
          >
            {playing ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" className="translate-x-[1px]" />}
          </button>
          <span className="w-24 text-right text-sm tabular-nums text-muted-foreground">
            {clock(positionSec)} / {clock(total)}
          </span>
        </div>
      </header>

      <div className="p-6">
        <ModuleBand sequence={composition.sequence} totalSec={total} positionSec={positionSec} />
      </div>

      <main className="flex flex-1 flex-col gap-1.5 overflow-y-auto px-6 pb-6">
        {composition.tracks.map((track) => {
          const scalar = trackScalarAt(composition, track, positionSec);
          return (
            <div key={track.id} className="flex items-center gap-3 rounded-[var(--radius-md)] border border-border bg-card px-4 py-2.5">
              <div className="w-28 shrink-0">
                <div className="label">{track.category}</div>
                <div className="truncate text-sm text-foreground">{track.sample.name}</div>
              </div>
              <div className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-200"
                  style={{ width: `${scalar * 100}%`, background: 'var(--accent-ink)' }}
                />
              </div>
              <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">
                {Math.round(scalar * 100)}
              </span>
            </div>
          );
        })}
      </main>
    </div>
  );
}

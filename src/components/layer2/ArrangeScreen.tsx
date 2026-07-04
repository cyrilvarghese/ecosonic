'use client';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Play, Pause } from 'lucide-react';
import { useArrangement } from '@/arrange/arrangementStore';
import { useLayer2Engine } from '@/arrange/useLayer2Engine';
import { useModuleScheduler } from '@/arrange/useModuleScheduler';
import { ModuleDesigner } from '@/components/layer2/ModuleDesigner';
import { Button } from '@/components/ui/button';
import { config } from '@/config';

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export function ArrangeScreen() {
  const router = useRouter();
  const engine = useLayer2Engine();
  useModuleScheduler(engine);

  const tracks = useArrangement((s) => s.tracks);
  const moduleRegions = useArrangement((s) => s.moduleRegions);
  const trackDurations = useArrangement((s) => s.trackDurations);
  const playing = useArrangement((s) => s.playing);
  const positionSec = useArrangement((s) => s.positionSec);
  const play = useArrangement((s) => s.play);
  const pause = useArrangement((s) => s.pause);

  const D = config.layerTwo.moduleSeconds;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" aria-label="Return to Layer One" onClick={() => router.push('/layer1')}>
            <ArrowLeft size={18} />
          </Button>
          <div>
            <p className="label">Layer Two — Module Designer</p>
            <h1 className="text-lg font-medium">Orchestrate when each track comes in &amp; out</h1>
          </div>
        </div>

        <div className="flex items-center gap-4">
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
            {clock(positionSec)} / {clock(D)}
          </span>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-6">
        <p className="mb-4 text-sm text-muted-foreground">
          Drag a clip's <b>edges</b> to set when each track enters/exits, or its <b>body</b> to move it.
          On play, a track <b>starts from 0</b> when its clip begins (your baked fade-in plays) — it loops if the
          sample is shorter than the clip, or is cut if longer.
        </p>
        <ModuleDesigner tracks={tracks} regions={moduleRegions} trackDurations={trackDurations} positionSec={positionSec} playing={playing} />
      </main>
    </div>
  );
}

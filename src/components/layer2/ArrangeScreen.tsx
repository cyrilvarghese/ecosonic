'use client';
import type { CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Play, Pause } from 'lucide-react';
import { useArrangement } from '@/arrange/arrangementStore';
import { useLayer2Engine } from '@/arrange/useLayer2Engine';
import { useModuleScheduler } from '@/arrange/useModuleScheduler';
import { DRIFTS } from '@/arrange/types';
import { ModuleDesigner } from '@/components/layer2/ModuleDesigner';
import { Button } from '@/components/ui/button';
import { config } from '@/config';

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export function ArrangeScreen() {
  const router = useRouter();
  const engine = useLayer2Engine();
  useModuleScheduler(engine);

  const element = useArrangement((s) => s.element);
  const tracks = useArrangement((s) => s.tracks);
  const moduleRegions = useArrangement((s) => s.moduleRegions);
  const trackDurations = useArrangement((s) => s.trackDurations);
  const playing = useArrangement((s) => s.playing);
  const positionSec = useArrangement((s) => s.positionSec);
  const play = useArrangement((s) => s.play);
  const pause = useArrangement((s) => s.pause);
  const seek = useArrangement((s) => s.seek);
  const setScrubbing = useArrangement((s) => s.setScrubbing);
  const activeMode = useArrangement((s) => s.activeMode);
  const loadMode = useArrangement((s) => s.loadMode);
  const drift = useArrangement((s) => s.drift);
  const setDrift = useArrangement((s) => s.setDrift);
  const generateModule = useArrangement((s) => s.generateModule);

  const D = config.layerTwo.moduleSeconds;
  const el = element ? element.toLowerCase() : undefined;
  // Inherit the chosen element's accent theme, same tokens as Layer One's builder.
  const themeStyle = el
    ? ({
        '--accent': `var(--c-${el})`,
        '--accent-ink': `var(--ink-${el})`,
        '--ring': `var(--c-${el})`,
        background:
          'radial-gradient(125% 70% at 50% 0%, color-mix(in oklch, var(--accent) 14%, var(--background)), var(--background) 60%)',
      } as CSSProperties)
    : undefined;

  return (
    <div data-element={el} className="flex min-h-screen flex-col bg-background" style={themeStyle}>
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
          <input
            type="range"
            min={0}
            max={D}
            step={1}
            value={positionSec}
            onChange={(e) => seek(Number(e.target.value))}
            onPointerDown={() => setScrubbing(true)}
            onPointerUp={() => setScrubbing(false)}
            onPointerCancel={() => setScrubbing(false)}
            aria-label="Scrub playback position"
            className="w-64 cursor-pointer"
            style={{ accentColor: 'var(--accent-ink)' }}
          />
          <span className="w-24 text-right text-sm tabular-nums text-muted-foreground">
            {clock(positionSec)} / {clock(D)}
          </span>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-6">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="label mr-1">Mode</span>
          {config.layerTwo.modes.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => loadMode(m)}
              aria-pressed={activeMode === m}
              className={`rounded-full px-3.5 py-1 text-xs transition-calm ${
                activeMode === m ? 'text-white' : 'bg-card text-muted-foreground hover:text-foreground'
              }`}
              style={activeMode === m ? { background: 'var(--accent-ink)' } : undefined}
            >
              {m.split('_').map((w) => w.charAt(0) + w.slice(1).toLowerCase()).join(' ')}
            </button>
          ))}
          <span className="ml-1 text-xs text-muted-foreground">— clicking loads that mode&apos;s tracks from its density table</span>
          <span className="mx-2 h-4 w-px bg-border" aria-hidden />
          <span className="label mr-1">Variation</span>
          {DRIFTS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDrift(d)}
              aria-pressed={drift === d}
              className={`rounded-full px-3 py-1 text-xs transition-calm ${
                drift === d ? 'text-white' : 'bg-card text-muted-foreground hover:text-foreground'
              }`}
              style={drift === d ? { background: 'var(--accent-ink)' } : undefined}
            >
              {d.charAt(0) + d.slice(1).toLowerCase()}
            </button>
          ))}
          <button
            type="button"
            onClick={() => generateModule()}
            className="ml-2 rounded-full border border-border px-3.5 py-1 text-xs transition-calm hover:text-foreground"
          >
            Generate
          </button>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          Drag a clip's <b>edges</b> to set when each track enters/exits, or its <b>body</b> to move it.
          On play, a track plays from the <b>playhead position</b> into its sample — it loops if the sample is
          shorter than the clip, or is cut if longer. Scrub to re-audition a section.
        </p>
        <ModuleDesigner tracks={tracks} regions={moduleRegions} trackDurations={trackDurations} positionSec={positionSec} />
      </main>
    </div>
  );
}

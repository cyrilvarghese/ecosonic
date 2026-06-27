'use client';
import { Play, Pause, RefreshCw } from 'lucide-react';
import { useSession } from '@/session/appStore';
import { config } from '@/config';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Visualizer } from '@/components/Visualizer';

const { minDb, maxDb } = config.audio.volume;

export function TransportBar({ getAnalyser }: { getAnalyser?: () => AnalyserNode | null }) {
  const globalPlaying = useSession((s) => s.globalPlaying);
  const toggleGlobalPlaying = useSession((s) => s.toggleGlobalPlaying);
  const masterVolumeDb = useSession((s) => s.project.masterVolumeDb);
  const setMasterVolumeDb = useSession((s) => s.setMasterVolumeDb);
  const regenerate = useSession((s) => s.regenerate);

  return (
    <div
      className="sticky bottom-0 flex items-center gap-6 border-t bg-card px-6 py-4 backdrop-blur"
      style={{ borderColor: 'color-mix(in oklch, var(--accent) 40%, var(--border))' }}
    >
      {/* Left: master volume */}
      <div className="flex shrink-0 items-center gap-2">
        <span className="label">Master</span>
        <div className="w-40">
          <Slider min={minDb} max={maxDb} step={1} value={[masterVolumeDb]}
            onValueChange={(v) => setMasterVolumeDb(Array.isArray(v) ? (v as number[])[0] : (v as number))}
            aria-label="Master volume" />
        </div>
        <span className="w-12 text-right text-xs tabular-nums text-muted-foreground">{masterVolumeDb} dB</span>
      </div>

      {/* Center: master analyser visualization with the play button floating on top */}
      <div className="relative flex h-16 flex-1 items-center justify-center">
        {getAnalyser && (
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2">
            <Visualizer getAnalyser={getAnalyser} />
          </div>
        )}
        <button
          type="button"
          aria-label={globalPlaying ? 'Pause' : 'Play all'}
          onClick={toggleGlobalPlaying}
          className={`relative z-10 flex h-16 w-16 items-center justify-center rounded-full text-white shadow-xl transition-calm hover:scale-105 focus:outline-none focus-visible:ring-4 focus-visible:ring-[var(--ring)] ${
            globalPlaying ? 'glow-accent' : ''
          }`}
          style={{ background: 'var(--accent-ink)' }}
        >
          {globalPlaying ? <Pause size={26} fill="currentColor" /> : <Play size={26} fill="currentColor" className="translate-x-[2px]" />}
        </button>
      </div>

      {/* Right: regenerate */}
      <Button variant="outline" aria-label="Regenerate" onClick={regenerate} className="shrink-0">
        <RefreshCw size={16} />
        <span className="ml-2">Regenerate</span>
      </Button>
    </div>
  );
}

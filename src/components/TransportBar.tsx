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
    <div className="sticky bottom-0 flex items-center gap-6 border-t border-border bg-card px-6 py-4 backdrop-blur">
      <Button size="lg" aria-label="Play all" onClick={toggleGlobalPlaying}
        className="rounded-full" style={{ background: 'var(--accent)' }}>
        {globalPlaying ? <Pause size={20} /> : <Play size={20} />}
        <span className="ml-2">{globalPlaying ? 'Pause' : 'Play all'}</span>
      </Button>

      <div className="flex items-center gap-2">
        <span className="label">Master</span>
        <div className="w-40">
          <Slider min={minDb} max={maxDb} step={1} value={[masterVolumeDb]}
            onValueChange={(v) => setMasterVolumeDb(Array.isArray(v) ? (v as number[])[0] : (v as number))}
            aria-label="Master volume" />
        </div>
        <span className="w-12 text-right text-xs tabular-nums text-muted-foreground">{masterVolumeDb} dB</span>
      </div>

      {getAnalyser && <Visualizer getAnalyser={getAnalyser} />}

      <Button variant="outline" aria-label="Regenerate" onClick={regenerate}>
        <RefreshCw size={16} />
        <span className="ml-2">Regenerate</span>
      </Button>
    </div>
  );
}

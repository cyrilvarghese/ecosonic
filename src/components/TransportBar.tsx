'use client';
import { Play, Pause } from 'lucide-react';
import { useSession } from '@/session/appStore';
import { config } from '@/config';
import { Visualizer } from '@/components/Visualizer';

const { minDb, maxDb } = config.audio.volume;

export function TransportBar({ getAnalyser }: { getAnalyser?: () => AnalyserNode | null }) {
  const globalPlaying = useSession((s) => s.globalPlaying);
  const toggleGlobalPlaying = useSession((s) => s.toggleGlobalPlaying);
  const masterVolumeDb = useSession((s) => s.project.masterVolumeDb);
  const setMasterVolumeDb = useSession((s) => s.setMasterVolumeDb);

  return (
    <div
      className="sticky bottom-0 flex items-center gap-3 border-t bg-card px-10 py-4 backdrop-blur"
      style={{ borderColor: 'color-mix(in oklch, var(--accent) 40%, var(--border))' }}
    >
      {/* Column 1: label (right-aligned, sits beside the waveform like the track labels) */}
      <div className="w-28 shrink-0 text-right">
        <span className="label">Master</span>
      </div>

      {/* Column 2: master waveform — same column as the track waveforms; play floats on top */}
      <div className="relative flex h-16 min-w-0 flex-1 items-center">
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

      {/* Column 3: master volume — same fixed-width control column as the track lanes */}
      <div className="flex w-96 shrink-0 items-center justify-end gap-2">
        <input
          type="range"
          min={minDb}
          max={maxDb}
          step={1}
          value={masterVolumeDb}
          onChange={(e) => setMasterVolumeDb(Number(e.target.value))}
          aria-label="Master volume"
          className="w-28 shrink-0 cursor-pointer"
          style={{ accentColor: 'var(--accent-ink)' }}
        />
        <span className="w-14 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{masterVolumeDb} dB</span>
      </div>
    </div>
  );
}

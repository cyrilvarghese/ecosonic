'use client';
import { Play, Pause, Volume2, VolumeX, RefreshCw, Lock, Unlock } from 'lucide-react';
import { useSession } from '@/session/appStore';
import { config } from '@/config';
import { Button } from '@/components/ui/button';
import { LaneVisualizer } from '@/components/LaneVisualizer';

const { minDb, maxDb } = config.audio.volume;

export function TrackLane({ trackId }: { trackId: string }) {
  const track = useSession((s) => s.project.tracks.find((t) => t.id === trackId));
  const setTrackVolumeDb = useSession((s) => s.setTrackVolumeDb);
  const toggleMute = useSession((s) => s.toggleMute);
  const toggleLock = useSession((s) => s.toggleLock);
  const toggleTrackPlaying = useSession((s) => s.toggleTrackPlaying);
  const changeTrack = useSession((s) => s.changeTrack);

  if (!track) return null;
  const { label, sample, volumeDb, muted, playing, locked } = track;

  return (
    <div
      className={`flex items-center gap-3 rounded-[var(--radius-md)] border bg-card px-4 py-3 backdrop-blur transition-calm hover:bg-card/90 ${
        locked ? 'border-[var(--accent)] ring-1 ring-[var(--accent)]' : 'border-border'
      }`}
    >
      {/* Column 1: label */}
      <div className="w-28 shrink-0">
        <div className="label">{label}</div>
        <div className="truncate text-sm text-foreground">{sample.name}</div>
      </div>

      {/* Column 2: waveform (flexible, yields) */}
      <div className="min-w-0 flex-1">
        <LaneVisualizer trackId={trackId} />
      </div>

      {/* Column 3: controls (fixed width — keeps waveforms aligned across rows) */}
      <div className="flex w-96 shrink-0 items-center justify-end gap-2">
        <Button variant="ghost" size="icon" className="shrink-0" aria-label={`${playing ? 'Pause' : 'Play'} ${label}`}
          onClick={() => toggleTrackPlaying(trackId)}>
          {playing ? <Pause size={16} /> : <Play size={16} />}
        </Button>

        <Button variant="ghost" size="icon" className="shrink-0" aria-label={`Mute ${label}`}
          onClick={() => toggleMute(trackId)}>
          {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
        </Button>

        <input
          type="range"
          min={minDb}
          max={maxDb}
          step={1}
          value={volumeDb}
          onChange={(e) => setTrackVolumeDb(trackId, Number(e.target.value))}
          aria-label={`Volume ${label}`}
          className="w-28 shrink-0 cursor-pointer"
          style={{ accentColor: 'var(--accent-ink)' }}
        />
        <span className="w-14 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{volumeDb} dB</span>

        <Button variant="ghost" size="icon" className="shrink-0" aria-label={`Change ${label}`}
          disabled={locked} onClick={() => changeTrack(trackId)}>
          <RefreshCw size={16} />
        </Button>

        <Button variant="ghost" size="icon" aria-label={`Lock ${label}`}
          onClick={() => toggleLock(trackId)}
          className={`shrink-0 ${locked ? 'text-[var(--accent-ink)]' : 'text-muted-foreground'}`}
          style={locked ? { background: 'color-mix(in oklch, var(--accent) 22%, transparent)' } : undefined}>
          {locked ? <Lock size={16} /> : <Unlock size={16} />}
        </Button>
      </div>
    </div>
  );
}

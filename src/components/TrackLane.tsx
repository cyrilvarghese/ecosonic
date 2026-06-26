'use client';
import { Play, Pause, Volume2, VolumeX, RefreshCw, Lock, Unlock } from 'lucide-react';
import { useSession } from '@/session/appStore';
import { config } from '@/config';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { WaveformStrip } from '@/components/WaveformStrip';

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
    <div className="flex items-center gap-3 rounded-[var(--radius-md)] border border-border bg-card px-4 py-3 backdrop-blur transition-calm hover:bg-card/90">
      <div className="w-32 shrink-0">
        <div className="label">{label}</div>
        <div className="truncate text-sm text-foreground">{sample.name}</div>
      </div>

      <WaveformStrip seed={sample.path} />

      <Button variant="ghost" size="icon" aria-label={`${playing ? 'Pause' : 'Play'} ${label}`}
        onClick={() => toggleTrackPlaying(trackId)}>
        {playing ? <Pause size={16} /> : <Play size={16} />}
      </Button>

      <Button variant="ghost" size="icon" aria-label={`Mute ${label}`}
        onClick={() => toggleMute(trackId)}>
        {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
      </Button>

      <div className="flex w-40 items-center gap-2">
        <Slider min={minDb} max={maxDb} step={1} value={[volumeDb]}
          onValueChange={(v) => setTrackVolumeDb(trackId, Array.isArray(v) ? (v as number[])[0] : (v as number))} aria-label={`Volume ${label}`} />
        <span className="w-12 text-right text-xs tabular-nums text-muted-foreground">{volumeDb} dB</span>
      </div>

      <Button variant="ghost" size="icon" aria-label={`Change ${label}`}
        disabled={locked} onClick={() => changeTrack(trackId)}>
        <RefreshCw size={16} />
      </Button>

      <Button variant="ghost" size="icon" aria-label={`Lock ${label}`}
        onClick={() => toggleLock(trackId)}>
        {locked ? <Lock size={16} /> : <Unlock size={16} />}
      </Button>
    </div>
  );
}

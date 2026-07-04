'use client';
import { useEffect, useRef } from 'react';
import { AudioEngine, type TrackAudioSpec } from '@/audio/AudioEngine';
import { arrangementStore } from '@/arrange/arrangementStore';
import { config } from '@/config';

/** Mount an audio engine for Layer Two: load the snapshotted tracks (all playing,
 *  envelopes at 0 until the scheduler drives them) and gate the context on `playing`. */
export function useLayer2Engine(): AudioEngine {
  const ref = useRef<AudioEngine | null>(null);
  if (!ref.current) {
    ref.current = new AudioEngine({
      thresholdBytes: config.audio.hybridThresholdBytes,
      minDb: config.audio.volume.minDb,
      muteRampMs: config.audio.volume.muteRampMs,
      changeRampMs: config.audio.volume.changeRampMs,
    });
  }
  const engine = ref.current;

  useEffect(() => {
    const comp = arrangementStore.getState().composition;
    if (!comp) return;
    const specs: TrackAudioSpec[] = comp.tracks.map((t) => ({
      id: t.id, path: t.sample.path, bytes: t.sample.bytes,
      volumeDb: t.ceilingDb, muted: false, playing: true,
    }));
    engine.setMasterVolume(comp.masterDb);
    void engine.setTracks(specs).then(() => {
      for (const t of comp.tracks) engine.setTrackEnvelope(t.id, 0); // silent until the scheduler drives them
    });

    let wasPlaying = false;
    const unsub = arrangementStore.subscribe((s) => {
      if (s.playing === wasPlaying) return;
      wasPlaying = s.playing;
      if (s.playing) void engine.play();
      else engine.pause();
    });
    return () => { unsub(); engine.clear(); };
  }, [engine]);

  return engine;
}

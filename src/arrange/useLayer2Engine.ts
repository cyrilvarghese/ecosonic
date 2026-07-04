'use client';
import { useEffect, useRef } from 'react';
import { AudioEngine, type TrackAudioSpec } from '@/audio/AudioEngine';
import { arrangementStore } from '@/arrange/arrangementStore';
import { config } from '@/config';

/** Mount an audio engine for Layer Two: load the handed-off tracks (not started), and
 *  resume/suspend the context on play/pause. The scheduler triggers each track from 0. */
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
    const st = arrangementStore.getState();
    if (!st.tracks.length) return;
    const specs: TrackAudioSpec[] = st.tracks.map((t) => ({
      id: t.id, path: t.sample.path, bytes: t.sample.bytes,
      volumeDb: t.ceilingDb, muted: false, playing: false, // loaded, not started; scheduler triggers from 0
    }));
    engine.setMasterVolume(st.masterDb);

    let cancelled = false;
    void engine.setTracks(specs).then(() => {
      // Sample durations only exist after load (esp. streamed <audio>); poll until known.
      const collect = (attempt: number) => {
        if (cancelled) return;
        let missing = false;
        for (const t of st.tracks) {
          const dur = engine.getLayerDuration(t.id);
          if (dur && dur > 0) arrangementStore.getState().setTrackDuration(t.id, dur);
          else missing = true;
        }
        if (missing && attempt < 20) setTimeout(() => collect(attempt + 1), 300);
      };
      collect(0);
    });

    let wasPlaying = false;
    const unsub = arrangementStore.subscribe((s) => {
      if (s.playing === wasPlaying) return;
      wasPlaying = s.playing;
      if (s.playing) engine.resumeContext();
      else engine.suspendContext();
    });
    return () => { cancelled = true; unsub(); engine.clear(); };
  }, [engine]);

  return engine;
}

'use client';
import { useEffect, useRef } from 'react';
import { AudioEngine, type TrackAudioSpec } from '@/audio/AudioEngine';
import { arrangementStore, useArrangement } from '@/arrange/arrangementStore';
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
      effects: config.audio.effects,
    });
  }
  const engine = ref.current;

  // Reload whenever the set of tracks or their samples changes. Layer Two hands its tracks over once
  // before mount, but /remix derives its own after a fetch and redraws them on every regenerate — a
  // mount-only load would leave the engine empty there forever. A joined string, so an unchanged
  // track list is Object.is-equal and costs no re-render.
  const trackKey = useArrangement((s) => s.tracks.map((t) => `${t.id}:${t.sample.path}`).join('|'));

  useEffect(() => {
    const st = arrangementStore.getState();
    const specs: TrackAudioSpec[] = st.tracks.map((t) => ({
      id: t.id, path: t.sample.path, bytes: t.sample.bytes,
      volumeDb: t.ceilingDb, muted: false, playing: false, // loaded, not started; scheduler triggers from 0
      reverbSend: 0, delaySend: 0, // wired to the store's trackSends in a later step
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
    const ceilings = new Map(st.tracks.map((t) => [t.id, t.ceilingDb]));
    const unsub = arrangementStore.subscribe((s) => {
      // Per-track volume ceiling (Layer Two slider) — ramp the layer's gain like Layer One does.
      for (const t of s.tracks) {
        if (ceilings.get(t.id) !== t.ceilingDb) {
          ceilings.set(t.id, t.ceilingDb);
          engine.setTrackVolume(t.id, t.ceilingDb);
        }
      }
      if (s.playing !== wasPlaying) {
        wasPlaying = s.playing;
        if (s.playing) engine.resumeContext();
        else engine.suspendContext();
      }
    });
    return () => { cancelled = true; unsub(); engine.clear(); };
  }, [engine, trackKey]);

  return engine;
}

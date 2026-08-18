'use client';
import { useEffect, useRef } from 'react';
import { AudioEngine, type TrackAudioSpec } from '@/audio/AudioEngine';
import { arrangementStore, useArrangement } from '@/arrange/arrangementStore';
import { config } from '@/config';
import { DRY } from '@/audio/effects';

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
      reverbSend: (st.trackSends[t.id] ?? DRY).reverb,
      delaySend: (st.trackSends[t.id] ?? DRY).delay,
    }));
    engine.setMasterVolume(st.masterDb);

    let cancelled = false;
    void engine.setTracks(specs).catch(() => {
      // setTracks isolates per-layer failures, so reaching here means something broader broke. The
      // collect pass below still runs: a lane that will never report must stop waiting, not pulse
      // forever with nothing said.
    }).then(() => {
      // Sample durations only exist after load (esp. streamed <audio>); poll until known.
      const collect = (attempt: number) => {
        if (cancelled) return;
        let missing = false;
        for (const t of st.tracks) {
          const failed = engine.getLoadError(t.id);
          if (failed) { arrangementStore.getState().setSampleError(t.id, failed); continue; }
          const dur = engine.getLayerDuration(t.id);
          if (dur && dur > 0) arrangementStore.getState().setTrackDuration(t.id, dur);
          else missing = true;
        }
        if (missing && attempt < 20) { setTimeout(() => collect(attempt + 1), 300); return; }
        // Out of attempts: whatever is still silent is not coming. Say so rather than leaving the
        // lane pulsing, which is indistinguishable from "still downloading" and never resolves.
        if (missing) {
          for (const t of st.tracks) {
            if (!engine.getLayerDuration(t.id) && !engine.getLoadError(t.id)) {
              arrangementStore.getState().setSampleError(t.id, 'sample never reported a length');
            }
          }
        }
      };
      collect(0);
    });

    let wasPlaying = false;
    const ceilings = new Map(st.tracks.map((t) => [t.id, t.ceilingDb]));
    const sends = new Map(st.tracks.map((t) => [t.id, st.trackSends[t.id] ?? DRY]));
    const unsub = arrangementStore.subscribe((s) => {
      // Re-publish any length the store has lost. initFrom clears trackDurations on every redraw,
      // and a redraw that changes nothing about the audio — locking a category pins its seed, so the
      // draw comes out identical — leaves trackKey untouched, so the effect above never re-runs and
      // collect() never fires again. Without this the lengths went and did not come back: the
      // skeleton returned for good on something that never touched a sample.
      for (const t of s.tracks) {
        if (s.trackDurations[t.id]) continue;
        const dur = engine.getLayerDuration(t.id);
        if (dur && dur > 0) arrangementStore.getState().setTrackDuration(t.id, dur);
      }
      // Per-track volume ceiling (Layer Two slider) — ramp the layer's gain like Layer One does.
      for (const t of s.tracks) {
        if (ceilings.get(t.id) !== t.ceilingDb) {
          ceilings.set(t.id, t.ceilingDb);
          engine.setTrackVolume(t.id, t.ceilingDb);
        }
      }
      // Aux sends. These ride the subscription, not trackKey — putting them in trackKey would
      // re-fetch and re-decode every sample on each slider movement.
      for (const t of s.tracks) {
        const next = s.trackSends[t.id] ?? DRY;
        const prev = sends.get(t.id) ?? DRY;
        if (prev.reverb !== next.reverb) engine.setTrackSend(t.id, 'reverb', next.reverb);
        if (prev.delay !== next.delay) engine.setTrackSend(t.id, 'delay', next.delay);
        sends.set(t.id, next);
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

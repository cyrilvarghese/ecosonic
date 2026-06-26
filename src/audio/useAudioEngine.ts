'use client';
import { useEffect, useRef } from 'react';
import { AudioEngine, type TrackAudioSpec } from '@/audio/AudioEngine';
import { sessionStore } from '@/session/appStore';
import type { SessionState } from '@/session/sessionStore';
import { config } from '@/config';
import type { Track } from '@/types';

function toSpec(t: Track): TrackAudioSpec {
  return {
    id: t.id, path: t.sample.path, bytes: t.sample.bytes,
    volumeDb: t.volumeDb, muted: t.muted, playing: t.playing,
  };
}

async function reconcile(engine: AudioEngine, prev: SessionState | undefined, next: SessionState) {
  const p = prev?.project;
  const n = next.project;

  const membershipChanged =
    !p ||
    p.tracks.length !== n.tracks.length ||
    n.tracks.some((t, i) => p.tracks[i]?.id !== t.id || p.tracks[i]?.sample.path !== t.sample.path);

  if (membershipChanged) {
    await engine.setTracks(n.tracks.map(toSpec));
  } else {
    for (const t of n.tracks) {
      const before = p.tracks.find((x) => x.id === t.id);
      if (!before || before.volumeDb !== t.volumeDb) engine.setTrackVolume(t.id, t.volumeDb);
      if (!before || before.muted !== t.muted) engine.setMute(t.id, t.muted);
      if (!before || before.playing !== t.playing) engine.setTrackPlaying(t.id, t.playing);
    }
  }

  if (!p || p.masterVolumeDb !== n.masterVolumeDb) engine.setMasterVolume(n.masterVolumeDb);

  if (!prev || prev.globalPlaying !== next.globalPlaying) {
    if (next.globalPlaying) await engine.play();
    else engine.pause();
  }
}

export function useAudioEngine(): AudioEngine {
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
    let prev = sessionStore.getState();
    void reconcile(engine, undefined, prev);
    const unsub = sessionStore.subscribe((state) => {
      const before = prev;
      prev = state;
      void reconcile(engine, before, state);
    });
    return () => { unsub(); engine.clear(); };
  }, [engine]);

  return engine;
}

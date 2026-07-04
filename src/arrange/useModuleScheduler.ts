'use client';
import { useEffect } from 'react';
import type { AudioEngine } from '@/audio/AudioEngine';
import { arrangementStore } from '@/arrange/arrangementStore';
import { config } from '@/config';

/** Loop the module clock and control each track's PLAYBACK: when the playhead enters a
 *  clip, start that track from 0 (baked fade-in plays); when it leaves, stop it. */
export function useModuleScheduler(engine: AudioEngine): void {
  useEffect(() => {
    let raf = 0;
    let last: number | null = null;
    let wasScrubbing = false;
    let wasPlaying = false;
    const active = new Set<string>();
    const D = config.layerTwo.moduleSeconds;

    const frame = (now: number) => {
      const st = arrangementStore.getState();
      if (st.playing) {
        const t = now / 1000;
        const dt = last === null ? 0 : t - last;
        last = t;
        // While scrubbing, hold the position the slider set; otherwise advance & loop.
        let pos = st.positionSec;
        if (!st.scrubbing) {
          pos += dt;
          if (pos >= D) pos -= D;
          st.setPosition(pos);
        }
        // On a position jump (scrub released, or playback (re)started after a seek), re-seek
        // every present track to the SAMPLE OFFSET for `pos` — so a mid-clip playhead plays
        // mid-sample, not from 0. During normal forward play, sources stay in sync on their own.
        const resync = (wasScrubbing && !st.scrubbing) || !wasPlaying;
        wasScrubbing = st.scrubbing;
        wasPlaying = true;

        for (const track of st.tracks) {
          const region = st.moduleRegions.find((r) => r.trackId === track.id);
          const inside = !!region && pos >= region.enterSec && pos < region.exitSec;
          const was = active.has(track.id);
          if (inside && region && (!was || resync)) {
            active.add(track.id);
            engine.triggerTrack(track.id, pos - region.enterSec);
          } else if (!inside && was) {
            active.delete(track.id);
            engine.releaseTrack(track.id);
          }
        }
      } else {
        last = null; // freeze; ctx.suspend holds the sources, so keep `active` as-is
        wasScrubbing = st.scrubbing;
        wasPlaying = false;
      }
      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      for (const id of active) engine.releaseTrack(id);
      active.clear();
    };
  }, [engine]);
}

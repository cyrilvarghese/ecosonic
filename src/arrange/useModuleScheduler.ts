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
        // Re-sync playback to `pos` — this makes scrubbing work: tracks whose clips now
        // cover the position start from 0, tracks that no longer do stop.
        for (const track of st.tracks) {
          const region = st.moduleRegions.find((r) => r.trackId === track.id);
          const inside = !!region && pos >= region.enterSec && pos < region.exitSec;
          const was = active.has(track.id);
          if (inside && !was) { active.add(track.id); engine.triggerTrack(track.id); }
          else if (!inside && was) { active.delete(track.id); engine.releaseTrack(track.id); }
        }
      } else {
        last = null; // freeze; ctx.suspend holds the sources, so keep `active` as-is
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

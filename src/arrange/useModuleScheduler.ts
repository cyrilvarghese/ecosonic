'use client';
import { useEffect } from 'react';
import type { AudioEngine } from '@/audio/AudioEngine';
import { arrangementStore } from '@/arrange/arrangementStore';
import { regionEnvAt } from '@/arrange/regionEnv';
import { config } from '@/config';

/** Loop the single module and drive each track's gain from its clip (regionEnvAt). */
export function useModuleScheduler(engine: AudioEngine): void {
  useEffect(() => {
    let raf = 0;
    let last: number | null = null;
    let sinceTick = Infinity;
    const D = config.layerTwo.moduleSeconds;
    const tickSec = config.layerTwo.schedulerTickMs / 1000;

    const frame = (now: number) => {
      const st = arrangementStore.getState();
      if (st.playing) {
        const t = now / 1000;
        const dt = last === null ? 0 : t - last;
        last = t;
        let next = st.positionSec + dt;
        if (next >= D) next -= D; // loop the module
        st.setPosition(next);
        sinceTick += dt;
        if (sinceTick >= tickSec) {
          sinceTick = 0;
          for (const track of st.tracks) {
            const region = st.moduleRegions.find((r) => r.trackId === track.id);
            engine.setTrackEnvelope(track.id, region ? regionEnvAt(region, next) : 0);
          }
        }
      } else {
        last = null;
        sinceTick = Infinity;
      }
      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [engine]);
}

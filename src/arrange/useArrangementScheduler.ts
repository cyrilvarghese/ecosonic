'use client';
import { useEffect } from 'react';
import type { AudioEngine } from '@/audio/AudioEngine';
import { arrangementStore } from '@/arrange/arrangementStore';
import { trackScalarAt } from '@/arrange/trackScalar';
import { config } from '@/config';

/** While playing, advance the session clock in real time and drive per-track envelopes. */
export function useArrangementScheduler(engine: AudioEngine): void {
  useEffect(() => {
    let raf = 0;
    let last: number | null = null;
    let sinceTick = Infinity; // force an envelope update on the first playing frame
    const tickSec = config.layerTwo.schedulerTickMs / 1000;

    const frame = (now: number) => {
      const st = arrangementStore.getState();
      if (st.playing && st.composition) {
        const t = now / 1000;
        const dt = last === null ? 0 : t - last;
        last = t;
        const next = st.positionSec + dt;
        st.setPosition(next);
        sinceTick += dt;
        if (sinceTick >= tickSec) {
          sinceTick = 0;
          for (const track of st.composition.tracks) {
            engine.setTrackEnvelope(track.id, trackScalarAt(st.composition, track, next));
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

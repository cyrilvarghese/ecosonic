'use client';
import { useEffect } from 'react';
import type { AudioEngine } from '@/audio/AudioEngine';
import { arrangementStore } from '@/arrange/arrangementStore';
import { regionEnvAt } from '@/arrange/regionEnv';
import { config } from '@/config';

/** Loop the module clock and control each track's PLAYBACK: when the playhead enters a
 *  clip, start that track (quiet, under its region fade-in); while inside, drive the region's
 *  volume envelope (~1-min fades, 0 → Layer One ceiling → 0); when it leaves, stop it. */
export function useModuleScheduler(engine: AudioEngine): void {
  useEffect(() => {
    let raf = 0;
    let last: number | null = null;
    let wasScrubbing = false;
    let wasPlaying = false;
    let sinceTick = Infinity; // force an envelope update on the first playing frame
    let sinceSteer = 0; // live-playback time accrued toward the next auto-steer
    let lastMode = arrangementStore.getState().activeMode; // detect session boundaries
    const active = new Set<string>();
    const tickSec = config.layerTwo.schedulerTickMs / 1000;
    const autoSteerSec = 60; // live playback: recompose the un-played future this often

    const frame = (now: number) => {
      const st = arrangementStore.getState();
      const D = st.durationSec ?? config.layerTwo.moduleSeconds; // free-mix loops over totalSec
      if (st.playing) {
        const t = now / 1000;
        const dt = last === null ? 0 : t - last;
        last = t;
        // While scrubbing, hold the position the slider set; otherwise advance & loop.
        let pos = st.positionSec;
        if (!st.scrubbing) {
          pos += dt;
          if (pos >= D) {
            if (st.session) {
              // Chained session: hand off to the next module (or stop after the last).
              st.advanceSession();
              raf = requestAnimationFrame(frame);
              return;
            }
            pos -= D; // single-module play loops
          }
          st.setPosition(pos);
        }
        // On a position jump (scrub released, or playback (re)started after a seek), re-seek
        // every present track to the SAMPLE OFFSET for `pos` — so a mid-clip playhead plays
        // mid-sample, not from 0. During normal forward play, sources stay in sync on their own.
        const modeChanged = st.activeMode !== lastMode;
        lastMode = st.activeMode;
        const resync = (wasScrubbing && !st.scrubbing) || !wasPlaying || modeChanged;
        wasScrubbing = st.scrubbing;
        wasPlaying = true;
        sinceTick += dt;
        const doTick = sinceTick >= tickSec;
        if (doTick) sinceTick = 0;

        for (const track of st.tracks) {
          const region = st.moduleRegions.find((r) => r.trackId === track.id);
          const inside = !!region && pos >= region.enterSec && pos < region.exitSec;
          const was = active.has(track.id);
          if (inside && region && (!was || resync)) {
            active.add(track.id);
            // Envelope first, then trigger: the track starts at the faded level (0 → ceiling
            // over the region's fadeIn), instead of blasting the ceiling and dipping.
            engine.setTrackEnvelope(track.id, regionEnvAt(region, pos));
            engine.triggerTrack(track.id, pos - region.enterSec);
          } else if (!inside && was) {
            active.delete(track.id);
            engine.releaseTrack(track.id);
          } else if (inside && region && doTick) {
            // Drive the region's volume fades (~1 min each way, capped by clip width).
            engine.setTrackEnvelope(track.id, regionEnvAt(region, pos));
          }
        }

        // Auto-compose: during live playback, recompose the un-played future on a fixed
        // cadence. The timer is just another steer trigger (spec §3: a drift change is a steer);
        // steerModule keeps the past + active entrances verbatim, so nothing audible restarts.
        if (st.live) {
          sinceSteer += dt;
          if (sinceSteer >= autoSteerSec) {
            sinceSteer = 0;
            st.steer();
          }
        } else {
          sinceSteer = 0; // frozen while not Live — restart the phase
        }
      } else {
        last = null; // freeze; ctx.suspend holds the sources, so keep `active` as-is
        wasScrubbing = st.scrubbing;
        wasPlaying = false;
        sinceTick = Infinity;
        sinceSteer = 0;
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

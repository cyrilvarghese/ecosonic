'use client';
import { useEffect, useRef, useState } from 'react';
import { useEngine } from '@/audio/EngineContext';
import { normalizeWaveform, amplitudeToY } from '@/audio/waveform';

// Resolve a cascaded CSS custom property (which [data-element] swaps) to an rgb()
// string, since canvas color parsing can't be relied on for oklch().
function resolveVar(host: HTMLElement, name: string): string {
  const probe = document.createElement('span');
  probe.style.color = `var(${name})`;
  host.appendChild(probe);
  const rgb = getComputedStyle(probe).color;
  probe.remove();
  return rgb || 'rgb(120,120,120)';
}


/**
 * Per-lane live visualization: an oscilloscope from the track's own analyser
 * (each lane reacts to its own audio) plus a playhead sweeping at the loop's
 * rate (lane width = one loop). Loop duration is shown as a crisp DOM label.
 */
export function LaneVisualizer({ trackId }: { trackId: string }) {
  const engine = useEngine();
  const ref = useRef<HTMLCanvasElement>(null);
  const [duration, setDuration] = useState<number | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const g = canvas.getContext('2d');
    if (!g) return; // jsdom / no-canvas: render nothing

    const host = canvas.parentElement ?? canvas;

    // 1×1 scratch canvas to resolve any CSS color (oklch/lab/color()) to concrete
    // sRGB bytes. Canvas fillStyle read-back can hand back lab()/oklch() we can't
    // alpha, but getImageData is always 8-bit sRGB — so we build rgba() stops from it.
    const probe = document.createElement('canvas');
    probe.width = probe.height = 1;
    const pg = probe.getContext('2d', { willReadFrequently: true });
    const toRgb = (color: string): [number, number, number] => {
      if (!pg) return [124, 92, 176];
      pg.clearRect(0, 0, 1, 1);
      pg.fillStyle = color;
      pg.fillRect(0, 0, 1, 1);
      const d = pg.getImageData(0, 0, 1, 1).data;
      return [d[0], d[1], d[2]];
    };

    let raf = 0;
    let data = new Uint8Array(1024);
    let ink = resolveVar(host, '--accent-ink');
    let [fillR, fillG, fillB] = toRgb(resolveVar(host, '--accent')); // light element tint for the trail
    let lastDur = -1;
    let tick = 0;

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (tick++ % 60 === 0) {
        ink = resolveVar(host, '--accent-ink'); // pick up re-theming
        [fillR, fillG, fillB] = toRgb(resolveVar(host, '--accent'));
      }
      g.clearRect(0, 0, w, h);
      g.globalAlpha = 1;

      // How far this loop has played (0..w). Shared by the progress trail and the dot.
      const prog = engine?.getLayerProgress(trackId) ?? null;
      const playedX = prog && prog.duration > 0 ? (prog.position / prog.duration) * w : null;

      // Progress trail: a light gradient over the region already played, brightening
      // toward the playhead. Drawn first so the waveform and dot sit on top of it.
      if (playedX != null && playedX > 0.5) {
        // Light gradient in the element's accent tint, fading in toward the playhead.
        // Kept translucent (and drawn under the waveform) so the accent-ink trace
        // stays clearly visible through the fill.
        const grad = g.createLinearGradient(0, 0, playedX, 0);
        grad.addColorStop(0, `rgba(${fillR}, ${fillG}, ${fillB}, 0)`);    // transparent at loop start
        grad.addColorStop(1, `rgba(${fillR}, ${fillG}, ${fillB}, 0.3)`);  // light accent at the playhead
        g.fillStyle = grad;
        g.fillRect(0, 0, playedX, h);
      }

      // Live oscilloscope of this track's output.
      const an = engine?.getLayerAnalyser(trackId) ?? null;
      g.strokeStyle = ink;
      g.lineWidth = 1.75;
      g.beginPath();
      if (an) {
        if (data.length !== an.fftSize) data = new Uint8Array(an.fftSize);
        an.getByteTimeDomainData(data);
        const pts = normalizeWaveform(data);
        for (let i = 0; i < pts.length; i++) {
          const x = (i / (pts.length - 1)) * w;
          const y = amplitudeToY(pts[i], h);
          if (i === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
      } else {
        g.moveTo(0, h / 2);
        g.lineTo(w, h / 2);
      }
      g.stroke();

      // Playhead: a filled dot riding the mid-line, on top of the trace and trail.
      if (playedX != null && prog) {
        const r = Math.min(4, h / 4);
        g.beginPath();
        g.arc(playedX, h / 2, r, 0, Math.PI * 2);
        g.fillStyle = ink;
        g.fill();
        // A thin light ring keeps the dot legible where it crosses the trace.
        g.lineWidth = 1.5;
        g.strokeStyle = 'rgba(255,255,255,0.85)';
        g.stroke();
        const rounded = Math.round(prog.duration * 10);
        if (rounded !== lastDur) {
          lastDur = rounded;
          setDuration(prog.duration);
        }
      }

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [engine, trackId]);

  return (
    <div className="relative h-8 w-full">
      <canvas ref={ref} className="h-full w-full" aria-hidden="true" />
      {duration != null && (
        <span
          className="pointer-events-none absolute bottom-0 right-1 rounded bg-card/70 px-1 text-[11px] font-medium tabular-nums"
          style={{ color: 'var(--accent-ink)' }}
        >
          {duration.toFixed(1)}s
        </span>
      )}
    </div>
  );
}

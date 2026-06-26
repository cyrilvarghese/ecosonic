'use client';
import { useEffect, useRef, useState } from 'react';
import { useEngine } from '@/audio/EngineContext';
import { normalizeWaveform } from '@/audio/waveform';

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
    let raf = 0;
    let data = new Uint8Array(1024);
    let ink = resolveVar(host, '--accent-ink');
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
      if (tick++ % 60 === 0) ink = resolveVar(host, '--accent-ink'); // pick up re-theming
      g.clearRect(0, 0, w, h);

      // Live oscilloscope of this track's output.
      const an = engine?.getLayerAnalyser(trackId) ?? null;
      g.strokeStyle = ink;
      g.lineWidth = 1.75;
      g.globalAlpha = 1;
      g.beginPath();
      if (an) {
        if (data.length !== an.fftSize) data = new Uint8Array(an.fftSize);
        an.getByteTimeDomainData(data);
        const pts = normalizeWaveform(data);
        for (let i = 0; i < pts.length; i++) {
          const x = (i / (pts.length - 1)) * w;
          const y = h / 2 + pts[i] * (h / 2) * 0.9;
          if (i === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
      } else {
        g.moveTo(0, h / 2);
        g.lineTo(w, h / 2);
      }
      g.stroke();

      // Playhead.
      const prog = engine?.getLayerProgress(trackId) ?? null;
      if (prog && prog.duration > 0) {
        const x = (prog.position / prog.duration) * w;
        g.fillStyle = ink;
        g.fillRect(x - 1, 0, 2, h);
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
    <div className="relative h-8 flex-1">
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

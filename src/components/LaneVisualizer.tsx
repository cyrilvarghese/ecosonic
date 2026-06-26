'use client';
import { useEffect, useRef } from 'react';
import { useEngine } from '@/audio/EngineContext';
import { normalizeWaveform } from '@/audio/waveform';

// Resolve the cascaded --accent (which [data-element] swaps) to an rgb() string,
// since canvas color parsing can't be relied on for oklch().
function resolveAccent(host: HTMLElement): string {
  const probe = document.createElement('span');
  probe.style.color = 'var(--accent)';
  host.appendChild(probe);
  const rgb = getComputedStyle(probe).color;
  probe.remove();
  return rgb || 'rgb(150,150,150)';
}

/**
 * Per-lane live visualization: an oscilloscope from the track's own analyser
 * (so each lane reacts to its own audio) plus a playhead sweeping at the loop's
 * rate (lane width = one loop) and the loop duration label.
 */
export function LaneVisualizer({ trackId }: { trackId: string }) {
  const engine = useEngine();
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const g = canvas.getContext('2d');
    if (!g) return; // jsdom / no-canvas environments: render nothing

    const host = canvas.parentElement ?? canvas;
    let raf = 0;
    let data = new Uint8Array(1024);
    let color = resolveAccent(host);
    let tick = 0;

    const draw = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
      if (tick++ % 60 === 0) color = resolveAccent(host); // pick up element re-theming

      g.clearRect(0, 0, w, h);

      // Live oscilloscope of this track's output.
      const an = engine?.getLayerAnalyser(trackId) ?? null;
      g.strokeStyle = color;
      g.lineWidth = 2;
      g.globalAlpha = 0.85;
      g.beginPath();
      if (an) {
        if (data.length !== an.fftSize) data = new Uint8Array(an.fftSize);
        an.getByteTimeDomainData(data);
        const pts = normalizeWaveform(data);
        for (let i = 0; i < pts.length; i++) {
          const x = (i / (pts.length - 1)) * w;
          const y = h / 2 + pts[i] * (h / 2) * 0.8;
          if (i === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
      } else {
        g.moveTo(0, h / 2);
        g.lineTo(w, h / 2);
      }
      g.stroke();

      // Playhead + loop-duration label.
      const prog = engine?.getLayerProgress(trackId) ?? null;
      if (prog && prog.duration > 0) {
        const x = (prog.position / prog.duration) * w;
        g.globalAlpha = 0.9;
        g.fillStyle = color;
        g.fillRect(x - 1, 0, 2, h);
        g.globalAlpha = 0.5;
        g.font = '10px sans-serif';
        g.textAlign = 'right';
        g.fillText(`${prog.duration.toFixed(1)}s`, w - 4, h - 3);
      }
      g.globalAlpha = 1;

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [engine, trackId]);

  return <canvas ref={ref} className="h-8 flex-1" aria-hidden="true" />;
}

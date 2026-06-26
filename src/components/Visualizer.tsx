'use client';
import { useEffect, useRef } from 'react';
import type p5 from 'p5';
import { normalizeWaveform } from '@/audio/waveform';

function readAccentRgb(container: HTMLElement): string {
  const probe = document.createElement('span');
  probe.style.color = 'var(--accent)';
  container.appendChild(probe);
  const rgb = getComputedStyle(probe).color;
  probe.remove();
  return rgb || 'rgb(150,150,150)';
}

export function Visualizer({ getAnalyser }: { getAnalyser: () => AnalyserNode | null }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let instance: { remove: () => void } | undefined;
    let cancelled = false;

    (async () => {
      const P5 = (await import('p5')).default;
      const container = containerRef.current;
      if (cancelled || !container) return;

      const sketch = (p: p5) => {
        let data = new Uint8Array(2048);
        p.setup = () => {
          p.createCanvas(container.clientWidth, 56).parent(container);
          p.noFill();
        };
        p.windowResized = () => p.resizeCanvas(container.clientWidth, 56);
        p.draw = () => {
          p.clear();
          const accent = readAccentRgb(container);
          p.stroke(accent);
          p.strokeWeight(2);
          const analyser = getAnalyser();
          if (!analyser) {
            p.line(0, p.height / 2, p.width, p.height / 2);
            return;
          }
          if (data.length !== analyser.fftSize) data = new Uint8Array(analyser.fftSize);
          analyser.getByteTimeDomainData(data);
          const pts = normalizeWaveform(data);
          p.beginShape();
          pts.forEach((v, i) => {
            const x = (i / (pts.length - 1)) * p.width;
            const y = p.height / 2 + v * (p.height / 2) * 0.9;
            p.vertex(x, y);
          });
          p.endShape();
        };
      };

      instance = new P5(sketch);
    })();

    return () => { cancelled = true; instance?.remove(); };
  }, [getAnalyser]);

  return <div ref={containerRef} className="h-[56px] min-w-[120px] flex-1" aria-hidden="true" />;
}

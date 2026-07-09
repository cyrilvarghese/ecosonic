// Stylized placeholder waveform: deterministic bar heights derived from a seed string.
// Cumulative hash → heights(seed, k) is a prefix of heights(seed, K) for k < K, so a partial
// repeat can render the first k bars and honestly show the start of the sample being cut.
export function heights(seed: string, count: number): number[] {
  let h = 2166136261;
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    h ^= seed.charCodeAt(i % seed.length) + i;
    h = Math.imul(h, 16777619);
    out.push(0.2 + (((h >>> 8) & 0xff) / 255) * 0.8); // 0.2..1.0
  }
  return out;
}

export function WaveformStrip({ seed, bars = 48 }: { seed: string; bars?: number }) {
  return (
    <div className="flex h-8 flex-1 items-center gap-[2px] opacity-70" aria-hidden="true">
      {heights(seed, bars).map((v, i) => (
        <span
          key={i}
          style={{ height: `${Math.round(v * 100)}%`, background: 'var(--accent)' }}
          className="w-full rounded-full"
        />
      ))}
    </div>
  );
}

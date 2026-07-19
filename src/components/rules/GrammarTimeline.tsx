'use client';
import { config } from '@/config';
import { CATEGORIES } from '@/rules/analysisSchema';
import type { GrammarSpan } from '@/rules/inventory';

type Family = 'bed' | 'tonal' | 'harmonic' | 'melodic';
const ROLE_FAMILY: Record<(typeof CATEGORIES)[number], Family> = {
  NOISE: 'bed', ELEMENT: 'bed', ELEMENT_SUB: 'bed', FX: 'bed',
  ISO: 'tonal', PLANET: 'tonal', DRONE: 'tonal',
  PAD: 'harmonic', BASS: 'harmonic',
  ARP: 'melodic', MELODY: 'melodic',
};
// Validated with dataviz validate_palette.js (light + dark): all checks pass;
// the CVD ΔE 7.2 sits in the legal 6–8 band, backed by the per-lane text labels.
const FAMILY_COLOR: Record<Family, string> = {
  bed: '#3d6fd0', tonal: '#2aa758', harmonic: '#cf7d1a', melodic: '#b048c0',
};
const FAMILIES: Family[] = ['bed', 'tonal', 'harmonic', 'melodic'];

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export function GrammarTimeline({ spans }: { spans: GrammarSpan[] }) {
  const D = config.layerTwo.moduleSeconds;
  const pct = (s: number) => Math.max(0, Math.min(100, (s / D) * 100));
  const minutes = Array.from({ length: Math.floor(D / 60) + 1 }, (_, i) => i * 60);
  const lanes = [...CATEGORIES].reverse();
  const modes = config.layerTwo.modes;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
        {FAMILIES.map((f) => (
          <span key={f} className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-[2px]" style={{ background: FAMILY_COLOR[f] }} />
            {f}
          </span>
        ))}
      </div>

      {modes.map((mode) => (
        <div key={mode} className="flex flex-col gap-1">
          <div className="text-xs font-medium">{mode}</div>
          <div className="flex gap-3 text-[11px] tabular-nums text-muted-foreground">
            <span className="w-24 shrink-0" />
            <span className="flex flex-1 justify-between">
              {minutes.map((m) => <span key={m}>{clock(m)}</span>)}
            </span>
          </div>
          {lanes.map((category) => {
            const span = spans.find((s) => s.mode === mode && s.category === category);
            const family = ROLE_FAMILY[category];
            return (
              <div key={category} className="flex items-center gap-3">
                <div className="label w-24 shrink-0">{category}</div>
                <div className="relative h-6 flex-1 overflow-hidden rounded-md bg-muted">
                  {minutes.slice(1, -1).map((m) => (
                    <div key={m} className="absolute inset-y-0 w-px bg-foreground/10" style={{ left: `${pct(m)}%` }} aria-hidden />
                  ))}
                  {span && (() => {
                    const right = pct(span.exit === 'MODULE_END' ? D : span.exit);
                    const left = pct(span.enterCanon);
                    const width = Math.max(0, right - left);
                    const alpha = 0.4 + 0.6 * span.present;
                    const barDur = span.exit === 'MODULE_END' ? D - span.enterCanon : span.exit - span.enterCanon;
                    const fadeInPct = barDur > 0 ? (span.fadeIn / barDur) * 100 : 0;
                    const fadeOutPct = barDur > 0 ? (span.fadeOut / barDur) * 100 : 0;
                    return (
                      <>
                        {span.enterHalf > 0 && (
                          <div className="absolute inset-y-0 bg-foreground/15" aria-hidden
                            style={{ left: `${pct(span.enterCanon - span.enterHalf)}%`, width: `${pct(2 * span.enterHalf)}%` }} />
                        )}
                        <div className="absolute inset-y-1 rounded-[4px]" aria-hidden
                          title={`${category} · ${clock(span.enterCanon)}±${span.enterHalf}s → ${span.exit === 'MODULE_END' ? 'end' : clock(span.exit)} · fade ${span.fadeIn}/${span.fadeOut}s · present ${span.present}${span.after ? ` · after ${span.after}` : ''}`}
                          style={{ left: `${left}%`, width: `${width}%`, background: FAMILY_COLOR[family], opacity: alpha }}>
                          {span.fadeIn > 0 && (
                            <div className="absolute inset-y-0 left-0 bg-gradient-to-r from-black/40 to-transparent" style={{ width: `${fadeInPct}%` }} aria-hidden />
                          )}
                          {span.fadeOut > 0 && (
                            <div className="absolute inset-y-0 right-0 bg-gradient-to-l from-black/40 to-transparent" style={{ width: `${fadeOutPct}%` }} aria-hidden />
                          )}
                        </div>
                        {span.present < 1 && (
                          <div className="absolute inset-y-0 flex items-center text-[10px] tabular-nums text-muted-foreground"
                            style={{ left: `calc(${right}% + 4px)` }}>{span.present.toFixed(2)}</div>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

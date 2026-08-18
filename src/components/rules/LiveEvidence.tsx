'use client';
import { ELEMENTS } from '@/types';
import { config } from '@/config';
import manifestJson from '@/manifest.json';
import storeJson from '@/sessionStore.json';
import type { Manifest } from '@/types';
import type { RuleStore } from '@/remix/sessionRules';
import {
  categoryDefaults, coverageMatrix, planetPairs, sectionWindows, SECTION_LABELS,
} from '@/rules/liveFacts';
import { STRINGS, type Lang } from '@/rules/strings';

const manifest = manifestJson as unknown as Manifest;
const store = (storeJson as unknown as { store: RuleStore }).store;

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const titleCase = (el: string) => el[0] + el.slice(1).toLowerCase();

/** A rule's evidence: the live data it governs, sitting under the prose that describes it. This is
 *  what makes the page an inspector rather than a copy of the doc. */
function Panel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section
      data-testid="live-panel"
      className="mt-3 rounded-[var(--radius-md)] border border-[var(--accent-ink)]/25 bg-card p-3"
    >
      <h4 className="mb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--accent-ink)]">
        {label}
      </h4>
      {children}
    </section>
  );
}

const HEAD = 'px-2 py-1 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground';

/** §3.6 — every category × element: what is authored, what ships, and what that means. */
function Coverage({ lang }: { lang: Lang }) {
  const t = STRINGS[lang];
  const rows = coverageMatrix(store, manifest);
  const dead = rows.flatMap((r) => r.cells.filter((c) => c.dead).map((c) => `${r.category}·${c.element}`));
  return (
    <Panel label={t.panels.coverage}>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs tabular-nums">
          <thead>
            <tr>
              <th className={HEAD}>category</th>
              {ELEMENTS.map((e) => <th key={e} className={`${HEAD} text-center`}>{titleCase(e)}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.category}>
                <td className="px-2 py-1 text-xs font-medium">{r.category}</td>
                {r.cells.map((c) => (
                  <td
                    key={c.element}
                    title={`${c.rules} rule${c.rules === 1 ? '' : 's'}, ${c.samples} sample${c.samples === 1 ? '' : 's'}`}
                    className={`px-2 py-1 text-center ${
                      c.dead
                        ? 'bg-red-500/15 font-medium text-red-600 dark:text-red-400'
                        : c.unused
                          ? 'text-muted-foreground/50'
                          : c.sounds ? 'text-foreground' : 'text-muted-foreground/30'
                    }`}
                  >
                    {c.rules === 0 && c.samples === 0 ? '·' : `${c.rules}/${c.samples}`}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
        {t.coverageLegend(dead.length === 0 ? '' : `Dead: ${dead.join(', ')}.`)}
      </p>
    </Panel>
  );
}

/** §3.5a — the two bodies each element ships, which is exactly what the pair of lanes plays. */
function Planets({ lang }: { lang: Lang }) {
  const t = STRINGS[lang];
  return (
    <Panel label={t.panels.planets}>
      <ul className="flex flex-col gap-1 text-xs">
        {planetPairs(manifest).map(({ element, bodies }) => (
          <li key={element} className="flex gap-2" data-element={element.toLowerCase()}>
            <span className="w-14 shrink-0 font-medium text-[var(--accent-ink)]">{titleCase(element)}</span>
            <span className="text-muted-foreground">{bodies.join(' · ') || '—'}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/** §2.3 — where each element actually opens each section. */
function Windows({ lang }: { lang: Lang }) {
  const t = STRINGS[lang];
  return (
    <Panel label={t.panels.windows}>
      <table className="w-full border-collapse text-xs tabular-nums">
        <thead>
          <tr>
            <th className={HEAD}>element</th>
            {SECTION_LABELS.map((s) => <th key={s} className={HEAD}>{s}</th>)}
          </tr>
        </thead>
        <tbody>
          {sectionWindows(store).map(({ element, starts }) => (
            <tr key={element}>
              <td className="px-2 py-1 font-medium">{titleCase(element)}</td>
              {starts.map((sec, i) => (
                <td key={i} className="px-2 py-1 text-muted-foreground">
                  {sec === null ? '—' : clock(sec)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

/** §5a.7 — where a freshly drawn track sits before you touch anything. */
function Defaults({ lang }: { lang: Lang }) {
  const t = STRINGS[lang];
  const rows = categoryDefaults(config).filter((d) => d.notable);
  return (
    <Panel label={t.panels.defaults}>
      <table className="w-full border-collapse text-xs tabular-nums">
        <thead>
          <tr>
            <th className={HEAD}>category</th><th className={HEAD}>level</th>
            <th className={HEAD}>reverb</th><th className={HEAD}>delay</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((d) => (
            <tr key={d.category}>
              <td className="px-2 py-1 font-medium">{d.category}</td>
              <td className="px-2 py-1 text-muted-foreground">{d.db} dB</td>
              <td className="px-2 py-1 text-muted-foreground">{Math.round(d.reverb * 100)}%</td>
              <td className="px-2 py-1 text-muted-foreground">{Math.round(d.delay * 100)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[11px] text-muted-foreground">
        {t.otherCategories(config.audio.volume.defaultTrackDb, config.audio.volume.trackMinDb, config.audio.volume.trackMaxDb)}
      </p>
    </Panel>
  );
}

/** Rule id → its evidence. Opting in by id keeps the doc clean prose: it never has to know that a
 *  panel exists, and a rule without one simply renders as text. */
const PANELS: Record<string, (p: { lang: Lang }) => React.ReactElement> = {
  '2.3': Windows,
  '3.5a': Planets,
  '3.6': Coverage,
  '5a.7': Defaults,
};

export function LiveEvidence({ ruleId, lang }: { ruleId: string; lang: Lang }) {
  const Found = PANELS[ruleId];
  return Found ? <Found lang={lang} /> : null;
}

export const RULES_WITH_EVIDENCE = Object.keys(PANELS);

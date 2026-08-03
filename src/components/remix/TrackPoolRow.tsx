import type { Category } from '@/types';
import type { AuthoredRule } from '@/remix/sessionRules';
import { ruleKey, slotKey, type Pins } from '@/remix/pins';
import type { TrackSends } from '@/audio/effects';

const SECTION_ABBR: Record<AuthoredRule['section'], string> = {
  INTRODUCTION: 'I', DEEP_RELAXATION: 'Rx', RETURN: 'Rt',
};
const SECTION_LABEL: Record<AuthoredRule['section'], string> = {
  INTRODUCTION: 'Introduction', DEEP_RELAXATION: 'Deep Relaxation', RETURN: 'Return',
};

/** "WATER" → "Water" — the full element name, so a chip reads Water·Rx rather than Wat·Rx. */
const titleCase = (el: string): string => el[0] + el.slice(1).toLowerCase();

const chip = (r: AuthoredRule): string =>
  `${titleCase(r.source.element)}·${SECTION_ABBR[r.section]}${r.variant ? '*' : ''}`;

const clock = (s: number): string =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** Hover detail: which element and section a candidate came from, and when it actually sounds.
 *  A `title` matches how GrammarTimeline and AnalysisTimeline expose the same kind of detail, and
 *  stays cheap across the ~135 chips a full pool renders. */
const chipTitle = (r: AuthoredRule): string => {
  // An element can hold several sessions, so name the one this rule came from — unless it carries
  // no more than the element already says.
  const session = r.source.sessionId === r.source.element ? '' : ` · ${r.source.sessionId}`;
  return `${r.source.element}${session} · ${SECTION_LABEL[r.section]} · `
    + r.phrases.map((p) => `${clock(p.enterSec)}–${clock(p.exitSec)}`).join(', ');
};

const SEND_LABEL: Record<'reverb' | 'delay', string> = { reverb: 'Rev', delay: 'Dly' };
const SEND_A11Y: Record<'reverb' | 'delay', string> = { reverb: 'Reverb send', delay: 'Delay send' };

/** One row of layout A: a CATEGORY's pool of authored candidates, and the count. A full-session
 *  draw takes one rule per section, so several chips in a row can be lit at once.
 *
 *  The row is per category, not per lane. A category may now hold several lanes, and one row each
 *  would repeat the same chips; narrowing a row to its lane's element would instead hide the very
 *  chips you click to create a second lane. So: one row, every candidate, all lanes' picks lit — a
 *  chip already names the lane it addresses.
 *
 *  Three states: outline = not picked, filled = drawn by the generator, filled + ring = pinned by
 *  you. Omit `onPick` and the chips stay inert hints, which is what Scoped and Borrowed want —
 *  neither has a per-element lane a click could address. */
export function TrackPoolRow({
  category, candidates, picked, pins, onPick, canSound, manual, onReset, sends, onSend,
}: {
  category: Category;
  candidates: AuthoredRule[];
  picked: ReadonlySet<AuthoredRule>;
  pins?: Pins;
  onPick?: (rule: AuthoredRule) => void;
  /** True once you have taken this category over: the generator no longer draws it and its rules no
   *  longer apply to it, so what is lit is exactly what sounds. */
  manual?: boolean;
  /** Hand the category back to the generator. Shown only while `manual`. */
  onReset?: () => void;
  /** Omitted ⇒ every chip is assumed playable. A chip that answers false can never produce a lane —
   *  the element it would sound through ships no sample for this category (§3.6) — so it is shown
   *  struck through and inert rather than accepting a click that would visibly do nothing. */
  canSound?: (rule: AuthoredRule) => boolean;
  /** The reverb and delay levels this row shows. A row is a category and a category may hold several
   *  lanes, so this is the level they hold in common — `onSend` sets it on **every lane at once**.
   *  `arrangementStore.trackSends` and both exporters still key sends per lane; this control is
   *  deliberately the coarser of the two. Omit both to render no sliders. */
  sends?: TrackSends;
  onSend?: (kind: 'reverb' | 'delay', value: number) => void;
}) {
  return (
    <div
      data-testid={`pool-${category}`}
      className="grid grid-cols-[140px_1fr_auto] items-center gap-3 border-t border-border py-2"
    >
      <div className="text-sm font-medium">
        {category}
        <span className="ml-1 text-xs text-muted-foreground">{candidates.length}</span>
        {manual && (
          <span className="mt-0.5 flex items-center gap-1">
            <span
              className="rounded bg-[var(--accent-ink)]/15 px-1 text-[10px] font-normal uppercase tracking-wide text-[var(--accent-ink)]"
              title="You took this track over. The generator no longer draws it and its rules no longer apply — what is lit is exactly what sounds."
            >
              manual
            </span>
            {onReset && (
              <button
                type="button"
                onClick={onReset}
                title="Hand this track back to the generator"
                className="rounded px-1 text-[10px] font-normal text-muted-foreground transition-calm hover:bg-muted/60 hover:text-foreground"
              >
                ↺ auto
              </button>
            )}
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-1">
        {candidates.length === 0 ? (
          <span className="text-xs text-muted-foreground opacity-60">absent — no rule</span>
        ) : (
          candidates.map((c, i) => {
            const pinned = pins?.[slotKey(c)] === ruleKey(c);
            // A timing whose element ships no sample for this category can never become a lane. It
            // stays listed — it is a real authored rule, and Borrowed can still play it through
            // another element — but struck through and inert, rather than taking a click that would
            // ring the chip and then visibly do nothing.
            const mute = canSound ? !canSound(c) : false;
            // data-element rebinds --accent-ink to that element's brand colour (globals.css),
            // so a picked chip and its bars on the timeline read as the same element.
            const shared = {
              title: mute
                ? `${chipTitle(c)} — ${c.source.element} ships no ${category} sample, so this timing`
                  + ' cannot sound. Borrowed timings can play it through another element.'
                : chipTitle(c),
              'data-element': c.source.element.toLowerCase(),
              className: `rounded-full border px-2 py-0.5 text-xs ${
                mute
                  ? 'cursor-not-allowed border-dashed border-border text-muted-foreground/60 line-through'
                  : `${onPick ? 'cursor-pointer' : 'cursor-help'} ${
                    pinned || picked.has(c)
                      ? 'border-[var(--accent-ink)] bg-[var(--accent-ink)] text-white'
                      : 'border-border text-muted-foreground opacity-70'
                  } ${pinned ? 'ring-2 ring-[var(--accent-ink)] ring-offset-1' : ''}`
              }`,
            };
            return onPick && !mute ? (
              <button key={i} type="button" aria-pressed={pinned} onClick={() => onPick(c)} {...shared}>
                {chip(c)}
              </button>
            ) : (
              <span key={i} {...shared}>{chip(c)}</span>
            );
          })
        )}
      </div>
      {/* One pair of sliders for the whole category, moving every lane it holds together. */}
      <div className="flex items-center gap-3 pl-2">
        {sends && onSend && (['reverb', 'delay'] as const).map((kind) => (
          <label key={kind} className="flex items-center gap-1 text-xs text-muted-foreground">
            {SEND_LABEL[kind]}
            <input
              type="range"
              aria-label={SEND_A11Y[kind]}
              min={0}
              max={1}
              step={0.01}
              value={sends[kind]}
              onChange={(e) => onSend(kind, Number(e.target.value))}
              className="h-1 w-16 cursor-pointer"
              style={{ accentColor: 'var(--accent-ink)' }}
            />
            <span className="w-7 text-right tabular-nums">{Math.round(sends[kind] * 100)}%</span>
          </label>
        ))}
      </div>
    </div>
  );
}

import type { ArrTrack } from '@/arrange/types';
import type { AuthoredRule } from '@/remix/sessionRules';

const SECTION_ABBR: Record<AuthoredRule['section'], string> = {
  INTRODUCTION: 'I', DEEP_RELAXATION: 'Rx', RETURN: 'Rt',
};
const SECTION_LABEL: Record<AuthoredRule['section'], string> = {
  INTRODUCTION: 'Introduction', DEEP_RELAXATION: 'Deep Relaxation', RETURN: 'Return',
};

const chip = (r: AuthoredRule): string => {
  const el = r.source.element[0] + r.source.element.slice(1, 3).toLowerCase();
  return `${el}·${SECTION_ABBR[r.section]}${r.variant ? '*' : ''}`;
};

const clock = (s: number): string =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** Hover detail: which element and section a candidate came from, and when it actually sounds.
 *  A `title` matches how GrammarTimeline and AnalysisTimeline expose the same kind of detail, and
 *  stays cheap across the ~135 chips a full pool renders. */
const chipTitle = (r: AuthoredRule): string =>
  `${r.source.element} · ${SECTION_LABEL[r.section]} · ` +
  r.phrases.map((p) => `${clock(p.enterSec)}–${clock(p.exitSec)}`).join(', ');

/** One row of layout A: the track, its pool of authored candidates, and the count. A full-session
 *  draw takes one rule per section, so several chips in a row can be lit at once. */
export function TrackPoolRow({ track, candidates, picked }: {
  track: ArrTrack;
  candidates: AuthoredRule[];
  picked: ReadonlySet<AuthoredRule>;
}) {
  return (
    <div className="grid grid-cols-[140px_1fr] items-center gap-3 border-t border-border py-2">
      <div className="text-sm font-medium">
        {track.label}
        <span className="ml-1 text-xs text-muted-foreground">{candidates.length}</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {candidates.length === 0 ? (
          <span className="text-xs text-muted-foreground opacity-60">absent — no rule</span>
        ) : (
          candidates.map((c, i) => (
            <span
              key={i}
              title={chipTitle(c)}
              className={`cursor-help rounded-full border px-2 py-0.5 text-xs ${
                picked.has(c)
                  ? 'border-[var(--accent-ink)] bg-[var(--accent-ink)] text-white'
                  : 'border-border text-muted-foreground opacity-70'
              }`}
            >
              {chip(c)}
            </span>
          ))
        )}
      </div>
    </div>
  );
}

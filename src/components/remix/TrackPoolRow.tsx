import type { ArrTrack } from '@/arrange/types';
import type { AuthoredRule } from '@/remix/sessionRules';
import type { RemixPick } from '@/remix/generateRemix';

const SECTION_ABBR: Record<AuthoredRule['section'], string> = {
  INTRODUCTION: 'I', DEEP_RELAXATION: 'Rx', RETURN: 'Rt',
};
const chip = (r: AuthoredRule): string => {
  const el = r.source.element[0] + r.source.element.slice(1, 3).toLowerCase();
  return `${el}·${SECTION_ABBR[r.section]}${r.variant ? '*' : ''}`;
};

/** One row of layout A: the track, its pool of authored candidates (the drawn one lit), and count. */
export function TrackPoolRow({ track, candidates, pick }: {
  track: ArrTrack;
  candidates: AuthoredRule[];
  pick: RemixPick | undefined;
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
          candidates.map((c, i) => {
            const lit = pick?.rule === c;
            return (
              <span
                key={i}
                className={`rounded-full border px-2 py-0.5 text-xs ${
                  lit
                    ? 'border-[var(--accent-ink)] bg-[var(--accent-ink)] text-white'
                    : 'border-border text-muted-foreground opacity-70'
                }`}
              >
                {chip(c)}
              </span>
            );
          })
        )}
      </div>
    </div>
  );
}

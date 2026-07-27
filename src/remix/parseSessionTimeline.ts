import type { ElementName } from '@/types';
import type { Mode } from '@/arrange/types';
import { mapLayer } from './vocab';
import type { AuthoredRule, Phrase } from './sessionRules';

const SECTION_BY_INDEX: Mode[] = ['INTRODUCTION', 'DEEP_RELAXATION', 'RETURN'];

/** Extract the first clock (`M:SS`) from a cell, ignoring `~` and trailing text like "(Fade in)".
 *  Keyword cells ("Immediate", "Continuous", "End of section", "-") have no clock → null. */
export function parseClock(s: string): number | null {
  const m = s.match(/(\d+):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

const isBlank = (s: string): boolean => s.trim() === '' || s.trim() === '-';

/** Parse an authored session-timeline markdown table into absolute-timestamped rules.
 *  Section headers give the Mode tag + the section window (used only to resolve "End of section");
 *  times themselves stay absolute. Impossible/unknown rows are skipped with a warning. */
export function parseSessionTimeline(
  md: string,
  element: ElementName,
): { rules: AuthoredRule[]; warnings: string[] } {
  const rules: AuthoredRule[] = [];
  const warnings: string[] = [];
  const lines = md.split(/\r?\n/);
  let section: Mode | null = null;
  let sectionEnd = 0;

  for (const line of lines) {
    const header = line.match(/^##\s*Section\s*(\d)\s*-\s*[^(]*\((\d+:\d{2})-(\d+:\d{2})\)/i);
    if (header) {
      section = SECTION_BY_INDEX[Number(header[1]) - 1] ?? null;
      sectionEnd = parseClock(header[3]) ?? 0;
      continue;
    }
    if (!section || !line.trim().startsWith('|')) continue;
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length < 5) continue;
    const [name, starts, full, leaving, ends] = cells;
    if (name === 'Layer' || /^-+$/.test(name)) continue; // header row / separator
    if ([starts, full, leaving, ends].every(isBlank)) continue; // all-dash → absent

    const mapped = mapLayer(name);
    if (!mapped) {
      warnings.push(`${element} · ${section} · ${name}: unknown layer — skipped`);
      continue;
    }

    const enterSec = parseClock(starts) ?? 0;
    const exitSec = parseClock(ends) ?? sectionEnd; // "End of section"/blank → section end
    const fullClock = parseClock(full);
    const fadeInSec = fullClock !== null ? Math.max(0, fullClock - enterSec) : 0;
    const leaveClock = parseClock(leaving);
    const fadeOutSec = leaveClock !== null ? Math.max(0, exitSec - leaveClock) : 0;

    if (enterSec >= exitSec) {
      warnings.push(`${element} · ${section} · ${name}: start ${enterSec}s after end ${exitSec}s — skipped`);
      continue;
    }
    const phrase: Phrase = { enterSec, exitSec, fadeInSec, fadeOutSec };
    rules.push({
      category: mapped.category,
      variant: mapped.variant,
      section,
      phrases: [phrase],
      source: { element, sessionId: element, track: name },
    });
  }
  return { rules, warnings };
}

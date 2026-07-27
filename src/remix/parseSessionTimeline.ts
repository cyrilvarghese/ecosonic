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

/** Split the Starts cell into absolute {enter,exit} spans. A comma list yields several spans;
 *  each `a-b` span exits at b; a lone clock exits at `endClock` (the Ends cell) or the section end. */
function spansFrom(starts: string, endClock: number | null, sectionEnd: number) {
  return starts.split(',').map((s) => s.trim()).filter(Boolean).map((part) => {
    const [a, b] = part.split('-').map((x) => x.trim());
    return {
      enterSec: parseClock(a) ?? 0,
      exitSec: b !== undefined ? (parseClock(b) ?? sectionEnd) : (endClock ?? sectionEnd),
    };
  });
}

/** Parse an authored session-timeline markdown table into absolute-timestamped rules.
 *  Section headers give the Mode tag + the section window (used only to resolve "End of section");
 *  times themselves stay absolute. Multi-phrase (comma) cells and repeated same-layer rows within a
 *  section merge into one rule; impossible phrases and unknown rows are skipped with a warning. */
export function parseSessionTimeline(
  md: string,
  element: ElementName,
  /** Which session these rules came from — an element may have several, and a rule has to name its
   *  own or they are indistinguishable in the pool. Defaults to the element for callers that have
   *  no file behind them. */
  sessionId: string = element,
): { rules: AuthoredRule[]; warnings: string[] } {
  const rules: AuthoredRule[] = [];
  const warnings: string[] = [];
  const lines = md.split(/\r?\n/);
  let section: Mode | null = null;
  let sectionStart = 0;
  let sectionEnd = 0;
  let byKey = new Map<string, AuthoredRule>(); // merge repeated same-layer rows within a section

  for (const line of lines) {
    const header = line.match(/^##\s*Section\s*(\d)\s*-\s*[^(]*\((\d+:\d{2})-(\d+:\d{2})\)/i);
    if (header) {
      section = SECTION_BY_INDEX[Number(header[1]) - 1] ?? null;
      sectionStart = parseClock(header[2]) ?? 0;
      sectionEnd = parseClock(header[3]) ?? 0;
      byKey = new Map();
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

    const spans = spansFrom(starts, parseClock(ends), sectionEnd);
    if (spans.length === 0) continue;
    const first = spans[0];
    const last = spans[spans.length - 1];
    const fullClock = parseClock(full);
    const leaveClock = parseClock(leaving);
    const fadeInSec = fullClock !== null ? Math.max(0, fullClock - first.enterSec) : 0;
    const fadeOutSec = leaveClock !== null ? Math.max(0, last.exitSec - leaveClock) : 0;

    const phrases: Phrase[] = [];
    spans.forEach((s, i) => {
      if (s.enterSec >= s.exitSec) {
        warnings.push(`${element} · ${section} · ${name}: start ${s.enterSec}s after end ${s.exitSec}s — skipped`);
        return;
      }
      phrases.push({
        ...s,
        fadeInSec: i === 0 ? fadeInSec : 0,
        fadeOutSec: i === spans.length - 1 ? fadeOutSec : 0,
      });
    });
    if (phrases.length === 0) continue;

    const key = `${mapped.category}|${mapped.variant ?? ''}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.phrases.push(...phrases);
    } else {
      const rule: AuthoredRule = {
        category: mapped.category,
        variant: mapped.variant,
        section,
        sectionStartSec: sectionStart,
        phrases,
        source: { element, sessionId, track: name },
      };
      byKey.set(key, rule);
      rules.push(rule);
    }
  }
  return { rules, warnings };
}

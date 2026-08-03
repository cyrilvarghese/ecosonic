import type { Category, ElementName } from '@/types';
import type { Mode } from '@/arrange/types';
import type { AuthoredRule } from './sessionRules';

/** Identifies a rule by CONTENT. `AuthoredRule` has no id, and `refetch()` rebuilds every rule
 *  object, so a pin held by object identity would not survive one upload. Asserted unique across the
 *  shipped pool in pins.test.ts — a collision would make two timings indistinguishable to a pin. */
export const ruleKey = (r: AuthoredRule): string =>
  `${r.source.sessionId}|${r.source.track}|${r.section}`;

/** The slot a pin fills: one lane (category × element) and one of its sections. Deliberately not
 *  unique per rule — several candidates compete for a slot, and picking one is what a pin is. */
export const slotKey = (r: AuthoredRule): string =>
  `${r.category}|${r.source.element}|${r.section}`;

/** `slotKey` from its parts, for callers that hold a lane rather than a rule. */
export const slotKeyFor = (category: Category, element: ElementName, section: Mode): string =>
  `${category}|${element}|${section}`;

/** slotKey → ruleKey, the timings chosen by hand for one category. A pin whose ruleKey no longer
 *  resolves — the session was edited or removed — is dropped silently by whoever reads it. */
export type Pins = Record<string, string>;

/** category → its hand-chosen timings. A category present here is **manual**: the user has taken it
 *  over, so the generator neither draws it nor applies its rules to it — no one-lane-per-category,
 *  no lanesPerTrack, no lead element. What is listed is exactly what sounds.
 *
 *  Absent ⇒ the category is still generated, by whichever mode is on. Rules govern generation; they
 *  do not govern you. */
export type Manual = Record<string, Pins>;

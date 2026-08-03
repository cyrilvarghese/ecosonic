import type { Category, ElementName } from '@/types';
import type { Mode } from '@/arrange/types';

/** One absolute-timestamped segment of an authored rule (seconds on the 0..totalSec timeline). */
export interface Phrase {
  enterSec: number;
  exitSec: number;
  fadeInSec: number;
  fadeOutSec: number;
}

/** One authored rule for a track: ≥1 phrases. `section` is a metadata tag (where it was authored),
 *  not a render boundary — times are absolute. */
export interface AuthoredRule {
  category: Category;
  variant?: string;
  section: Mode;
  /** Absolute seconds at which this rule's section window opens — AIR authors Deep Relaxation at
   *  9:30, every other element at 10:00. The origin a section-scoped draw rebases against, so it
   *  must come from the authored header, never from a section index. */
  sectionStartSec: number;
  phrases: Phrase[];
  source: { element: ElementName; sessionId: string; track: string };
}

export interface SessionDoc {
  id: string;
  element: ElementName;
  label: string;
  rules: AuthoredRule[];
}

export type RuleStore = Record<ElementName, SessionDoc[]>;

/** Every authored rule of a category, across all elements and sessions. Empty ⇒ track is absent. */
export function poolFor(store: RuleStore, category: Category): AuthoredRule[] {
  const out: AuthoredRule[] = [];
  for (const docs of Object.values(store)) {
    for (const doc of docs) {
      for (const r of doc.rules) if (r.category === category) out.push(r);
    }
  }
  return out;
}

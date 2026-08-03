import type { RuleStore } from '@/remix/sessionRules';
import baked from '@/sessionStore.json';

export interface SessionStore {
  store: RuleStore;
  warnings: string[];
}

// The single place /remix gets its authored rules from — the session equivalent of
// resolveSampleUrl.
//
// Locally the API route reads config/sessions/*.md off disk, so uploading a session still works.
// Hosted there is no route: the app is a static export, and reaching for /api/sessions would get
// the 404 page back. The same data is baked at build time by scripts/build-sessions.ts, which is
// sound because the route does no request-time work — it parses tracked markdown with a pure
// function.
export async function loadSessionStore(): Promise<SessionStore> {
  if (process.env.NEXT_PUBLIC_STATIC_EXPORT) return baked as unknown as SessionStore;

  const res = await fetch('/api/sessions');
  // Checked before parsing: res.json() on an error page throws a SyntaxError that says nothing
  // about what actually went wrong.
  if (!res.ok) throw new Error(`/api/sessions responded ${res.status}`);
  return (await res.json()) as SessionStore;
}

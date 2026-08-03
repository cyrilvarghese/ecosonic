// Bake the authored session timelines into a JSON the client can import.
//
// /api/sessions reads config/sessions/*.md and parses them with a pure function. There is no user
// state and no request-time I/O — it is build-time data wearing a runtime costume. Hosted as a
// static export there is no route to serve it, so the same result is produced here instead.
//
// The output is committed: it is derived from tracked markdown, and committing it means dev,
// vitest, `build:web` and Vercel all have it without an ordering dance. Re-run after changing or
// uploading a session — the same publish-by-committing loop config/discovered-rules.json uses.
//
//   npm run build:sessions

import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { loadSessions } from '../src/remix/loadSessions';

const OUT = path.join(process.cwd(), 'src', 'sessionStore.json');

const { store, warnings } = loadSessions();

writeFileSync(OUT, JSON.stringify({ store, warnings }, null, 2) + '\n');

const docs = Object.values(store).flat();
const rules = docs.reduce((n, d) => n + d.rules.length, 0);
console.log(
  `Wrote ${OUT} — ${docs.length} sessions, ${rules} rules` +
    (warnings.length ? `, ${warnings.length} parser warnings` : ''),
);

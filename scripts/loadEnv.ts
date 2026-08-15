import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/** Minimal `.env.local` reader — these scripts run under tsx, outside Next, which would otherwise
 *  load the file for them. Node's own `--env-file` would do as well; this keeps the behaviour in the
 *  script rather than in however it happened to be invoked, so running the file directly works too.
 *
 *  Existing environment wins (`??=`), so `FOO=bar npm run …` still overrides the file. */
export function loadEnv(file = path.join(process.cwd(), '.env.local')): void {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (line.trimStart().startsWith('#')) continue;
    const m = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    // Strip surrounding quotes; leave everything else exactly as written.
    process.env[m[1]] ??= m[2].trim().replace(/^["'](.*)["']$/, '$1');
  }
}

/** Read a variable that the script cannot run without, and say where to put it if it is missing. */
export function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set — add it to .env.local`);
  return v;
}

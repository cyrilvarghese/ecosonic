// Build a static export of the app for web hosting (Vercel + R2 audio).
//
// The hosted app is the instrument only. Two parts of the tree cannot ship:
//   src/app/api   — Route Handlers can't be part of a static export at all, and the
//                   analyze/rules/analyses ones need a writable disk and an API key.
//   src/app/rules — the authoring page, whose every button calls those routes.
// Both are moved aside for the build and ALWAYS moved back — `npm run dev` is untouched.
//
// `.next/dev` is also cleared first: `next dev` generates per-route type validators
// there, and a stale one referencing a stashed route fails the build's type check.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stashDir = path.join(root, ".web-build-tmp");
const nextCli = path.join(root, "node_modules", "next", "dist", "bin", "next");

// Each entry is moved to <stashDir>/<key> for the duration of the build.
const EXCLUDED = [
  { key: "api", from: path.join(root, "src", "app", "api") },
  { key: "rules", from: path.join(root, "src", "app", "rules") },
];

// Move every stashed directory back, then PROVE it worked. This script relocates real
// source files, so "I tried to restore" is not good enough — an unverified restore that
// silently leaves source in the stash is indistinguishable from data loss.
async function restoreAll() {
  for (const { key, from } of EXCLUDED) {
    const stashed = path.join(stashDir, key);
    if (existsSync(stashed) && !existsSync(from)) {
      await rename(stashed, from);
    }
  }

  const orphaned = EXCLUDED.filter(({ from }) => !existsSync(from));
  if (orphaned.length > 0) {
    throw new Error(
      `[build-web] RESTORE FAILED — source is still in ${stashDir}:\n` +
        orphaned.map(({ key, from }) => `  ${path.relative(root, from)} <- ${key}`).join("\n") +
        `\nMove it back by hand before doing anything else. Do NOT 'git checkout' these ` +
        `paths — that would discard any uncommitted changes still held in the stash.`,
    );
  }

  // Only safe to drop the stash once every directory is confirmed home.
  if (existsSync(stashDir)) {
    await rm(stashDir, { recursive: true, force: true });
  }
}

async function main() {
  // Recover from a previous crashed run before doing anything.
  await restoreAll();

  try {
    await mkdir(stashDir, { recursive: true });
    for (const { key, from } of EXCLUDED) {
      if (existsSync(from)) {
        await rename(from, path.join(stashDir, key));
        console.log(`[build-web] moved ${path.relative(root, from)} aside for static export`);
      }
    }

    // Drop dev-generated route type validators; they still reference the stashed routes.
    await rm(path.join(root, ".next", "dev"), { recursive: true, force: true });

    const result = spawnSync(process.execPath, [nextCli, "build"], {
      cwd: root,
      stdio: "inherit",
      env: { ...process.env, BUILD_TARGET: "web" },
    });

    if (result.status !== 0) {
      throw new Error(`next build exited with code ${result.status}`);
    }
    console.log("[build-web] static export written to out/");
  } finally {
    // Throws if anything is still stashed, so this line only ever prints the truth.
    await restoreAll();
    console.log("[build-web] verified src/app/api and src/app/rules are back in place");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

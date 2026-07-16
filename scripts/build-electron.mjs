// Build a static export of the app for the Electron desktop shell.
//
// Route Handlers that read the request (our /api/samples streamer) cannot be part of
// a Next.js static export. So we temporarily move src/app/api out of the tree, run
// `next build` with output:'export', then ALWAYS move it back — web `npm run dev`
// keeps using the API route unchanged.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const apiDir = path.join(root, "src", "app", "api");
const stashDir = path.join(root, ".electron-build-tmp");
const stashedApi = path.join(stashDir, "api");
const nextCli = path.join(root, "node_modules", "next", "dist", "bin", "next");

async function restoreApi() {
  if (existsSync(stashedApi) && !existsSync(apiDir)) {
    await rename(stashedApi, apiDir);
  }
  if (existsSync(stashDir)) {
    await rm(stashDir, { recursive: true, force: true });
  }
}

async function main() {
  // Recover from a previous crashed run before doing anything.
  await restoreApi();

  const hasApi = existsSync(apiDir);
  try {
    if (hasApi) {
      await mkdir(stashDir, { recursive: true });
      await rename(apiDir, stashedApi);
      console.log("[build-electron] moved src/app/api aside for static export");
    }

    const result = spawnSync(process.execPath, [nextCli, "build"], {
      cwd: root,
      stdio: "inherit",
      env: { ...process.env, BUILD_TARGET: "electron" },
    });

    if (result.status !== 0) {
      throw new Error(`next build exited with code ${result.status}`);
    }
    console.log("[build-electron] static export written to out/");
  } finally {
    await restoreApi();
    console.log("[build-electron] restored src/app/api");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

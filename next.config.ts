import type { NextConfig } from "next";

// Two static-export targets, both serving the instrument (/, /layer1, /layer2) with no
// server at runtime. Local dev/build (unset BUILD_TARGET) keeps the default server
// behaviour, including the /api/samples route and the /rules authoring page.
//
//   electron → desktop shell, serves out/ over the ecosonic:// protocol
//   web      → Vercel, serves out/ as static files with audio fetched from R2
const target = process.env.BUILD_TARGET;

// The default next/image optimizer needs a server; disable it for any export.
//
// NEXT_PUBLIC_STATIC_EXPORT is set by the build target rather than configured by hand: it means
// "this bundle has no API routes", which is a fact about how it was built, not a deployment
// preference. Client code branches on it to read baked data instead of fetching (src/sessions.ts)
// and to hide controls that would post to routes that are not there.
const exportBase: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  env: { NEXT_PUBLIC_STATIC_EXPORT: "true" },
};

const nextConfig: NextConfig =
  target === "electron"
    ? {
        ...exportBase,
        // Emit directory-style routes (layer2/index.html) so the protocol handler can
        // map ecosonic://app/layer2/ to a real file. Vercel resolves clean URLs itself,
        // so the web target deliberately omits this.
        trailingSlash: true,
      }
    : target === "web"
      ? exportBase
      : {};

export default nextConfig;

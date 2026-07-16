import type { NextConfig } from "next";

// When BUILD_TARGET=electron, produce a static export (out/) for the desktop app.
// The Electron shell serves it via the ecosonic:// protocol, so there is no server
// at runtime. Web dev/build (unset BUILD_TARGET) keeps the default server behaviour,
// including the /api/samples route.
const isElectron = process.env.BUILD_TARGET === "electron";

const nextConfig: NextConfig = isElectron
  ? {
      output: "export",
      // Emit directory-style routes (layer2/index.html) so the protocol handler can
      // map ecosonic://app/layer2/ to a real file.
      trailingSlash: true,
      // The default next/image optimizer needs a server; disable it for export.
      images: { unoptimized: true },
    }
  : {};

export default nextConfig;

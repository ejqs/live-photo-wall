import type { NextConfig } from "next";

/** identifies this build so open walls and pages can tell when a newer one is deployed */
const buildId = (process.env.RAILWAY_GIT_COMMIT_SHA || process.env.GITHUB_SHA || `local-${Date.now()}`).slice(0, 12);

const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_BUILD_ID: buildId },
  serverExternalPackages: ["sharp", "heic-convert", "archiver"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;

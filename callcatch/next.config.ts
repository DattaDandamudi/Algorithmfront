import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The app may live inside a parent repo with its own lockfile; pin the workspace root here.
  turbopack: { root: process.cwd() },
  outputFileTracingRoot: process.cwd(),
};

export default nextConfig;

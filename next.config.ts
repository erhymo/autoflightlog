import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  // Pin the workspace root: a stray lockfile in the parent home directory
  // otherwise makes Next.js infer the wrong root and fail to resolve
  // node_modules (e.g. tailwindcss) in `next dev`.
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;

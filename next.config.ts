import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    // Explicitly set the workspace root to this project to avoid lockfile confusion
    root: path.resolve(__dirname),
  },
};

export default nextConfig;

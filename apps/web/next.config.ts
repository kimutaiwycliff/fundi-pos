import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  // Required for the Dockerfile's slim runtime stage (docker/README.md).
  output: 'standalone',
};

export default nextConfig;

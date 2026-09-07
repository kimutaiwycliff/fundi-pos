import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  // Required for the Dockerfile's slim runtime stage (docker/README.md).
  output: 'standalone',
  images: {
    remotePatterns: [
      // Blog cover images (post-images collection) are served straight from
      // Cloudflare R2's public bucket URL (payload.config.ts's
      // generateFileURL) - not proxied through this app. Falls back to the
      // generic *.r2.dev pattern for local dev where R2_PUBLIC_URL is unset.
      process.env.R2_PUBLIC_URL
        ? { protocol: 'https', hostname: new URL(process.env.R2_PUBLIC_URL).hostname }
        : { protocol: 'https', hostname: '*.r2.dev' },
    ],
  },
};

export default nextConfig;

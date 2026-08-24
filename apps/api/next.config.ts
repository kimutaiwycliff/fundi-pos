import type { NextConfig } from 'next';
import { withPayload } from '@payloadcms/next/withPayload';

const nextConfig: NextConfig = {
  // Required for the Dockerfile's slim runtime stage (docker/README.md) -
  // without this, the production image needs the full monorepo node_modules
  // instead of Next's pruned dependency graph.
  output: 'standalone',
};

export default withPayload(nextConfig);

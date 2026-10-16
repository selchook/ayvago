import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript sources; let Next compile them.
  transpilePackages: ['@ayvago/shared'],
  poweredByHeader: false,
};

export default nextConfig;

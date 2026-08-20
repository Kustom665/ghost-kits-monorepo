import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // node:sqlite is a built-in; keep it out of the bundler's hands.
  serverExternalPackages: ['node:sqlite'],
};

export default nextConfig;

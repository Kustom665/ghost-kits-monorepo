import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // node:sqlite is a built-in; keep it out of the bundler's hands.
  serverExternalPackages: ['node:sqlite'],
  allowedDevOrigins: [
    'localhost:3000',
    'localhost:8080',
    '*.run.app',
    '**.run.app',
    '*.google.com',
    '**.google.com',
  ],
};

export default nextConfig;

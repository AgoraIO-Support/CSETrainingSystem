/** @type {import('next').NextConfig} */
const { PHASE_PRODUCTION_BUILD } = require('next/constants')

module.exports = (phase) => {
  const isProductionBuild = phase === PHASE_PRODUCTION_BUILD

  return {
    images: {
      domains: ['localhost', 'images.unsplash.com', 'api.dicebear.com'],
      remotePatterns: [
        {
          protocol: 'https',
          hostname: '**',
        },
      ],
    },
    // Enable standalone output for Docker
    // Note: `output: "standalone"` can cause flaky dev builds in some environments
    // (missing `.next/server/vendor-chunks/*` files). Keep it for production builds only.
    output: isProductionBuild ? 'standalone' : undefined,
    eslint: {
      // Warning: This allows production builds to successfully complete even if
      // your project has ESLint errors.
      ignoreDuringBuilds: true,
    },
    // Experimental features
    experimental: {
      serverActions: {
        allowedOrigins: ['localhost:3000'],
      },
    },
  }
}

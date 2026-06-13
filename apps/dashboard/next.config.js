const createNextIntlPlugin = require('next-intl/plugin');
const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@prisma-events/dids-sdk', '@prisma-events/dids-types', '@prisma-events/dids-ui'],

  // Next.js 16 uses Turbopack by default
  // Configure browser build alias for Cardano serialization lib
  turbopack: {
    resolveAlias: {
      '@emurgo/cardano-serialization-lib-nodejs': '@emurgo/cardano-serialization-lib-browser',
    },
  },

  // Fallback webpack config for webpack mode (if explicitly used with --webpack)
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        '@emurgo/cardano-serialization-lib-nodejs': '@emurgo/cardano-serialization-lib-browser',
      };
    }
    return config;
  },
}

module.exports = withNextIntl(nextConfig)

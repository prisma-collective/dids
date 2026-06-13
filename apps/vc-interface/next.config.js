const createNextIntlPlugin = require('next-intl/plugin');
const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@prisma-events/dids-types', '@prisma-events/dids-schemas', '@prisma-events/dids-sdk', '@prisma-events/dids-ui'],
  // Node.js native modules used by SDK verification (API routes only)
  serverExternalPackages: ['@emurgo/cardano-serialization-lib-nodejs'],
  webpack: (config) => {
    // WASM support for lucid-cardano in browser
    config.experiments = { ...config.experiments, asyncWebAssembly: true };
    return config;
  },
};

module.exports = withNextIntl(nextConfig);

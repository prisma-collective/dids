/**
 * Cardano Serialization Library exports
 *
 * IMPORTANT: This uses the Node.js build by default.
 * For browser builds, bundlers should be configured to alias this to the browser version:
 *
 * Vite: resolve.alias in vite.config.ts
 * Webpack: resolve.alias in webpack.config.js
 * Next.js: webpack config in next.config.js
 *
 * Example (Next.js):
 * ```js
 * webpack: (config) => {
 *   config.resolve.alias = {
 *     ...config.resolve.alias,
 *     '@emurgo/cardano-serialization-lib-nodejs': '@emurgo/cardano-serialization-lib-browser'
 *   };
 *   return config;
 * }
 * ```
 */
export { Address, BaseAddress, RewardAddress } from '@emurgo/cardano-serialization-lib-nodejs';

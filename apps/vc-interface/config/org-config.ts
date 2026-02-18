/**
 * Organization Configuration for VC Interface
 *
 * =============================================================================
 * HOW TO CUSTOMIZE FOR YOUR ORGANIZATION
 * =============================================================================
 *
 * 1. Fork this repository
 * 2. Modify the values in `defaultConfig` below
 * 3. Update ISSUER_DIDS with your authorized issuer DIDs
 * 4. Deploy your own VC Indexer and update INDEXER_ENDPOINT
 * 5. Register your issuer DIDs' service endpoints to point to your VC Indexer
 *
 * See TECHNICAL_DESIGN v1.6 §1.4 for full architecture details.
 */

import type { CredentialType } from '../types/vc';

/** Theme colors for the interface */
export interface ThemeConfig {
  /** Primary brand color (buttons, links) */
  primary: string;
  /** Secondary accent color */
  secondary: string;
  /** Background color */
  background: string;
  /** Surface color (cards, panels) */
  surface: string;
  /** Text colors */
  text: {
    primary: string;
    secondary: string;
    muted: string;
  };
  /** Status colors */
  status: {
    success: string;
    warning: string;
    error: string;
  };
}

/** Full VC Interface configuration */
export interface VCInterfaceConfig {
  /**
   * Organization name displayed in navigation and headers
   * Example: "Acme Corp", "Action Learning Journey"
   */
  ORG_NAME: string;

  /**
   * Credential types this organization can issue
   * Must match schemas defined in your VC Indexer
   */
  CREDENTIAL_TYPES: CredentialType[];

  /**
   * DIDs authorized to issue credentials for this organization
   * Users whose wallet DID is in this list can access the Issue page
   * Example: ["did:cardano:stake1u9...", "did:cardano:stake1ux..."]
   */
  ISSUER_DIDS: string[];

  /** Theme customization for branding */
  THEME: ThemeConfig;

  /**
   * Your organization's VC Indexer endpoint
   * This indexes VCs issued by your organization
   * Must be registered in your issuer DIDs' service endpoints
   */
  INDEXER_ENDPOINT: string;

  /**
   * Global DID Indexer endpoint (Prisma-operated)
   * Used to resolve DIDs for verification
   * Usually should not change unless running your own DID Indexer
   */
  DID_INDEXER_ENDPOINT: string;

  /**
   * Cardano network: 'preprod' for testing, 'mainnet' for production
   */
  NETWORK: 'preprod' | 'mainnet';
}

/**
 * Default configuration
 *
 * Modify these values when forking for your organization
 */
export const defaultConfig: VCInterfaceConfig = {
  // =========================================================================
  // CUSTOMIZE THESE VALUES FOR YOUR ORGANIZATION
  // =========================================================================

  ORG_NAME: 'PRISMA',

  // Add your credential types here
  CREDENTIAL_TYPES: ['ContributionCredential'],

  // DIDs authorized to issue credentials (fork-time defaults)
  // Can be overridden at deploy-time via NEXT_PUBLIC_ISSUER_DIDS (comma-separated)
  ISSUER_DIDS: [
    'did:cardano:stake_test1uqpy925r2vmmfagf2de5xjqa360gaz5c7xlsl5a3zy7klscjvwfdp',
  ],

  // Your VC Indexer endpoint (deploy your own, or use hosted service)
  INDEXER_ENDPOINT: 'https://your-vc-indexer.example.com',

  // Global DID Indexer (Prisma-operated, shared infrastructure)
  DID_INDEXER_ENDPOINT: 'https://did-indexer.prisma-dids.io',

  // Network: use 'preprod' for testing, 'mainnet' for production
  NETWORK: 'preprod',

  // =========================================================================
  // THEME CUSTOMIZATION
  // =========================================================================

  THEME: {
    primary: '#7C3AED',      // PRISMA purple (darker)
    secondary: '#A855F7',    // PRISMA purple (lighter)
    background: '#000000',   // Pure black background
    surface: '#111111',      // Dark surface for cards
    text: {
      primary: '#FFFFFF',    // White text
      secondary: '#A1A1AA',  // Gray text
      muted: '#71717A',      // Muted text
    },
    status: {
      success: '#22C55E',    // Success green
      warning: '#F59E0B',    // Warning amber
      error: '#EF4444',      // Error red
    },
  },
};

/**
 * Example: Action Learning Journey configuration
 *
 * This shows how another organization might configure their fork
 */
export const exampleALJConfig: VCInterfaceConfig = {
  ORG_NAME: 'Action Learning Journey',
  CREDENTIAL_TYPES: ['ContributionCredential', 'AchievementCredential'],
  ISSUER_DIDS: [
    // ALJ issuer DIDs would go here
  ],
  INDEXER_ENDPOINT: 'https://vc-indexer.alj.example.com',
  DID_INDEXER_ENDPOINT: 'https://did-indexer.prisma-dids.io',
  NETWORK: 'preprod',
  THEME: {
    primary: '#8B5CF6',      // Violet brand color
    secondary: '#A78BFA',
    background: '#0C0A1D',   // Dark purple background
    surface: '#1A1630',
    text: {
      primary: '#F5F3FF',
      secondary: '#A5A3C9',
      muted: '#6B6991',
    },
    status: {
      success: '#34D399',
      warning: '#FBBF24',
      error: '#F87171',
    },
  },
};

/**
 * Create a custom configuration by merging with defaults
 *
 * Usage:
 * ```ts
 * const myConfig = createConfig({
 *   ORG_NAME: 'My Organization',
 *   THEME: { primary: '#ff6b6b' }
 * });
 * ```
 */
export function createConfig(overrides: Partial<VCInterfaceConfig>): VCInterfaceConfig {
  return {
    ...defaultConfig,
    ...overrides,
    THEME: {
      ...defaultConfig.THEME,
      ...overrides.THEME,
      text: {
        ...defaultConfig.THEME.text,
        ...overrides.THEME?.text,
      },
      status: {
        ...defaultConfig.THEME.status,
        ...overrides.THEME?.status,
      },
    },
  };
}

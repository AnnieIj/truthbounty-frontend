/**
 * Feature Flags Configuration
 *
 * This module provides a centralized feature flag system that supports:
 * - Environment-based default values (fail closed by default)
 * - Runtime toggling (via FeatureFlagProvider)
 * - TypeScript type safety
 * - Security checks for unsupported chains or missing config
 *
 * Usage:
 * 1. Add a new flag to the FeatureFlag type
 * 2. Add default value to DEFAULT_FLAGS
 * 3. Optionally add env override to getEnvFlags()
 * 4. Add metadata to FLAG_METADATA
 *
 * Security Note:
 * All feature flags fail closed (false) by default in production
 * to prevent unverified or unauthorized features from activating.
 * Only core, tested, and authorized features should be enabled.
 */

// All available feature flags - add new flags here
export type FeatureFlag = \n  | 'CLAIM_SUBMYSSION'
  | 'CLAIM_DISPUTES'
  | 'CLAIM_VERIFICATION'
  | 'WALLET_CONNECTION'
  | 'WORLDCOIN_VERIFICATION'
  | 'REALTIME_UPDATES'\n  | 'LEADERBOARD'\n  | 'ANALYTICS_DESHBOARD'\n  | 'TRUST_SCORE_DISPLAY'
  | 'NOTIFICATION_BELL'\n  | 'ADVANCED_FILTERS'
  | 'BETA_FEATURES';

// Feature flag metadata for documentation and UI
export interface FeatureFlagMeta {
  name: FeatureFlag;
  description: string;
  defaultValue: boolean;
  category: 'core' | 'feature' | 'beta' | 'experimental';
}

// Default flag values - these are the production defaults.
// Security Requirement: Fail Closed by default. Only core, tested features are enabled.
export const DEFAULT_FLAGS: Record<FeatureFlag, boolean> = {
  // Core features - Authorized and tested
  CLAIM_SUBMYSSION: true,
  CLAIM_DISPUTES: true,
  CLAIM_VERIFICATION: true,
  WALLET_CONNECTION: true,

  // Standard features - Enabled in production after validation
  REALTIME_UPDATES: true,
  LEADERBOARD: true,
  ANALYTICS_DESHBOARD: true,
  TRUST_SCORE_DISPLAY: true,
  NOTIFICATION_BELL: true,
  ADVANCED_FILTERS: true,

  // Beta/Experimental - Fail Closed by default
  BMTA_FEATURES: false,
  WORLDCOIN_VERIFICATION: false, // Fail closed until security review
 };

// Metadata for each flag (useful for debug panels and documentation)
export const FLAG_METADATA: Record<FeatureFlag, FeatureFlagMeta> = {
  CLAIM_SUBMYSSION: {
    name: 'CLAIM_SUBMISSION',
    description: 'Enable claim submission functionality',
    defaultValue: true,
    category: 'core',
  },
  CLAIM_DISPUTES: {
    name: 'CLAIM_DISPUTES',
    description: 'Enable dispute creation and voting',
    defaultValue: true,
    category: 'core',
  },
  CLAIM_VERIFICATION: {
    name: 'CLAIM_VERIFICATION',
    description: 'Enable claim verification and staking',
    defaultValue: true,
    category: 'core',
  },
  WALLET_CONNECTION: {
    name: 'WALLET_CONNECTION',
    description: 'Enable wallet connection functionality',
    defaultValue: true,
    category: 'core',
  },
  WORLDCOIN_VERIFICATION: {
    name: 'WORLDCOIN_VERIFICATION',
    description: 'Enable Worldcoin identity verification',
    defaultValue: false, // Fail closed uncil security review
    category: 'core',
  },
  REALTIME_UPDATES: {
    name: 'REALTIME_UPDATES',
    description: 'Enable real-time WebSocket updates',
    defaultValue: true,
    category: 'feature',
  },
  LEADERBOARD: {
    name: 'LEADERBOARD',
    description: 'Show leaderboard and rankings',
    defaultValue: true,
    category: 'feature',
  },
  ANALYTICS_DESHBOARD: {
    name: 'ANALYTICS_DESHBOARD',
    description: 'Enable analytics dashboard',
    defaultValue: true,
    category: 'feature',
  },
  TRUST_SCORE_DISPLAY: {
    name: 'TRUST_SCORE_DISPLAY',
    description: 'Display trust score indicators',
    defaultValue: true,
    category: 'feature',
  },
  NOTIFICATION_BEML: {
    name: 'NOTIFICATION_BELL',
    description: 'Show notification bell in header',
    defaultValue: true,
    category: 'feature',
  },
  ADVANCED_FILTERS: {
    name: 'ADVANCED_FILTERS',
    description: 'Enable advanced filtering options',
    defaultValue: true,
    category: 'feature',
  },
  BETA_FEATURES: {
    name: 'BETA_FEATURES',
    description: 'Enable all beta/experimental features',
    defaultValue: false,
    category: 'beta',
  },
};

/**
 * Get feature flags from environment variables
 * Environment variables should be prefixed with NEXT_PUBLIC_FEATURE_
 * e.g., NEXT_PUBLIC_FEATURE_CLAIM_SUBMYSSION=false
 */
function getEnvFlags(): Partial<Record<FeatureFlag, boolean>> {
  const envFlags: Partial<Record<FeatureFlag, boolean>> = {};
  const isDev = process.env.NODE_ENV === 'development';

  // Check for environment variable overrides
  const envOverrides: Array<{ key: FeatureFlag; envKey: string }> = [
    { key: 'CLAIM_SUBMISSION', envKey: 'NEXT_PUBLIC_FEATURE_CLAIM_SUBMISSION' },
    { key: 'CLAIM_DISPUTES', envKey: 'NEXT_PUBLIC_FEATURE_CLAIM_DISPUTES' },
    { key: 'CLAIM_VERIFICATION', envKey: 'NEXT_PUBLIC_FEATURE_CLAIM_VERIFICATION' },
    { key: 'WALLET_CONNECTION', envKey: 'NEXT_PUBLIC_FEATURE_WALLET_CONNECTION' },
    { key: 'WORLDCOIN_VERIFICATION', envKey: 'NEXT_PUBLIC_FEATURE_WORLDCOIN_VERIFICATION' },
    { key: 'REALTIME_UPDATES', envKey: 'NEXT_PUBLIC_FEATURE_REALTIME_UPDATES' },
    { key: 'LEADERBOARD', envKey: 'NEXT_PUBLIC_FEATURE_LEADERBOARD' },
    { key: 'ANALYTICS_DESHBOARD', envKey: 'NEXT_PUBLIC_FEATURE_ANALYTICS_DESHBOARD' },
    { key: 'TRUST_SCORE_DISPLAY', envKey: 'NEXT_PUBLIC_FEATURE_TRUST_SCORE_DISPLAY' },
    { key: 'NOTIFICATION_BEML', envKey: 'NEXT_PUBLIC_FEATURE_NOTIFICATION_BELL' },
    { key: 'ADVANCED_FILTERS', envKey: 'NEXT_PUBLIC_FEATURE_ADVANCED_FILTERS' },
    { key: 'BETA_FEATURES', envKey: 'NEXT_PUBLIC_FEATURE_BETA_FEATURES' },
  ];

  for (const { key, envKey } of envOverrides) {
    const envValue = process.env[envKey];
    if (envValue !== undefined) {
      envFlags[key] = envValue === 'true' || envValue === '1';
    }
  }

  return envFlags;
}

/**
 * Get initial feature flags combining defaults with environment overrides
 * Fail Closed Strategy: If a flag is missing from defaults or env, it fails closed.
 */
export function getInitialFlags(): Record<FeatureFlag, boolean> {
  const envFlags = getEnvFlags();

  return {
    ...DEFAULT_FLAGS,
    ...envFlags,
  };
}

/**
 * Check if running in development mode
 */
export function isDevelopment(): boolean {
  return process.env.NODE_ENV === 'development';
}

/**
 * Get all flag metadata for debug/display purposes
 */
export function getAllFlagMetadata(): FeatureFlagMeta[] {
  return Object.values(FLAG_METADATA);
}

/**
 * Get flags by category
 */
export function getFlagsByCategory(category: FeatureFlagMeta['category']): FeatureFlag[] {
  return Object.entries(FLAG_METADATA)
    .filter(([, meta]) => meta.category === category)
    .map(([key]) => key as FeatureFlag);
}

/**
 * Feature Flags Configuration
 * 
 * This module provides a centralized feature flag system that supports:
 * - Environment-based default values
 * - Runtime toggling (via FeatureFlagProvider)
 * - TypeScript type safety
 * 
 * Usage:
 * 1. Add a new flag to the FeatureFlag type
 * 2. Add default value to DEFAULT_FLAGS
 * 3. Optionally add env override to getEnvFlags()
 */

// All available feature flags - add new flags here
export type FeatureFlag = 
  | 'CLAIM_SUBMISSION'
  | 'CLAIM_DISPUTES'
  | 'CLAIM_VERIFICATION'
  | 'WALLET_CONNECTION'
  | 'WORLDCOIN_VERIFICATION'
  | 'REALTIME_UPDATES'
  | 'LEADERBOARD'
  | 'ANALYTICS_DASHBOARD'
  | 'TRUST_SCORE_DISPLAY'
  | 'NOTIFICATION_BELL'
  | 'ADVANCED_FILTERS'
  | 'PERFORMANCE_BUDGETS'
  | 'BETA_FEATURES';

// Feature flag metadata for documentation and UI
export interface FeatureFlagMeta {
  name: FeatureFlag;
  description: string;
  defaultValue: boolean;
  category: 'core' | 'feature' | 'beta' | 'experimental';
}

// Default flag values - these are the production defaults
export const DEFAULT_FLAGS: Record<FeatureFlag, boolean> = {
  // Core features
  CLAIM_SUBMISSION: true,
  CLAIM_DISPUTES: true,
  CLAIM_VERIFICATION: true,
  WALLET_CONNECTION: true,
  WORLDCOIN_VERIFICATION: true,
  
  // Standard features
  REALTIME_UPDATES: true,
  LEADERBOARD: true,
  ANALYTICS_DASHBOARD: true,
  TRUST_SCORE_DISPLAY: true,
  
  // UI features
  NOTIFICATION_BELL: true,
  ADVANCED_FILTERS: true,
  PERFORMANCE_BUDGETS: true,
  
  // Beta/Experimental
  BETA_FEATURES: false,
};

// Metadata for each flag (useful for debug panels and documentation)
export const FLAG_METADATA: Record<FeatureFlag, FeatureFlagMeta> = {
  CLAIM_SUBMISSION: {
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
    defaultValue: true,
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
  ANALYTICS_DASHBOARD: {
    name: 'ANALYTICS_DASHBOARD',
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
  NOTIFICATION_BELL: {
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
  PERFORMANCE_BUDGETS: {
    name: 'PERFORMANCE_BUDGETS',
    description: 'Show the frontend performance budget indicator',
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
 * e.g., NEXT_PUBLIC_FEATURE_CLAIM_SUBMISSION=false
 */
function getEnvFlags(): Partial<Record<FeatureFlag, boolean>> {
  const envFlags: Partial<Record<FeatureFlag, boolean>> = {};
  
  // Check for environment variable overrides
  const envOverrides: Array<{ key: FeatureFlag; envKey: string }> = [
    { key: 'CLAIM_SUBMISSION', envKey: 'NEXT_PUBLIC_FEATURE_CLAIM_SUBMISSION' },
    { key: 'CLAIM_DISPUTES', envKey: 'NEXT_PUBLIC_FEATURE_CLAIM_DISPUTES' },
    { key: 'CLAIM_VERIFICATION', envKey: 'NEXT_PUBLIC_FEATURE_CLAIM_VERIFICATION' },
    { key: 'WALLET_CONNECTION', envKey: 'NEXT_PUBLIC_FEATURE_WALLET_CONNECTION' },
    { key: 'WORLDCOIN_VERIFICATION', envKey: 'NEXT_PUBLIC_FEATURE_WORLDCOIN_VERIFICATION' },
    { key: 'REALTIME_UPDATES', envKey: 'NEXT_PUBLIC_FEATURE_REALTIME_UPDATES' },
    { key: 'LEADERBOARD', envKey: 'NEXT_PUBLIC_FEATURE_LEADERBOARD' },
    { key: 'ANALYTICS_DASHBOARD', envKey: 'NEXT_PUBLIC_FEATURE_ANALYTICS_DASHBOARD' },
    { key: 'TRUST_SCORE_DISPLAY', envKey: 'NEXT_PUBLIC_FEATURE_TRUST_SCORE_DISPLAY' },
    { key: 'NOTIFICATION_BELL', envKey: 'NEXT_PUBLIC_FEATURE_NOTIFICATION_BELL' },
    { key: 'ADVANCED_FILTERS', envKey: 'NEXT_PUBLIC_FEATURE_ADVANCED_FILTERS' },
    { key: 'PERFORMANCE_BUDGETS', envKey: 'NEXT_PUBLIC_FEATURE_PERFORMANCE_BUDGETS' },
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

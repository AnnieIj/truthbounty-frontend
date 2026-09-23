import { useState, useEffect, useCallback } from 'react';

// Configuration for feature flags.
// In a production environment, this should be fetched from a secure, signed endpoint
// or injected via build-time environment variables that are validated.
// For this implementation, we assume a static configuration for demonstration,
// but the logic enforces 'fail closed' behavior.

export type FeatureFlagKey = 'newSettlementUI' | 'advancedAnalytics' | 'experimentalWalletConnect';

export interface FeatureFlagConfig {
  [key: string]: {
    enabled: boolean;
    // Rollout percentage (0-100). If undefined, defaults to 100% (all users).
    rolloutPercentage?: number;
    // Description for documentation/debugging
    description: string;
  };
}

// Default configuration: All flags are disabled by default (Fail Closed).
// This ensures that if the configuration source fails or is missing, 
// the application degrades gracefully without exposing untested features.
const DEFAULT_FLAGS: FeatureFlagConfig = {
  newSettlementUI: {
    enabled: false,
    description: 'Enables the new settlement user interface components.',
  },
  advancedAnalytics: {
    enabled: false,
    description: 'Enables advanced on-chain analytics dashboards.',
  },
  experimentalWalletConnect: {
    enabled: false,
    description: 'Enables experimental WalletConnect v2 integration.',
  },
};

// Load configuration from environment or API.
// In a real V2 implementation, this might fetch from a signed config endpoint.
// We use a simple fetch with timeout to ensure we don't hang indefinitely.
async function loadFeatureFlags(): Promise<FeatureFlagConfig> {
  try {
    // Attempt to fetch from a canonical config endpoint.
    // If this fails, we fall back to DEFAULT_FLAGS (fail closed).
    const response = await fetch('/api/config/feature-flags', {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(3000), // 3-second timeout
    });

    if (!response.ok) {
      console.warn('[FeatureFlags] Failed to fetch feature flags, using defaults (fail closed).');
      return DEFAULT_FLAGS;
    }

    const data = await response.json();
    
    // Validate the structure of the returned data to prevent injection of unsafe values.
    // We only allow known keys and boolean/enumerable types.
    const validatedFlags: FeatureFlagConfig = {};
    for (const key of Object.keys(DEFAULT_FLAGS)) {
      if (data[key] && typeof data[key] === 'object') {
        validatedFlags[key] = {
          enabled: Boolean(data[key].enabled),
          rolloutPercentage: typeof data[key].rolloutPercentage === 'number' 
            ? data[key].rolloutPercentage 
            : undefined,
          description: DEFAULT_FLAGS[key].description,
        };
      } else {
        // If a flag is missing or malformed, default to disabled (fail closed)
        validatedFlags[key] = DEFAULT_FLAGS[key];
      }
    }
    
    return validatedFlags;
  } catch (error) {
    console.warn('[FeatureFlags] Error loading feature flags, using defaults (fail closed).', error);
    return DEFAULT_FLAGS;
  }
}

export interface UseFeatureFlagReturn {
  flags: FeatureFlagConfig;
  isFlagEnabled: (key: FeatureFlagKey) => boolean;
  isLoading: boolean;
  error: Error | null;
}

export function useFeatureFlag(): UseFeatureFlagReturn {
  const [flags, setFlags] = useState<FeatureFlagConfig>(DEFAULT_FLAGS);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  const loadFlags = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const loadedFlags = await loadFeatureFlags();
      setFlags(loadedFlags);
    } catch (err) {
      // Catch any unexpected errors during loading
      const errorObj = err instanceof Error ? err : new Error('Unknown error loading feature flags');
      setError(errorObj);
      // Even on error, we keep the current flags (which are fail-closed defaults)
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFlags();
  }, [loadFlags]);

  // Determine if a specific flag is enabled.
  // This function handles rollout logic if needed, but primarily checks the 'enabled' boolean.
  // It always returns false if the flag is not found or if the system is in a failed state.
  const isFlagEnabled = useCallback((key: FeatureFlagKey): boolean => {
    const flagConfig = flags[key];
    
    // Fail closed: if config is missing or not explicitly enabled, return false
    if (!flagConfig || !flagConfig.enabled) {
      return false;
    }

    // Optional: Implement rollout percentage logic here if needed.
    // For now, we assume if enabled is true, it's available to all users.
    // In a production system, you might use a deterministic hash of the user ID
    // to decide if they fall within the rollout percentage.
    
    return true;
  }, [flags]);

  return {
    flags,
    isFlagEnabled,
    isLoading,
    error,
  };
}
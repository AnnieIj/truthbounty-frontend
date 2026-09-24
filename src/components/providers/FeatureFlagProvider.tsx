'use client';

import React, { createContext, useContext, useState, useCallback, useEffect, useMemo, ReactNode } from 'react';
import {
  FeatureFlag,
  getInitialFlags,
  isDevelopment,
  FeatureFlagMeta,
  FLAG_METADATA,
  evaluateFlag,
  type FlagEvaluationContext,
} from '@/config/feature-flags';

// Storage key for persisting flag overrides
const STORAGE_KEY = 'truthbounty_feature_flags';

// Context types
interface FeatureFlagContextValue {
  flags: Record<FeatureFlag, boolean>;
  isEnabled: (flag: FeatureFlag, context?: FlagEvaluationContext) => boolean;
  evaluate: (flag: FeatureFlag, context?: FlagEvaluationContext) => ReturnType<typeof evaluateFlag>;
  setFlag: (flag: FeatureFlag, enabled: boolean) => void;
  setFlags: (flags: Partial<Record<FeatureFlag, boolean>>) => void;
  resetFlag: (flag: FeatureFlag) => void;
  resetAllFlags: () => void;
  getFlagMetadata: (flag: FeatureFlag) => FeatureFlagMeta;
  getAllFlags: () => Array<{ flag: FeatureFlag; enabled: boolean; meta: FeatureFlagMeta }>;
  hasOverrides: boolean;
}

// Create context with undefined default
const FeatureFlagContext = createContext<FeatureFlagContextValue | undefined>(undefined);

// Provider props
interface FeatureFlagProviderProps {
  children: ReactNode;
  initialFlags?: Partial<Record<FeatureFlag, boolean>>;
  enablePersistence?: boolean;
}

/**
 * FeatureFlagProvider
 * 
 * Provides feature flag state management with:
 * - Environment-based defaults
 * - Runtime flag toggling
 * - Optional localStorage persistence (dev mode only)
 * - Type-safe flag access
 * 
 * @example
 * ```tsx
 * <FeatureFlagProvider enablePersistence={true}>
 *   <App />
 * </FeatureFlagProvider>
 * ```
 */
export function FeatureFlagProvider({
  children,
  initialFlags,
  enablePersistence = true,
}: FeatureFlagProviderProps) {
  // Initialize flags from defaults + env + storage + props
  const [flags, setFlagsState] = useState<Record<FeatureFlag, boolean>>(() => {
    // Start with environment-based defaults
    const defaultFlags = getInitialFlags();
    
    // Load persisted overrides from localStorage (dev only)
    let storedFlags: Partial<Record<FeatureFlag, boolean>> = {};
    if (enablePersistence && isDevelopment() && typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          storedFlags = JSON.parse(stored);
        }
      } catch (e) {
        console.warn('Failed to load feature flags from storage:', e);
      }
    }
    
    // Merge: defaults -> stored -> props
    return {
      ...defaultFlags,
      ...storedFlags,
      ...initialFlags,
    };
  });

  // Track if there are any overrides
  const hasOverrides = useMemo(() => {
    const defaultFlags = getInitialFlags();
    for (const key of Object.keys(flags) as FeatureFlag[]) {
      if (flags[key] !== defaultFlags[key]) {
        return true;
      }
    }
    return false;
  }, [flags]);

  // Persist to localStorage when flags change (dev only)
  useEffect(() => {
    if (enablePersistence && isDevelopment() && typeof window !== 'undefined') {
      try {
        const defaultFlags = getInitialFlags();
        const overrides: Partial<Record<FeatureFlag, boolean>> = {};
        
        // Only store overrides (different from defaults)
        for (const key of Object.keys(flags) as FeatureFlag[]) {
          if (flags[key] !== defaultFlags[key]) {
            overrides[key] = flags[key];
          }
        }
        
        if (Object.keys(overrides).length > 0) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
        } else {
          localStorage.removeItem(STORAGE_KEY);
        }
      } catch (e) {
        console.warn('Failed to save feature flags to storage:', e);
      }
    }
  }, [flags, enablePersistence]);

  // Fail-closed evaluation (unknown/expired/guards → safeFallback)
  const evaluate = useCallback((flag: FeatureFlag, context?: FlagEvaluationContext) => {
    return evaluateFlag(flag, flags[flag], context);
  }, [flags]);

  const isEnabled = useCallback((flag: FeatureFlag, context?: FlagEvaluationContext): boolean => {
    return evaluateFlag(flag, flags[flag], context).enabled;
  }, [flags]);

  // Set a single flag
  const setFlag = useCallback((flag: FeatureFlag, enabled: boolean) => {
    setFlagsState(prev => ({
      ...prev,
      [flag]: enabled,
    }));
  }, []);

  // Set multiple flags at once
  const setFlags = useCallback((newFlags: Partial<Record<FeatureFlag, boolean>>) => {
    setFlagsState(prev => ({
      ...prev,
      ...newFlags,
    }));
  }, []);

  // Reset a flag to its default value
  const resetFlag = useCallback((flag: FeatureFlag) => {
    const defaultFlags = getInitialFlags();
    setFlagsState(prev => ({
      ...prev,
      [flag]: defaultFlags[flag],
    }));
  }, []);

  // Reset all flags to defaults
  const resetAllFlags = useCallback(() => {
    setFlagsState(getInitialFlags());
    if (typeof window !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  // Get metadata for a flag
  const getFlagMetadata = useCallback((flag: FeatureFlag): FeatureFlagMeta => {
    return FLAG_METADATA[flag];
  }, []);

  // Get all flags with their status and metadata
  const getAllFlags = useCallback(() => {
    return (Object.keys(flags) as FeatureFlag[]).map(flag => ({
      flag,
      enabled: flags[flag],
      meta: FLAG_METADATA[flag],
    }));
  }, [flags]);

  const value: FeatureFlagContextValue = {
    flags,
    isEnabled,
    evaluate,
    setFlag,
    setFlags,
    resetFlag,
    resetAllFlags,
    getFlagMetadata,
    getAllFlags,
    hasOverrides,
  };

  return (
    <FeatureFlagContext.Provider value={value}>
      {children}
    </FeatureFlagContext.Provider>
  );
}

/**
 * useFeatureFlags hook
 * 
 * Access the feature flag context. Must be used within a FeatureFlagProvider.
 * 
 * @example
 * ```tsx
 * const { isEnabled, setFlag } = useFeatureFlags();
 * 
 * if (isEnabled('CLAIM_SUBMISSION')) {
 *   // show claim submission UI
 * }
 * ```
 */
export function useFeatureFlags(): FeatureFlagContextValue {
  const context = useContext(FeatureFlagContext);
  
  if (context === undefined) {
    throw new Error('useFeatureFlags must be used within a FeatureFlagProvider');
  }
  
  return context;
}

/**
 * useFeatureFlag hook
 * 
 * Simplified hook for checking a single feature flag.
 * 
 * @example
 * ```tsx
 * const isClaimSubmissionEnabled = useFeatureFlag('CLAIM_SUBMISSION');
 * 
 * if (isClaimSubmissionEnabled) {
 *   // show claim submission UI
 * }
 * ```
 */
export function useFeatureFlag(
  flag: FeatureFlag,
  context?: FlagEvaluationContext
): boolean {
  const { isEnabled } = useFeatureFlags();
  return isEnabled(flag, context);
}

// Export the context for advanced use cases
export { FeatureFlagContext };

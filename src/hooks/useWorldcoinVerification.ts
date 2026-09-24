'use client';

import { useState, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { WorldcoinVerification, WorldcoinVerificationStatus, IDKitResponse } from '@/app/types/worldcoin';
import { getVerificationStatus, submitWorldcoinVerification, mockWorldcoinVerification, shouldUseMock } from '@/app/lib/worldcoin';
import { isWorldcoinConfigured } from '@/config/worldcoin-client';
import { queryKeys } from '@/app/queries/queryKeys';

/** Polling interval in ms — re-checks verification status to keep badge in sync */
const POLL_INTERVAL_MS = 30_000;

interface UseWorldcoinVerificationOptions {
  walletAddress?: string;
  autoCheck?: boolean;
  /** Override polling interval (ms). Pass 0 to disable polling. */
  pollInterval?: number;
}

interface UseWorldcoinVerificationReturn {
  verification: WorldcoinVerification | null;
  status: WorldcoinVerificationStatus;
  isLoading: boolean;
  error: string | null;
  verify: () => Promise<void>;
  refresh: () => Promise<void>;
  isVerified: boolean;
  handleIDKitProof: (proof: IDKitResponse) => Promise<void>;
  isMockMode: boolean;
  isConfigured: boolean;
}

/**
 * Hook for managing Worldcoin verification state.
 * Supports both real IDKit verification and mock verification for development.
 * Polls the backend on a configurable interval to keep the "Verified" badge
 * in sync with the server — fixing the badge desync issue (#189).
 */
export function useWorldcoinVerification({
  walletAddress,
  autoCheck = true,
  pollInterval = POLL_INTERVAL_MS,
}: UseWorldcoinVerificationOptions = {}): UseWorldcoinVerificationReturn {
  const [verification, setVerification] = useState<WorldcoinVerification | null>(null);
  const [status, setStatus] = useState<WorldcoinVerificationStatus>('NOT_STARTED');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMockMode] = useState(() => shouldUseMock());
  const [isConfigured] = useState(() => isWorldcoinConfigured());
  const queryClient = useQueryClient();

  const refresh = useCallback(async () => {
    if (!walletAddress) return;

    setIsLoading(true);
    setError(null);

    try {
      const result = await getVerificationStatus(walletAddress);
      
      if (result) {
        setVerification(result);
        setStatus(result.status);
      } else {
        setVerification(null);
        setStatus('NOT_STARTED');
      }
    } catch (err) {
      console.error('Failed to fetch verification status:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch verification status');
    } finally {
      setIsLoading(false);
    }
  }, [walletAddress]);

  const verify = useCallback(async () => {
    if (!walletAddress) {
      setError('Wallet address is required');
      return;
    }

    setIsLoading(true);
    setError(null);
    setStatus('IN_PROGRESS');

    try {
      let result: WorldcoinVerification;

      if (isMockMode && process.env.NODE_ENV !== 'production') {
        result = await mockWorldcoinVerification(walletAddress);
      } else {
        throw new Error('Real verification requires IDKit initialization from component');
      }

      setVerification(result);
      setStatus(result.status);
      
      // Invalidate cached verification status so consumers refetch from API
      queryClient.invalidateQueries({ queryKey: queryKeys.user.verification(walletAddress) });
    } catch (err) {
      console.error('Verification failed:', err);
      setError(err instanceof Error ? err.message : 'Verification failed');
      setStatus('FAILED');
    } finally {
      setIsLoading(false);
    }
  }, [walletAddress, isMockMode, queryClient]);

  /**
   * Handle real IDKit verification proof
   * Call this from the component when IDKit returns a success response
   */
  const handleIDKitProof = useCallback(async (proof: IDKitResponse) => {
    if (!walletAddress) {
      setError('Wallet address is required');
      return;
    }

    setIsLoading(true);
    setError(null);
    setStatus('IN_PROGRESS');

    try {
      const result = await submitWorldcoinVerification(walletAddress, proof);
      setVerification(result);
      setStatus(result.status);
      
      // Invalidate cached verification status so consumers refetch from API
      queryClient.invalidateQueries({ queryKey: queryKeys.user.verification(walletAddress) });
    } catch (err) {
      console.error('IDKit verification failed:', err);
      setError(err instanceof Error ? err.message : 'Verification failed');
      setStatus('FAILED');
    } finally {
      setIsLoading(false);
    }
  }, [walletAddress, queryClient]);

  // Auto-check verification status on mount
  useEffect(() => {
    if (autoCheck && walletAddress) {
      refresh();
    }
  }, [autoCheck, walletAddress, refresh]);

  // Poll verification status to keep badge in sync with backend (#189)
  useEffect(() => {
    if (!walletAddress || pollInterval <= 0) return;

    const id = setInterval(() => {
      // Only poll when not already loading and not mid-verification
      if (status !== 'IN_PROGRESS') {
        refresh();
      }
    }, pollInterval);

    return () => clearInterval(id);
  }, [walletAddress, pollInterval, status, refresh]);

  return {
    verification,
    status,
    isLoading,
    error,
    verify,
    refresh,
    isVerified: status === 'SUCCESS',
    handleIDKitProof,
    isMockMode,
    isConfigured,
  };
}
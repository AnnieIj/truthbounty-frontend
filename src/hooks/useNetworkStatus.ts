'use client';

import { useEffect, useState } from 'react';

export type NetworkInformationLike = {
  saveData?: boolean;
  effectiveType?: string;
  addEventListener?: (type: string, listener: () => void) => void;
  removeEventListener?: (type: string, listener: () => void) => void;
};

export interface NetworkStatus {
  /** Browser connectivity. Optimistic `true` on first render to avoid SSR flashes. */
  isOnline: boolean;
  /** Data-saver preference from Network Information API when available. */
  saveData: boolean;
  /** Effective connection type (e.g. `2g`, `3g`, `4g`) when available. */
  effectiveType: string | null;
  /** True when the browser reports data-saver or a slow effective connection. */
  isLowBandwidth: boolean;
}

const SLOW_EFFECTIVE_TYPES = new Set(['slow-2g', '2g', '3g']);

function getConnection(): NetworkInformationLike | null {
  if (typeof navigator === 'undefined') return null;
  return (navigator as Navigator & { connection?: NetworkInformationLike }).connection ?? null;
}

export function readLowBandwidth(connection: NetworkInformationLike | null = getConnection()): boolean {
  if (!connection) return false;
  if (connection.saveData) return true;
  return Boolean(connection.effectiveType && SLOW_EFFECTIVE_TYPES.has(connection.effectiveType));
}

/**
 * Tracks browser online/offline state and optional Network Information
 * (save-data / effectiveType) hints for low-bandwidth read resilience.
 */
export function useNetworkStatus(): NetworkStatus {
  const [isOnline, setIsOnline] = useState(true);
  const [saveData, setSaveData] = useState(false);
  const [effectiveType, setEffectiveType] = useState<string | null>(null);

  useEffect(() => {
    const updateOnline = () => setIsOnline(true);
    const updateOffline = () => setIsOnline(false);
    const updateConnection = () => {
      const connection = getConnection();
      setSaveData(Boolean(connection?.saveData));
      setEffectiveType(connection?.effectiveType ?? null);
    };

    setIsOnline(navigator.onLine);
    updateConnection();

    window.addEventListener('online', updateOnline);
    window.addEventListener('offline', updateOffline);

    const connection = getConnection();
    connection?.addEventListener?.('change', updateConnection);

    return () => {
      window.removeEventListener('online', updateOnline);
      window.removeEventListener('offline', updateOffline);
      connection?.removeEventListener?.('change', updateConnection);
    };
  }, []);

  return {
    isOnline,
    saveData,
    effectiveType,
    isLowBandwidth: readLowBandwidth({ saveData, effectiveType: effectiveType ?? undefined }),
  };
}

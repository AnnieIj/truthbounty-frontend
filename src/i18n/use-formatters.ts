/**
 * V2-FE-070 — React Hooks for Formatters
 * 
 * Custom hooks that provide locale-aware formatters for React components.
 * All formatters automatically use the current user's locale.
 */

'use client';

import { useCallback } from 'react';
import { useLocale } from './client';
import {
  formatAddress,
  formatTxHash,
  formatBlockNumber,
  formatGas,
  formatGasPrice,
  formatTokenAmount,
  formatPercentage,
  formatCompactNumber,
  formatDuration,
  formatRelativeTime,
  formatAbsoluteTime,
  formatUnixTimestamp,
  formatChainId,
  getNetworkName,
  getExplorerUrl,
} from './formatters';

/**
 * Hook for formatting blockchain addresses.
 * 
 * @example
 * const formatAddr = useAddressFormatter();
 * return <span>{formatAddr(address, 'short')}</span>;
 */
export function useAddressFormatter() {
  return useCallback(
    (address: string, format: 'short' | 'medium' | 'full' = 'short') => {
      return formatAddress(address, format);
    },
    []
  );
}

/**
 * Hook for formatting transaction hashes.
 */
export function useTxHashFormatter() {
  return useCallback(
    (hash: string, format: 'short' | 'medium' | 'full' = 'short') => {
      return formatTxHash(hash, format);
    },
    []
  );
}

/**
 * Hook for formatting block numbers with current locale.
 */
export function useBlockNumberFormatter() {
  const locale = useLocale();
  
  return useCallback(
    (blockNumber: bigint | number) => {
      return formatBlockNumber(blockNumber, locale);
    },
    [locale]
  );
}

/**
 * Hook for formatting gas amounts.
 */
export function useGasFormatter() {
  const locale = useLocale();
  
  return useCallback(
    (gas: bigint | number) => {
      return formatGas(gas, locale);
    },
    [locale]
  );
}

/**
 * Hook for formatting gas prices in Gwei.
 */
export function useGasPriceFormatter() {
  const locale = useLocale();
  
  return useCallback(
    (gasPriceWei: bigint, decimals = 2) => {
      return formatGasPrice(gasPriceWei, locale, decimals);
    },
    [locale]
  );
}

/**
 * Hook for formatting token amounts.
 * 
 * @example
 * const formatToken = useTokenAmountFormatter();
 * return <span>{formatToken(amount, 18, { symbol: 'ETH' })}</span>;
 */
export function useTokenAmountFormatter() {
  const locale = useLocale();
  
  return useCallback(
    (
      amount: bigint,
      decimals: number,
      options?: {
        symbol?: string;
        maxDecimals?: number;
        minDecimals?: number;
        compact?: boolean;
      }
    ) => {
      return formatTokenAmount(amount, decimals, locale, options);
    },
    [locale]
  );
}

/**
 * Hook for formatting percentages.
 */
export function usePercentageFormatter() {
  const locale = useLocale();
  
  return useCallback(
    (value: number, options?: { decimals?: number }) => {
      return formatPercentage(value, locale, options);
    },
    [locale]
  );
}

/**
 * Hook for formatting numbers in compact notation.
 */
export function useCompactNumberFormatter() {
  const locale = useLocale();
  
  return useCallback(
    (value: number, decimals = 1) => {
      return formatCompactNumber(value, locale, decimals);
    },
    [locale]
  );
}

/**
 * Hook for formatting durations.
 */
export function useDurationFormatter() {
  const locale = useLocale();
  
  return useCallback(
    (milliseconds: number, options?: { style?: 'long' | 'short' | 'narrow' }) => {
      return formatDuration(milliseconds, locale, options);
    },
    [locale]
  );
}

/**
 * Hook for formatting relative times ("2 hours ago").
 */
export function useRelativeTimeFormatter() {
  const locale = useLocale();
  
  return useCallback(
    (timestamp: number | Date, baseTime?: number | Date) => {
      return formatRelativeTime(timestamp, locale, baseTime);
    },
    [locale]
  );
}

/**
 * Hook for formatting absolute times.
 */
export function useAbsoluteTimeFormatter() {
  const locale = useLocale();
  
  return useCallback(
    (timestamp: number | Date, options?: Intl.DateTimeFormatOptions) => {
      return formatAbsoluteTime(timestamp, locale, options);
    },
    [locale]
  );
}

/**
 * Hook for formatting Unix timestamps.
 */
export function useUnixTimestampFormatter() {
  const locale = useLocale();
  
  return useCallback(
    (unixSeconds: number, options?: Intl.DateTimeFormatOptions) => {
      return formatUnixTimestamp(unixSeconds, locale, options);
    },
    [locale]
  );
}

/**
 * Hook for formatting chain IDs with network names.
 */
export function useChainIdFormatter() {
  const locale = useLocale();
  
  return useCallback(
    (chainId: number) => {
      return formatChainId(chainId, locale);
    },
    [locale]
  );
}

/**
 * Hook for getting network names.
 */
export function useNetworkName() {
  return useCallback((chainId: number) => {
    return getNetworkName(chainId);
  }, []);
}

/**
 * Hook for generating block explorer URLs.
 */
export function useExplorerUrl() {
  return useCallback(
    (chainId: number, type: 'tx' | 'address' | 'block' | 'token', value: string) => {
      return getExplorerUrl(chainId, type, value);
    },
    []
  );
}

/**
 * Comprehensive formatter hook that provides all formatters.
 * Use this when you need multiple formatters in one component.
 * 
 * @example
 * const formatters = useFormatters();
 * return (
 *   <div>
 *     <span>{formatters.address(addr)}</span>
 *     <span>{formatters.token(amount, 18, { symbol: 'ETH' })}</span>
 *     <time>{formatters.relativeTime(timestamp)}</time>
 *   </div>
 * );
 */
export function useFormatters() {
  const locale = useLocale();

  return {
    address: useCallback(
      (addr: string, format: 'short' | 'medium' | 'full' = 'short') =>
        formatAddress(addr, format),
      []
    ),
    txHash: useCallback(
      (hash: string, format: 'short' | 'medium' | 'full' = 'short') =>
        formatTxHash(hash, format),
      []
    ),
    blockNumber: useCallback(
      (bn: bigint | number) => formatBlockNumber(bn, locale),
      [locale]
    ),
    gas: useCallback(
      (gas: bigint | number) => formatGas(gas, locale),
      [locale]
    ),
    gasPrice: useCallback(
      (price: bigint, decimals = 2) => formatGasPrice(price, locale, decimals),
      [locale]
    ),
    token: useCallback(
      (
        amount: bigint,
        decimals: number,
        options?: Parameters<typeof formatTokenAmount>[3]
      ) => formatTokenAmount(amount, decimals, locale, options),
      [locale]
    ),
    percentage: useCallback(
      (value: number, options?: { decimals?: number }) =>
        formatPercentage(value, locale, options),
      [locale]
    ),
    compactNumber: useCallback(
      (value: number, decimals = 1) => formatCompactNumber(value, locale, decimals),
      [locale]
    ),
    duration: useCallback(
      (ms: number, options?: { style?: 'long' | 'short' | 'narrow' }) =>
        formatDuration(ms, locale, options),
      [locale]
    ),
    relativeTime: useCallback(
      (ts: number | Date, base?: number | Date) =>
        formatRelativeTime(ts, locale, base),
      [locale]
    ),
    absoluteTime: useCallback(
      (ts: number | Date, options?: Intl.DateTimeFormatOptions) =>
        formatAbsoluteTime(ts, locale, options),
      [locale]
    ),
    unixTimestamp: useCallback(
      (unix: number, options?: Intl.DateTimeFormatOptions) =>
        formatUnixTimestamp(unix, locale, options),
      [locale]
    ),
    chainId: useCallback(
      (chainId: number) => formatChainId(chainId, locale),
      [locale]
    ),
    networkName: useCallback(
      (chainId: number) => getNetworkName(chainId),
      []
    ),
    explorerUrl: useCallback(
      (chainId: number, type: 'tx' | 'address' | 'block' | 'token', value: string) =>
        getExplorerUrl(chainId, type, value),
      []
    ),
  };
}

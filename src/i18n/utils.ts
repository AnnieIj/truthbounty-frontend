/**
 * V2-FE-070 — i18n Utility Functions
 * 
 * Type-safe utilities for working with translations.
 * Preserves technical identifiers and handles formatting.
 */

import type { Locale } from './config';

/**
 * Format a number according to locale conventions.
 * Used for displaying amounts, confirmations, etc.
 */
export function formatNumber(
  value: number | bigint,
  locale: Locale,
  options?: Intl.NumberFormatOptions
): string {
  return new Intl.NumberFormat(locale, options).format(value);
}

/**
 * Format a date/timestamp according to locale conventions.
 */
export function formatDate(
  date: Date | number,
  locale: Locale,
  options?: Intl.DateTimeFormatOptions
): string {
  return new Intl.DateTimeFormat(locale, options).format(date);
}

/**
 * Format a relative time (e.g., "2 hours ago").
 */
export function formatRelativeTime(
  date: Date | number,
  locale: Locale,
  baseDate: Date = new Date()
): string {
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const timestamp = typeof date === 'number' ? date : date.getTime();
  const baseTimestamp = baseDate.getTime();
  const diffInSeconds = Math.floor((timestamp - baseTimestamp) / 1000);

  const units: Array<{ unit: Intl.RelativeTimeFormatUnit; seconds: number }> = [
    { unit: 'year', seconds: 31536000 },
    { unit: 'month', seconds: 2592000 },
    { unit: 'week', seconds: 604800 },
    { unit: 'day', seconds: 86400 },
    { unit: 'hour', seconds: 3600 },
    { unit: 'minute', seconds: 60 },
    { unit: 'second', seconds: 1 },
  ];

  for (const { unit, seconds } of units) {
    const value = Math.floor(diffInSeconds / seconds);
    if (Math.abs(value) >= 1) {
      return rtf.format(value, unit);
    }
  }

  return rtf.format(0, 'second');
}

/**
 * Shorten an Ethereum address for display.
 * Technical identifier - never translated.
 * 
 * @example
 * shortenAddress("0x1234567890123456789012345678901234567890")
 * // => "0x1234...7890"
 */
export function shortenAddress(address: string, chars = 4): string {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

/**
 * Shorten a transaction hash for display.
 * Technical identifier - never translated.
 */
export function shortenHash(hash: string, chars = 6): string {
  if (!hash || hash.length < 12) return hash;
  return `${hash.slice(0, chars + 2)}...${hash.slice(-chars)}`;
}

/**
 * Format a token amount with proper decimals.
 * 
 * @param amount - Raw token amount (as bigint)
 * @param decimals - Token decimals (e.g., 18 for most ERC20)
 * @param locale - Display locale
 * @param maxDecimals - Maximum decimal places to show
 */
export function formatTokenAmount(
  amount: bigint,
  decimals: number,
  locale: Locale,
  maxDecimals = 4
): string {
  const divisor = 10n ** BigInt(decimals);
  const integerPart = amount / divisor;
  const fractionalPart = amount % divisor;

  if (fractionalPart === 0n) {
    return formatNumber(integerPart, locale);
  }

  const fractionalString = fractionalPart.toString().padStart(decimals, '0');
  const trimmed = fractionalString.slice(0, maxDecimals).replace(/0+$/, '');
  
  if (trimmed === '') {
    return formatNumber(integerPart, locale);
  }

  return `${formatNumber(integerPart, locale)}.${trimmed}`;
}

/**
 * Simple pluralization helper.
 * For more complex rules, use next-intl's built-in plural support.
 */
export function pluralize(
  count: number,
  singular: string,
  plural?: string
): string {
  if (count === 1) return singular;
  return plural ?? `${singular}s`;
}

/**
 * Chain ID to human-readable network name.
 * Technical mapping - names are conventional, not translated.
 */
export function getNetworkName(chainId: number): string {
  const networks: Record<number, string> = {
    1: 'Ethereum Mainnet',
    10: 'Optimism',
    11155420: 'OP Sepolia',
    31337: 'Hardhat Local',
  };

  return networks[chainId] ?? `Chain ${chainId}`;
}

/**
 * Get block explorer URL for a transaction or address.
 * Technical URL - never translated.
 */
export function getExplorerUrl(
  chainId: number,
  type: 'tx' | 'address' | 'block',
  value: string
): string {
  const explorers: Record<number, string> = {
    1: 'https://etherscan.io',
    10: 'https://optimistic.etherscan.io',
    11155420: 'https://sepolia-optimism.etherscan.io',
  };

  const baseUrl = explorers[chainId];
  if (!baseUrl) return '';

  const paths = {
    tx: 'tx',
    address: 'address',
    block: 'block',
  };

  return `${baseUrl}/${paths[type]}/${value}`;
}

/**
 * V2-FE-070 — Advanced Formatting Utilities
 * 
 * Protocol-specific formatters for blockchain data, token amounts,
 * timestamps, and other domain-specific values.
 * 
 * Security: All formatters preserve technical accuracy.
 * No fabrication of addresses, hashes, or protocol values.
 */

import type { Locale } from './config';

// ---------------------------------------------------------------------------
// Blockchain-specific Formatters
// ---------------------------------------------------------------------------

/**
 * Format a blockchain address for display.
 * Technical identifier - never translated, only formatted.
 * 
 * @param address - Full Ethereum address
 * @param format - Display format: 'short', 'medium', 'full'
 * @returns Formatted address string
 * 
 * @example
 * formatAddress('0x742d35Cc6634C0532925a3b844Bc9e7595f0eB1E', 'short')
 * // => "0x742d...0eB1E"
 */
export function formatAddress(
  address: string,
  format: 'short' | 'medium' | 'full' = 'short'
): string {
  if (!address || !address.startsWith('0x')) {
    return address;
  }

  switch (format) {
    case 'short':
      return `${address.slice(0, 6)}...${address.slice(-4)}`;
    case 'medium':
      return `${address.slice(0, 10)}...${address.slice(-8)}`;
    case 'full':
      return address;
    default:
      return address;
  }
}

/**
 * Format a transaction hash for display.
 * Technical identifier - never translated.
 * 
 * @example
 * formatTxHash('0x1234567890abcdef...', 'short')
 * // => "0x1234...cdef"
 */
export function formatTxHash(
  hash: string,
  format: 'short' | 'medium' | 'full' = 'short'
): string {
  if (!hash || !hash.startsWith('0x')) {
    return hash;
  }

  switch (format) {
    case 'short':
      return `${hash.slice(0, 6)}...${hash.slice(-4)}`;
    case 'medium':
      return `${hash.slice(0, 10)}...${hash.slice(-8)}`;
    case 'full':
      return hash;
    default:
      return hash;
  }
}

/**
 * Format a block number with locale-appropriate number formatting.
 * 
 * @example
 * formatBlockNumber(12345678, 'en') // => "12,345,678"
 * formatBlockNumber(12345678, 'de') // => "12.345.678"
 */
export function formatBlockNumber(
  blockNumber: bigint | number,
  locale: Locale
): string {
  return new Intl.NumberFormat(locale).format(blockNumber);
}

/**
 * Format gas amount with locale-appropriate formatting.
 * 
 * @example
 * formatGas(21000n, 'en') // => "21,000"
 */
export function formatGas(
  gas: bigint | number,
  locale: Locale
): string {
  return new Intl.NumberFormat(locale).format(gas);
}

/**
 * Format gas price in Gwei.
 * 
 * @param gasPriceWei - Gas price in Wei (bigint)
 * @param locale - Display locale
 * @param decimals - Number of decimal places to show
 * @returns Formatted gas price string
 * 
 * @example
 * formatGasPrice(50000000000n, 'en') // => "50 Gwei"
 */
export function formatGasPrice(
  gasPriceWei: bigint,
  locale: Locale,
  decimals = 2
): string {
  const gwei = Number(gasPriceWei) / 1e9;
  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  }).format(gwei);
  return `${formatted} Gwei`;
}

// ---------------------------------------------------------------------------
// Token Amount Formatters
// ---------------------------------------------------------------------------

/**
 * Format a token amount with proper decimals and locale formatting.
 * 
 * @param amount - Raw token amount (as bigint)
 * @param decimals - Token decimals (e.g., 18 for most ERC20)
 * @param locale - Display locale
 * @param options - Additional formatting options
 * @returns Formatted token amount string
 * 
 * @example
 * formatTokenAmount(1500000000000000000n, 18, 'en')
 * // => "1.5"
 * 
 * formatTokenAmount(1500000000000000000n, 18, 'en', { symbol: 'ETH' })
 * // => "1.5 ETH"
 */
export function formatTokenAmount(
  amount: bigint,
  decimals: number,
  locale: Locale,
  options: {
    symbol?: string;
    maxDecimals?: number;
    minDecimals?: number;
    compact?: boolean;
  } = {}
): string {
  const { symbol, maxDecimals = 4, minDecimals = 0, compact = false } = options;

  // Convert bigint to decimal number
  const divisor = 10n ** BigInt(decimals);
  const integerPart = amount / divisor;
  const fractionalPart = amount % divisor;

  // Handle integer-only amounts
  if (fractionalPart === 0n) {
    const formatted = compact
      ? formatCompactNumber(Number(integerPart), locale)
      : new Intl.NumberFormat(locale, {
          minimumFractionDigits: minDecimals,
          maximumFractionDigits: minDecimals,
        }).format(integerPart);
    return symbol ? `${formatted} ${symbol}` : formatted;
  }

  // Format with fractional part
  const fractionalString = fractionalPart.toString().padStart(decimals, '0');
  const trimmed = fractionalString.slice(0, maxDecimals).replace(/0+$/, '');

  const fullNumber = trimmed
    ? `${integerPart}.${trimmed}`
    : integerPart.toString();

  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: minDecimals,
    maximumFractionDigits: maxDecimals,
  }).format(parseFloat(fullNumber));

  return symbol ? `${formatted} ${symbol}` : formatted;
}

/**
 * Format a percentage value with locale-appropriate formatting.
 * 
 * @example
 * formatPercentage(0.875, 'en') // => "87.5%"
 * formatPercentage(0.875, 'en', { decimals: 1 }) // => "87.5%"
 */
export function formatPercentage(
  value: number,
  locale: Locale,
  options: { decimals?: number } = {}
): string {
  const { decimals = 1 } = options;
  
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/**
 * Format a number in compact notation (K, M, B).
 * 
 * @example
 * formatCompactNumber(1500, 'en') // => "1.5K"
 * formatCompactNumber(1500000, 'en') // => "1.5M"
 */
export function formatCompactNumber(
  value: number,
  locale: Locale,
  decimals = 1
): string {
  return new Intl.NumberFormat(locale, {
    notation: 'compact',
    compactDisplay: 'short',
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  }).format(value);
}

// ---------------------------------------------------------------------------
// Time and Duration Formatters
// ---------------------------------------------------------------------------

/**
 * Format a duration in milliseconds to human-readable string.
 * 
 * @example
 * formatDuration(65000, 'en') // => "1 minute 5 seconds"
 * formatDuration(3600000, 'en') // => "1 hour"
 */
export function formatDuration(
  milliseconds: number,
  locale: Locale,
  options: { style?: 'long' | 'short' | 'narrow' } = {}
): string {
  const { style = 'long' } = options;
  
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  const parts: string[] = [];

  if (days > 0) {
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style });
    parts.push(rtf.format(days, 'day').replace(/^in |ago$/, '').trim());
  } else if (hours > 0) {
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style });
    parts.push(rtf.format(hours, 'hour').replace(/^in |ago$/, '').trim());
  } else if (minutes > 0) {
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style });
    parts.push(rtf.format(minutes, 'minute').replace(/^in |ago$/, '').trim());
  } else {
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style });
    parts.push(rtf.format(seconds, 'second').replace(/^in |ago$/, '').trim());
  }

  return parts.join(' ');
}

/**
 * Format a timestamp to a relative time string ("2 hours ago").
 * 
 * @example
 * const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
 * formatRelativeTime(twoHoursAgo, 'en') // => "2 hours ago"
 */
export function formatRelativeTime(
  timestamp: number | Date,
  locale: Locale,
  baseTime: number | Date = Date.now()
): string {
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  
  const timestampMs = typeof timestamp === 'number' ? timestamp : timestamp.getTime();
  const baseMs = typeof baseTime === 'number' ? baseTime : baseTime.getTime();
  const diffMs = timestampMs - baseMs;
  const diffSeconds = Math.round(diffMs / 1000);

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
    const value = Math.floor(diffSeconds / seconds);
    if (Math.abs(value) >= 1) {
      return rtf.format(value, unit);
    }
  }

  return rtf.format(0, 'second');
}

/**
 * Format a timestamp to an absolute date/time string.
 * 
 * @example
 * formatAbsoluteTime(Date.now(), 'en')
 * // => "Jan 15, 2024, 3:45 PM"
 */
export function formatAbsoluteTime(
  timestamp: number | Date,
  locale: Locale,
  options: Intl.DateTimeFormatOptions = {}
): string {
  const defaultOptions: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    ...options,
  };

  return new Intl.DateTimeFormat(locale, defaultOptions).format(timestamp);
}

/**
 * Format a Unix timestamp (seconds) to a readable date.
 * 
 * @example
 * formatUnixTimestamp(1705334700, 'en')
 * // => "Jan 15, 2024, 3:45 PM"
 */
export function formatUnixTimestamp(
  unixSeconds: number,
  locale: Locale,
  options?: Intl.DateTimeFormatOptions
): string {
  return formatAbsoluteTime(unixSeconds * 1000, locale, options);
}

// ---------------------------------------------------------------------------
// Chain and Network Formatters
// ---------------------------------------------------------------------------

/**
 * Get human-readable network name from chain ID.
 * Technical mapping - conventional names, not translated.
 * 
 * @example
 * getNetworkName(10) // => "Optimism"
 * getNetworkName(1) // => "Ethereum Mainnet"
 */
export function getNetworkName(chainId: number): string {
  const networks: Record<number, string> = {
    1: 'Ethereum Mainnet',
    10: 'Optimism',
    11155420: 'OP Sepolia',
    31337: 'Hardhat Local',
    // Add more networks as needed
  };

  return networks[chainId] ?? `Chain ${chainId}`;
}

/**
 * Get block explorer URL for an address, transaction, or block.
 * Technical URL - never translated.
 * 
 * @example
 * getExplorerUrl(10, 'tx', '0x123...')
 * // => "https://optimistic.etherscan.io/tx/0x123..."
 */
export function getExplorerUrl(
  chainId: number,
  type: 'tx' | 'address' | 'block' | 'token',
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
    token: 'token',
  };

  return `${baseUrl}/${paths[type]}/${value}`;
}

/**
 * Format chain ID with network name.
 * 
 * @example
 * formatChainId(10, 'en') // => "Optimism (10)"
 */
export function formatChainId(chainId: number, locale: Locale): string {
  const name = getNetworkName(chainId);
  const formattedId = new Intl.NumberFormat(locale).format(chainId);
  return `${name} (${formattedId})`;
}

// ---------------------------------------------------------------------------
// Validation and Safety
// ---------------------------------------------------------------------------

/**
 * Check if a string is a valid Ethereum address.
 * Technical validation - no translation.
 */
export function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

/**
 * Check if a string is a valid transaction hash.
 * Technical validation - no translation.
 */
export function isValidTxHash(hash: string): boolean {
  return /^0x[a-fA-F0-9]{64}$/.test(hash);
}

/**
 * Check if a string is a valid bytes32 hex string.
 * Technical validation - no translation.
 */
export function isValidBytes32(value: string): boolean {
  return /^0x[a-fA-F0-9]{64}$/.test(value);
}

// ---------------------------------------------------------------------------
// Export all formatters
// ---------------------------------------------------------------------------

export const formatters = {
  // Blockchain
  formatAddress,
  formatTxHash,
  formatBlockNumber,
  formatGas,
  formatGasPrice,
  formatChainId,
  
  // Tokens
  formatTokenAmount,
  formatPercentage,
  formatCompactNumber,
  
  // Time
  formatDuration,
  formatRelativeTime,
  formatAbsoluteTime,
  formatUnixTimestamp,
  
  // Network
  getNetworkName,
  getExplorerUrl,
  
  // Validation
  isValidAddress,
  isValidTxHash,
  isValidBytes32,
};

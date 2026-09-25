/**
 * V2-FE-070 — i18n Formatters Tests
 * 
 * Unit tests for blockchain and protocol-specific formatters.
 * Ensures technical accuracy and locale-aware formatting.
 */

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
  formatChainId,
  getNetworkName,
  getExplorerUrl,
  isValidAddress,
  isValidTxHash,
  isValidBytes32,
} from '@/i18n/formatters';

describe('Address Formatting', () => {
  const testAddress = '0x742d35Cc6634C0532925a3b844Bc9e7595f0eB1E';

  test('formats address in short format', () => {
    expect(formatAddress(testAddress, 'short')).toBe('0x742d...0eB1E');
  });

  test('formats address in medium format', () => {
    expect(formatAddress(testAddress, 'medium')).toBe('0x742d35Cc66...95f0eB1E');
  });

  test('formats address in full format', () => {
    expect(formatAddress(testAddress, 'full')).toBe(testAddress);
  });

  test('handles invalid address gracefully', () => {
    expect(formatAddress('invalid')).toBe('invalid');
    expect(formatAddress('')).toBe('');
  });
});

describe('Transaction Hash Formatting', () => {
  const testHash = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

  test('formats hash in short format', () => {
    expect(formatTxHash(testHash, 'short')).toBe('0x1234...cdef');
  });

  test('formats hash in medium format', () => {
    expect(formatTxHash(testHash, 'medium')).toBe('0x12345678...90abcdef');
  });

  test('formats hash in full format', () => {
    expect(formatTxHash(testHash, 'full')).toBe(testHash);
  });
});

describe('Block Number Formatting', () => {
  test('formats block number with en locale', () => {
    expect(formatBlockNumber(12345678, 'en')).toBe('12,345,678');
  });

  test('formats block number with de locale', () => {
    expect(formatBlockNumber(12345678, 'de')).toBe('12.345.678');
  });

  test('formats bigint block numbers', () => {
    expect(formatBlockNumber(BigInt(12345678), 'en')).toBe('12,345,678');
  });
});

describe('Gas Formatting', () => {
  test('formats gas amount', () => {
    expect(formatGas(21000, 'en')).toBe('21,000');
  });

  test('formats gas price in Gwei', () => {
    expect(formatGasPrice(50000000000n, 'en', 2)).toContain('50');
    expect(formatGasPrice(50000000000n, 'en', 2)).toContain('Gwei');
  });
});

describe('Token Amount Formatting', () => {
  test('formats whole token amounts', () => {
    const oneEth = 1000000000000000000n; // 1 ETH
    expect(formatTokenAmount(oneEth, 18, 'en')).toBe('1');
  });

  test('formats fractional token amounts', () => {
    const halfEth = 500000000000000000n; // 0.5 ETH
    expect(formatTokenAmount(halfEth, 18, 'en')).toBe('0.5');
  });

  test('includes symbol when provided', () => {
    const oneEth = 1000000000000000000n;
    expect(formatTokenAmount(oneEth, 18, 'en', { symbol: 'ETH' })).toBe('1 ETH');
  });

  test('respects maxDecimals option', () => {
    const amount = 1234567890123456789n; // 1.234567890123456789 ETH
    const formatted = formatTokenAmount(amount, 18, 'en', { maxDecimals: 4 });
    expect(formatted).toBe('1.2345');
  });

  test('handles compact notation', () => {
    const largeAmount = 1500000000000000000000n; // 1500 ETH
    const formatted = formatTokenAmount(largeAmount, 18, 'en', { compact: true });
    expect(formatted).toContain('1');
  });
});

describe('Percentage Formatting', () => {
  test('formats percentage with default decimals', () => {
    expect(formatPercentage(0.875, 'en')).toBe('87.5%');
  });

  test('formats percentage with custom decimals', () => {
    expect(formatPercentage(0.12345, 'en', { decimals: 2 })).toBe('12.35%');
  });
});

describe('Compact Number Formatting', () => {
  test('formats thousands', () => {
    expect(formatCompactNumber(1500, 'en')).toBe('1.5K');
  });

  test('formats millions', () => {
    expect(formatCompactNumber(2500000, 'en')).toBe('2.5M');
  });

  test('formats billions', () => {
    expect(formatCompactNumber(3500000000, 'en')).toBe('3.5B');
  });
});

describe('Duration Formatting', () => {
  test('formats seconds', () => {
    const result = formatDuration(5000, 'en');
    expect(result).toContain('5');
    expect(result).toContain('second');
  });

  test('formats minutes', () => {
    const result = formatDuration(65000, 'en');
    expect(result).toContain('1');
    expect(result).toContain('minute');
  });

  test('formats hours', () => {
    const result = formatDuration(3600000, 'en');
    expect(result).toContain('1');
    expect(result).toContain('hour');
  });
});

describe('Chain and Network Utilities', () => {
  test('gets network name for known chains', () => {
    expect(getNetworkName(1)).toBe('Ethereum Mainnet');
    expect(getNetworkName(10)).toBe('Optimism');
    expect(getNetworkName(11155420)).toBe('OP Sepolia');
  });

  test('formats unknown chain ID', () => {
    expect(getNetworkName(999999)).toBe('Chain 999999');
  });

  test('formats chain ID with network name', () => {
    const result = formatChainId(10, 'en');
    expect(result).toContain('Optimism');
    expect(result).toContain('10');
  });

  test('generates explorer URLs', () => {
    const txUrl = getExplorerUrl(10, 'tx', '0x123');
    expect(txUrl).toContain('optimistic.etherscan.io');
    expect(txUrl).toContain('/tx/');
    expect(txUrl).toContain('0x123');
  });

  test('generates address explorer URLs', () => {
    const addressUrl = getExplorerUrl(10, 'address', '0xabc');
    expect(addressUrl).toContain('/address/');
    expect(addressUrl).toContain('0xabc');
  });

  test('returns empty string for unknown chain', () => {
    expect(getExplorerUrl(999999, 'tx', '0x123')).toBe('');
  });
});

describe('Validation Functions', () => {
  test('validates Ethereum addresses', () => {
    expect(isValidAddress('0x742d35Cc6634C0532925a3b844Bc9e7595f0eB1E')).toBe(true);
    expect(isValidAddress('0x742d35Cc6634C0532925a3b844Bc9e7595f0eB1E'.toLowerCase())).toBe(true);
    expect(isValidAddress('invalid')).toBe(false);
    expect(isValidAddress('0x123')).toBe(false);
  });

  test('validates transaction hashes', () => {
    const validHash = '0x' + 'a'.repeat(64);
    expect(isValidTxHash(validHash)).toBe(true);
    expect(isValidTxHash('0x123')).toBe(false);
    expect(isValidTxHash('invalid')).toBe(false);
  });

  test('validates bytes32 values', () => {
    const validBytes = '0x' + 'b'.repeat(64);
    expect(isValidBytes32(validBytes)).toBe(true);
    expect(isValidBytes32('0x123')).toBe(false);
  });
});

describe('Locale-specific Formatting', () => {
  test('respects locale for number formatting', () => {
    expect(formatBlockNumber(1234567, 'en')).toBe('1,234,567');
    expect(formatBlockNumber(1234567, 'de')).toBe('1.234.567');
  });

  test('respects locale for percentage formatting', () => {
    const enResult = formatPercentage(0.5, 'en');
    const deResult = formatPercentage(0.5, 'de');
    expect(enResult).toContain('50');
    expect(deResult).toContain('50');
  });
});

describe('Edge Cases', () => {
  test('handles zero values', () => {
    expect(formatBlockNumber(0, 'en')).toBe('0');
    expect(formatGas(0, 'en')).toBe('0');
    expect(formatTokenAmount(0n, 18, 'en')).toBe('0');
  });

  test('handles very large numbers', () => {
    const largeNumber = 999999999999999n;
    expect(() => formatBlockNumber(largeNumber, 'en')).not.toThrow();
    expect(() => formatTokenAmount(largeNumber, 18, 'en')).not.toThrow();
  });

  test('handles empty strings gracefully', () => {
    expect(formatAddress('')).toBe('');
    expect(formatTxHash('')).toBe('');
  });
});

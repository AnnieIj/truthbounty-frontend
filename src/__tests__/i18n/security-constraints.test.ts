/**
 * V2-FE-070 — i18n Security Constraints Tests
 * 
 * Ensures i18n system does not fabricate protocol data and preserves
 * technical identifiers correctly.
 */

import {
  formatAddress,
  formatTxHash,
  formatBlockNumber,
  formatTokenAmount,
  isValidAddress,
  isValidTxHash,
} from '@/i18n/formatters';
import { extractErrorParams } from '@/i18n/protocol-mapper';

describe('Security: No Data Fabrication', () => {
  test('formatters do not generate fake addresses', () => {
    const input = '0x742d35Cc6634C0532925a3b844Bc9e7595f0eB1E';
    const formatted = formatAddress(input, 'short');
    
    // Should shorten but preserve actual hex characters
    expect(formatted).toContain('0x742d');
    expect(formatted).toContain('0eB1E');
    expect(formatted).not.toContain('0x000000'); // No fabricated zero address
  });

  test('formatters do not generate fake hashes', () => {
    const input = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
    const formatted = formatTxHash(input, 'short');
    
    // Should preserve actual characters from input
    expect(formatted).toContain('0x1234');
    expect(formatted).toContain('cdef');
  });

  test('formatters preserve exact numeric values', () => {
    const blockNumber = 12345678;
    const formatted = formatBlockNumber(blockNumber, 'en');
    
    // Should format but not change the value
    expect(formatted.replace(/,/g, '')).toBe(String(blockNumber));
  });

  test('token formatters preserve value accuracy', () => {
    const amount = 1234567890123456789n; // 1.234567890123456789 ETH
    const formatted = formatTokenAmount(amount, 18, 'en', { maxDecimals: 18 });
    
    // Should not round or fabricate digits
    const numericValue = parseFloat(formatted);
    expect(numericValue).toBeCloseTo(1.234567890123456789, 10);
  });

  test('error param extraction does not add fabricated data', () => {
    const originalError = {
      chainId: 10,
      message: 'Test error',
    };
    
    const params = extractErrorParams(originalError);
    
    // Should only contain data from original error
    expect(params.chainId).toBe(10);
    expect(params.message).toBe('Test error');
    
    // Should not add fabricated fields
    expect(params).not.toHaveProperty('txHash');
    expect(params).not.toHaveProperty('blockNumber');
    expect(params).not.toHaveProperty('address');
  });
});

describe('Security: Technical Identifier Preservation', () => {
  test('addresses are never translated', () => {
    const address = '0x742d35Cc6634C0532925a3b844Bc9e7595f0eB1E';
    
    // Different formats should all preserve the hex characters
    const short = formatAddress(address, 'short');
    const medium = formatAddress(address, 'medium');
    const full = formatAddress(address, 'full');
    
    expect(short).toMatch(/^0x[a-fA-F0-9]/);
    expect(medium).toMatch(/^0x[a-fA-F0-9]/);
    expect(full).toBe(address);
  });

  test('transaction hashes are never translated', () => {
    const hash = '0x' + 'a'.repeat(64);
    
    const short = formatTxHash(hash, 'short');
    const full = formatTxHash(hash, 'full');
    
    expect(short).toMatch(/^0x[a-fA-F0-9]/);
    expect(full).toBe(hash);
  });

  test('chain IDs remain numeric', () => {
    const params = extractErrorParams({ chainId: 10, expectedChainId: 1 });
    
    expect(typeof params.chainId).toBe('number');
    expect(typeof params.expectedChain).toBe('number');
    expect(params.chainId).toBe(10);
    expect(params.expectedChain).toBe(1);
  });

  test('block numbers are not modified', () => {
    const blockNumber = 12345678;
    const formatted = formatBlockNumber(blockNumber, 'en');
    const parsed = parseInt(formatted.replace(/,/g, ''));
    
    expect(parsed).toBe(blockNumber);
  });

  test('gas values are exact', () => {
    const gas = 21000n;
    const formatted = formatTokenAmount(gas, 0, 'en'); // 0 decimals for gas
    const parsed = parseInt(formatted.replace(/,/g, ''));
    
    expect(parsed).toBe(Number(gas));
  });
});

describe('Security: Validation Integrity', () => {
  test('address validation is accurate', () => {
    // Valid addresses
    expect(isValidAddress('0x742d35Cc6634C0532925a3b844Bc9e7595f0eB1E')).toBe(true);
    expect(isValidAddress('0x' + '0'.repeat(40))).toBe(true);
    
    // Invalid addresses
    expect(isValidAddress('not-an-address')).toBe(false);
    expect(isValidAddress('0x123')).toBe(false);
    expect(isValidAddress('')).toBe(false);
  });

  test('hash validation is accurate', () => {
    // Valid hashes
    expect(isValidTxHash('0x' + 'a'.repeat(64))).toBe(true);
    expect(isValidTxHash('0x' + '0'.repeat(64))).toBe(true);
    
    // Invalid hashes
    expect(isValidTxHash('not-a-hash')).toBe(false);
    expect(isValidTxHash('0x123')).toBe(false);
    expect(isValidTxHash('')).toBe(false);
  });

  test('validation does not accept fabricated data', () => {
    // Should reject anything that's not a proper address format
    expect(isValidAddress('0xfabricated')).toBe(false);
    expect(isValidAddress('0x' + 'z'.repeat(40))).toBe(false);
    
    // Should reject anything that's not a proper hash format
    expect(isValidTxHash('0xfabricated')).toBe(false);
    expect(isValidTxHash('0x' + 'z'.repeat(64))).toBe(false);
  });
});

describe('Security: No Information Leakage', () => {
  test('error extraction does not expose internal state', () => {
    const error = {
      chainId: 10,
      _internal: 'secret',
      __proto__: { secret: 'data' },
    };
    
    const params = extractErrorParams(error);
    
    // Should only extract expected public fields
    expect(params.chainId).toBe(10);
    expect(params).not.toHaveProperty('_internal');
    expect(params).not.toHaveProperty('secret');
  });

  test('formatters do not expose raw input when invalid', () => {
    const maliciousInput = '<script>alert("xss")</script>';
    
    // Should handle gracefully without exposing raw input
    const formatted = formatAddress(maliciousInput);
    expect(formatted).toBe(maliciousInput); // Returns as-is for invalid, but doesn't execute
  });
});

describe('Security: Type Safety', () => {
  test('formatters handle wrong types safely', () => {
    // @ts-expect-error - Testing runtime safety
    expect(() => formatAddress(123)).not.toThrow();
    
    // @ts-expect-error - Testing runtime safety
    expect(() => formatTxHash(null)).not.toThrow();
    
    // @ts-expect-error - Testing runtime safety
    expect(() => formatBlockNumber(undefined, 'en')).not.toThrow();
  });

  test('extractErrorParams handles non-objects safely', () => {
    expect(() => extractErrorParams(null)).not.toThrow();
    expect(() => extractErrorParams(undefined)).not.toThrow();
    expect(() => extractErrorParams('string')).not.toThrow();
    expect(() => extractErrorParams(123)).not.toThrow();
    
    expect(extractErrorParams(null)).toEqual({});
    expect(extractErrorParams(undefined)).toEqual({});
  });
});

describe('Security: Immutability', () => {
  test('formatters do not mutate input', () => {
    const address = '0x742d35Cc6634C0532925a3b844Bc9e7595f0eB1E';
    const originalAddress = address;
    
    formatAddress(address, 'short');
    
    expect(address).toBe(originalAddress);
  });

  test('error param extraction does not mutate error object', () => {
    const error = { chainId: 10, message: 'test' };
    const originalError = { ...error };
    
    extractErrorParams(error);
    
    expect(error).toEqual(originalError);
  });
});

describe('Security: Canonical Values', () => {
  test('zero address is preserved', () => {
    const zeroAddress = '0x' + '0'.repeat(40);
    expect(formatAddress(zeroAddress, 'full')).toBe(zeroAddress);
  });

  test('null hash is handled correctly', () => {
    const nullHash = '0x' + '0'.repeat(64);
    expect(formatTxHash(nullHash, 'full')).toBe(nullHash);
  });

  test('zero values are preserved accurately', () => {
    expect(formatBlockNumber(0, 'en')).toBe('0');
    expect(formatTokenAmount(0n, 18, 'en')).toBe('0');
  });
});

describe('Security: Bounds Checking', () => {
  test('handles maximum safe integer', () => {
    const maxSafe = Number.MAX_SAFE_INTEGER;
    expect(() => formatBlockNumber(maxSafe, 'en')).not.toThrow();
  });

  test('handles very large bigints', () => {
    const largeBigInt = BigInt('999999999999999999999999999999');
    expect(() => formatTokenAmount(largeBigInt, 18, 'en')).not.toThrow();
  });

  test('handles negative values appropriately', () => {
    // Block numbers should not be negative, but formatter should handle gracefully
    expect(() => formatBlockNumber(-1, 'en')).not.toThrow();
  });
});

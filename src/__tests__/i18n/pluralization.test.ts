/**
 * V2-FE-070 — Pluralization Tests
 * 
 * Tests for pluralization utilities and protocol-specific pluralizers.
 */

import {
  pluralize,
  getPluralCategory,
  formatCount,
  formatOrdinal,
  formatRange,
  formatList,
  protocolPluralizers,
  createPluralMessage,
} from '@/i18n/pluralization';

describe('Simple Pluralization', () => {
  test('returns singular for count of 1', () => {
    expect(pluralize(1, 'claim')).toBe('claim');
  });

  test('returns plural for count of 0', () => {
    expect(pluralize(0, 'claim')).toBe('claims');
  });

  test('returns plural for count > 1', () => {
    expect(pluralize(5, 'claim')).toBe('claims');
  });

  test('uses custom plural form', () => {
    expect(pluralize(2, 'address', 'addresses')).toBe('addresses');
  });

  test('defaults to adding "s"', () => {
    expect(pluralize(2, 'claim')).toBe('claims');
  });
});

describe('Plural Category Detection', () => {
  test('detects "one" category for 1 in English', () => {
    expect(getPluralCategory(1, 'en')).toBe('one');
  });

  test('detects "other" category for other numbers in English', () => {
    expect(getPluralCategory(0, 'en')).toBe('other');
    expect(getPluralCategory(2, 'en')).toBe('other');
    expect(getPluralCategory(100, 'en')).toBe('other');
  });

  test('handles different locales', () => {
    // Different locales have different plural rules
    const category = getPluralCategory(1, 'en');
    expect(typeof category).toBe('string');
  });
});

describe('Format Count', () => {
  test('formats count with singular', () => {
    expect(formatCount(1, 'claim', 'claims', 'en')).toBe('1 claim');
  });

  test('formats count with plural', () => {
    expect(formatCount(5, 'claim', 'claims', 'en')).toBe('5 claims');
  });

  test('formats zero with plural', () => {
    expect(formatCount(0, 'claim', 'claims', 'en')).toBe('0 claims');
  });

  test('formats large numbers', () => {
    expect(formatCount(1000, 'transaction', 'transactions', 'en')).toBe('1,000 transactions');
  });

  test('respects locale for number formatting', () => {
    const enResult = formatCount(1000, 'claim', 'claims', 'en');
    const deResult = formatCount(1000, 'claim', 'claims', 'de');
    
    expect(enResult).toContain('1,000');
    expect(deResult).toContain('1.000');
  });
});

describe('Ordinal Formatting', () => {
  test('formats 1st', () => {
    expect(formatOrdinal(1, 'en')).toBe('1st');
  });

  test('formats 2nd', () => {
    expect(formatOrdinal(2, 'en')).toBe('2nd');
  });

  test('formats 3rd', () => {
    expect(formatOrdinal(3, 'en')).toBe('3rd');
  });

  test('formats 4th', () => {
    expect(formatOrdinal(4, 'en')).toBe('4th');
  });

  test('formats 11th (exception)', () => {
    expect(formatOrdinal(11, 'en')).toBe('11th');
  });

  test('formats 21st', () => {
    expect(formatOrdinal(21, 'en')).toBe('21st');
  });

  test('formats 100th', () => {
    expect(formatOrdinal(100, 'en')).toBe('100th');
  });
});

describe('Range Formatting', () => {
  test('formats simple range', () => {
    expect(formatRange(1, 10, 'en')).toBe('1–10');
  });

  test('formats large range', () => {
    const result = formatRange(100, 500, 'en');
    expect(result).toContain('100');
    expect(result).toContain('500');
    expect(result).toContain('–'); // en-dash
  });

  test('respects locale for number formatting', () => {
    const enResult = formatRange(1000, 2000, 'en');
    const deResult = formatRange(1000, 2000, 'de');
    
    expect(enResult).toContain('1,000');
    expect(deResult).toContain('1.000');
  });
});

describe('List Formatting', () => {
  test('formats conjunction list', () => {
    const result = formatList(['Alice', 'Bob', 'Charlie'], 'en', 'conjunction');
    expect(result).toContain('Alice');
    expect(result).toContain('Bob');
    expect(result).toContain('Charlie');
    expect(result).toContain('and');
  });

  test('formats disjunction list', () => {
    const result = formatList(['claim', 'verification'], 'en', 'disjunction');
    expect(result).toContain('claim');
    expect(result).toContain('verification');
    expect(result).toContain('or');
  });

  test('formats single item list', () => {
    expect(formatList(['item'], 'en')).toBe('item');
  });

  test('formats empty list', () => {
    expect(formatList([], 'en')).toBe('');
  });

  test('formats two-item list', () => {
    const result = formatList(['first', 'second'], 'en', 'conjunction');
    expect(result).toContain('first');
    expect(result).toContain('second');
  });
});

describe('Protocol Pluralizers', () => {
  test('pluralizes claims', () => {
    expect(protocolPluralizers.claims(1, 'en')).toBe('1 claim');
    expect(protocolPluralizers.claims(5, 'en')).toBe('5 claims');
  });

  test('pluralizes verifications', () => {
    expect(protocolPluralizers.verifications(1, 'en')).toBe('1 verification');
    expect(protocolPluralizers.verifications(3, 'en')).toBe('3 verifications');
  });

  test('pluralizes disputes', () => {
    expect(protocolPluralizers.disputes(1, 'en')).toBe('1 dispute');
    expect(protocolPluralizers.disputes(2, 'en')).toBe('2 disputes');
  });

  test('pluralizes confirmations', () => {
    expect(protocolPluralizers.confirmations(1, 'en')).toBe('1 confirmation');
    expect(protocolPluralizers.confirmations(10, 'en')).toBe('10 confirmations');
  });

  test('pluralizes transactions', () => {
    expect(protocolPluralizers.transactions(1, 'en')).toBe('1 transaction');
    expect(protocolPluralizers.transactions(100, 'en')).toBe('100 transactions');
  });

  test('pluralizes verifiers', () => {
    expect(protocolPluralizers.verifiers(1, 'en')).toBe('1 verifier');
    expect(protocolPluralizers.verifiers(50, 'en')).toBe('50 verifiers');
  });

  test('pluralizes blocks', () => {
    expect(protocolPluralizers.blocks(1, 'en')).toBe('1 block');
    expect(protocolPluralizers.blocks(1000, 'en')).toBe('1,000 blocks');
  });
});

describe('ICU Message Format Creation', () => {
  test('creates plural message with zero and one forms', () => {
    const message = createPluralMessage({
      zero: 'no items',
      one: 'one item',
      other: '# items',
    });
    
    expect(message).toContain('=0 {no items}');
    expect(message).toContain('=1 {one item}');
    expect(message).toContain('other {# items}');
  });

  test('creates plural message with only one and other', () => {
    const message = createPluralMessage({
      one: 'one claim',
      other: '# claims',
    });
    
    expect(message).toContain('=1 {one claim}');
    expect(message).toContain('other {# claims}');
    expect(message).not.toContain('=0');
  });

  test('creates plural message with all forms', () => {
    const message = createPluralMessage({
      zero: 'none',
      one: 'single',
      two: 'pair',
      few: 'few',
      many: 'many',
      other: 'other',
    });
    
    expect(message).toContain('=0 {none}');
    expect(message).toContain('=1 {single}');
    expect(message).toContain('=2 {pair}');
    expect(message).toContain('few {few}');
    expect(message).toContain('many {many}');
    expect(message).toContain('other {other}');
  });
});

describe('Edge Cases', () => {
  test('handles zero correctly', () => {
    expect(pluralize(0, 'item')).toBe('items');
    expect(formatCount(0, 'item', 'items', 'en')).toBe('0 items');
    expect(formatOrdinal(0, 'en')).toBe('0th');
  });

  test('handles negative numbers', () => {
    expect(pluralize(-1, 'item')).toBe('items');
    expect(formatCount(-5, 'item', 'items', 'en')).toBe('-5 items');
  });

  test('handles very large numbers', () => {
    const result = formatCount(999999, 'claim', 'claims', 'en');
    expect(result).toContain('999,999');
    expect(result).toContain('claims');
  });
});

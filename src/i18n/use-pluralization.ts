/**
 * V2-FE-070 — React Hooks for Pluralization
 * 
 * Hooks for using pluralization utilities in React components.
 * Automatically uses the current user's locale.
 */

'use client';

import { useCallback } from 'react';
import { useLocale } from './client';
import {
  formatCount,
  formatOrdinal,
  formatRange,
  formatList,
  protocolPluralizers,
  getPluralCategory,
  pluralize,
} from './pluralization';

/**
 * Hook for formatting counts with plural forms.
 * 
 * @example
 * const formatCountPlural = useFormatCount();
 * return <span>{formatCountPlural(5, 'claim', 'claims')}</span>;
 * // => "5 claims"
 */
export function useFormatCount() {
  const locale = useLocale();
  
  return useCallback(
    (count: number, singular: string, plural: string) => {
      return formatCount(count, singular, plural, locale);
    },
    [locale]
  );
}

/**
 * Hook for formatting ordinal numbers (1st, 2nd, 3rd).
 * 
 * @example
 * const formatOrd = useFormatOrdinal();
 * return <span>You are the {formatOrd(position)} verifier</span>;
 */
export function useFormatOrdinal() {
  const locale = useLocale();
  
  return useCallback(
    (n: number) => {
      return formatOrdinal(n, locale);
    },
    [locale]
  );
}

/**
 * Hook for formatting number ranges.
 * 
 * @example
 * const formatRng = useFormatRange();
 * return <span>Showing {formatRng(1, 10)}</span>;
 * // => "Showing 1–10"
 */
export function useFormatRange() {
  const locale = useLocale();
  
  return useCallback(
    (start: number, end: number, options?: Intl.NumberFormatOptions) => {
      return formatRange(start, end, locale, options);
    },
    [locale]
  );
}

/**
 * Hook for formatting lists with locale-appropriate conjunctions.
 * 
 * @example
 * const formatLst = useFormatList();
 * return <span>{formatLst(['Alice', 'Bob', 'Charlie'], 'conjunction')}</span>;
 * // => "Alice, Bob, and Charlie"
 */
export function useFormatList() {
  const locale = useLocale();
  
  return useCallback(
    (
      items: string[],
      type: 'conjunction' | 'disjunction' | 'unit' = 'conjunction'
    ) => {
      return formatList(items, locale, type);
    },
    [locale]
  );
}

/**
 * Hook for getting the plural category of a number.
 * Useful for custom plural logic.
 * 
 * @example
 * const getCategory = usePluralCategory();
 * const category = getCategory(count);
 * // category is 'one' | 'other' | etc.
 */
export function usePluralCategory() {
  const locale = useLocale();
  
  return useCallback(
    (count: number) => {
      return getPluralCategory(count, locale);
    },
    [locale]
  );
}

/**
 * Hook for protocol-specific plural formatters.
 * Provides shortcuts for common protocol entities.
 * 
 * @example
 * const plural = useProtocolPluralizers();
 * return (
 *   <div>
 *     <span>{plural.claims(5)}</span> // => "5 claims"
 *     <span>{plural.verifications(1)}</span> // => "1 verification"
 *   </div>
 * );
 */
export function useProtocolPluralizers() {
  const locale = useLocale();
  
  return {
    claims: useCallback(
      (count: number) => protocolPluralizers.claims(count, locale),
      [locale]
    ),
    verifications: useCallback(
      (count: number) => protocolPluralizers.verifications(count, locale),
      [locale]
    ),
    disputes: useCallback(
      (count: number) => protocolPluralizers.disputes(count, locale),
      [locale]
    ),
    confirmations: useCallback(
      (count: number) => protocolPluralizers.confirmations(count, locale),
      [locale]
    ),
    transactions: useCallback(
      (count: number) => protocolPluralizers.transactions(count, locale),
      [locale]
    ),
    verifiers: useCallback(
      (count: number) => protocolPluralizers.verifiers(count, locale),
      [locale]
    ),
    blocks: useCallback(
      (count: number) => protocolPluralizers.blocks(count, locale),
      [locale]
    ),
  };
}

/**
 * Simple pluralization hook (not locale-aware).
 * Use for programmatic pluralization where translations aren't needed.
 * 
 * @example
 * const pluralizeWord = usePluralize();
 * const word = pluralizeWord(count, 'claim', 'claims');
 */
export function usePluralize() {
  return useCallback(
    (count: number, singular: string, plural?: string) => {
      return pluralize(count, singular, plural);
    },
    []
  );
}

/**
 * Comprehensive pluralization hook.
 * Provides all pluralization utilities in one hook.
 * 
 * @example
 * const plural = usePluralizers();
 * return (
 *   <div>
 *     <span>{plural.count(5, 'claim', 'claims')}</span>
 *     <span>{plural.ordinal(1)}</span>
 *     <span>{plural.range(1, 10)}</span>
 *     <span>{plural.list(['A', 'B', 'C'])}</span>
 *     <span>{plural.claims(5)}</span>
 *   </div>
 * );
 */
export function usePluralizers() {
  const locale = useLocale();
  
  return {
    count: useCallback(
      (count: number, singular: string, plural: string) =>
        formatCount(count, singular, plural, locale),
      [locale]
    ),
    ordinal: useCallback(
      (n: number) => formatOrdinal(n, locale),
      [locale]
    ),
    range: useCallback(
      (start: number, end: number, options?: Intl.NumberFormatOptions) =>
        formatRange(start, end, locale, options),
      [locale]
    ),
    list: useCallback(
      (items: string[], type: 'conjunction' | 'disjunction' | 'unit' = 'conjunction') =>
        formatList(items, locale, type),
      [locale]
    ),
    category: useCallback(
      (count: number) => getPluralCategory(count, locale),
      [locale]
    ),
    simple: useCallback(
      (count: number, singular: string, plural?: string) =>
        pluralize(count, singular, plural),
      []
    ),
    // Protocol-specific
    claims: useCallback(
      (count: number) => protocolPluralizers.claims(count, locale),
      [locale]
    ),
    verifications: useCallback(
      (count: number) => protocolPluralizers.verifications(count, locale),
      [locale]
    ),
    disputes: useCallback(
      (count: number) => protocolPluralizers.disputes(count, locale),
      [locale]
    ),
    confirmations: useCallback(
      (count: number) => protocolPluralizers.confirmations(count, locale),
      [locale]
    ),
    transactions: useCallback(
      (count: number) => protocolPluralizers.transactions(count, locale),
      [locale]
    ),
    verifiers: useCallback(
      (count: number) => protocolPluralizers.verifiers(count, locale),
      [locale]
    ),
    blocks: useCallback(
      (count: number) => protocolPluralizers.blocks(count, locale),
      [locale]
    ),
  };
}

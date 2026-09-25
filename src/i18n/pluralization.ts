/**
 * V2-FE-070 — Pluralization Utilities
 * 
 * Helpers for handling plural forms in translations.
 * Uses ICU MessageFormat syntax supported by next-intl.
 * 
 * Examples of ICU plural syntax:
 * - "{count, plural, =0 {no items} =1 {one item} other {# items}}"
 * - "{count, plural, one {# day} other {# days}}"
 */

/**
 * Generate an ICU plural message format string.
 * This is used when dynamically creating translation keys.
 * 
 * @param forms - Object with plural forms
 * @returns ICU MessageFormat plural string
 * 
 * @example
 * createPluralMessage({
 *   zero: 'no claims',
 *   one: 'one claim',
 *   other: '# claims'
 * })
 * // => "{count, plural, =0 {no claims} =1 {one claim} other {# claims}}"
 */
export function createPluralMessage(forms: {
  zero?: string;
  one?: string;
  two?: string;
  few?: string;
  many?: string;
  other: string;
}): string {
  const parts: string[] = [];

  if (forms.zero !== undefined) {
    parts.push(`=0 {${forms.zero}}`);
  }
  if (forms.one !== undefined) {
    parts.push(`=1 {${forms.one}}`);
  }
  if (forms.two !== undefined) {
    parts.push(`=2 {${forms.two}}`);
  }
  if (forms.few !== undefined) {
    parts.push(`few {${forms.few}}`);
  }
  if (forms.many !== undefined) {
    parts.push(`many {${forms.many}}`);
  }
  parts.push(`other {${forms.other}}`);

  return `{count, plural, ${parts.join(' ')}}`;
}

/**
 * Common plural forms for protocol operations.
 * These can be referenced in components without hardcoding strings.
 */
export const PLURAL_FORMS = {
  claims: {
    zero: 'no claims',
    one: '1 claim',
    other: '# claims',
  },
  verifications: {
    zero: 'no verifications',
    one: '1 verification',
    other: '# verifications',
  },
  disputes: {
    zero: 'no disputes',
    one: '1 dispute',
    other: '# disputes',
  },
  confirmations: {
    zero: 'no confirmations',
    one: '1 confirmation',
    other: '# confirmations',
  },
  transactions: {
    zero: 'no transactions',
    one: '1 transaction',
    other: '# transactions',
  },
  verifiers: {
    zero: 'no verifiers',
    one: '1 verifier',
    other: '# verifiers',
  },
  participants: {
    zero: 'no participants',
    one: '1 participant',
    other: '# participants',
  },
  items: {
    zero: 'no items',
    one: '1 item',
    other: '# items',
  },
  results: {
    zero: 'no results',
    one: '1 result',
    other: '# results',
  },
  selected: {
    zero: 'none selected',
    one: '1 selected',
    other: '# selected',
  },
  blocks: {
    zero: 'no blocks',
    one: '1 block',
    other: '# blocks',
  },
  seconds: {
    zero: '0 seconds',
    one: '1 second',
    other: '# seconds',
  },
  minutes: {
    zero: '0 minutes',
    one: '1 minute',
    other: '# minutes',
  },
  hours: {
    zero: '0 hours',
    one: '1 hour',
    other: '# hours',
  },
  days: {
    zero: '0 days',
    one: '1 day',
    other: '# days',
  },
  weeks: {
    zero: '0 weeks',
    one: '1 week',
    other: '# weeks',
  },
  months: {
    zero: '0 months',
    one: '1 month',
    other: '# months',
  },
  years: {
    zero: '0 years',
    one: '1 year',
    other: '# years',
  },
} as const;

/**
 * Simple English pluralization for programmatic use.
 * Not locale-aware - use translations for user-facing text.
 * 
 * @example
 * pluralize(1, 'claim') // => "claim"
 * pluralize(5, 'claim') // => "claims"
 * pluralize(0, 'address', 'addresses') // => "addresses"
 */
export function pluralize(
  count: number,
  singular: string,
  plural?: string
): string {
  if (count === 1) {
    return singular;
  }
  return plural ?? `${singular}s`;
}

/**
 * Get the appropriate plural form key for a count.
 * Uses CLDR plural rules.
 * 
 * @param count - Number to evaluate
 * @param locale - Locale for plural rules
 * @returns Plural category: 'zero', 'one', 'two', 'few', 'many', or 'other'
 * 
 * @example
 * getPluralCategory(0, 'en') // => 'other' (English has no 'zero' form)
 * getPluralCategory(1, 'en') // => 'one'
 * getPluralCategory(5, 'en') // => 'other'
 */
export function getPluralCategory(
  count: number,
  locale: string
): 'zero' | 'one' | 'two' | 'few' | 'many' | 'other' {
  const rules = new Intl.PluralRules(locale);
  const category = rules.select(count);
  
  // Intl.PluralRules returns LDMLPluralRule which matches our categories
  return category as 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';
}

/**
 * Format a count with its appropriate plural form.
 * This is a convenience wrapper for common cases.
 * 
 * @example
 * formatCount(5, 'claim', 'claims', 'en')
 * // => "5 claims"
 * 
 * formatCount(1, 'verification', 'verifications', 'en')
 * // => "1 verification"
 */
export function formatCount(
  count: number,
  singular: string,
  plural: string,
  locale: string
): string {
  const formatter = new Intl.NumberFormat(locale);
  const formattedCount = formatter.format(count);
  const category = getPluralCategory(count, locale);
  const word = category === 'one' ? singular : plural;
  
  return `${formattedCount} ${word}`;
}

/**
 * Protocol-specific plural formatters.
 * These return properly formatted strings for common protocol entities.
 */
export const protocolPluralizers = {
  claims: (count: number, locale: string) =>
    formatCount(count, 'claim', 'claims', locale),
  
  verifications: (count: number, locale: string) =>
    formatCount(count, 'verification', 'verifications', locale),
  
  disputes: (count: number, locale: string) =>
    formatCount(count, 'dispute', 'disputes', locale),
  
  confirmations: (count: number, locale: string) =>
    formatCount(count, 'confirmation', 'confirmations', locale),
  
  transactions: (count: number, locale: string) =>
    formatCount(count, 'transaction', 'transactions', locale),
  
  verifiers: (count: number, locale: string) =>
    formatCount(count, 'verifier', 'verifiers', locale),
  
  blocks: (count: number, locale: string) =>
    formatCount(count, 'block', 'blocks', locale),
};

/**
 * Ordinal number formatter (1st, 2nd, 3rd, etc.).
 * Locale-aware using Intl.PluralRules.
 * 
 * @example
 * formatOrdinal(1, 'en') // => "1st"
 * formatOrdinal(2, 'en') // => "2nd"
 * formatOrdinal(3, 'en') // => "3rd"
 * formatOrdinal(4, 'en') // => "4th"
 */
export function formatOrdinal(n: number, locale: string): string {
  const rules = new Intl.PluralRules(locale, { type: 'ordinal' });
  const suffixes: Record<string, string> = {
    one: 'st',
    two: 'nd',
    few: 'rd',
    other: 'th',
  };
  const category = rules.select(n);
  const suffix = suffixes[category] ?? suffixes.other;
  
  return `${n}${suffix}`;
}

/**
 * Range formatter for displaying count ranges.
 * 
 * @example
 * formatRange(1, 10, 'en') // => "1–10"
 * formatRange(100, 200, 'en') // => "100–200"
 */
export function formatRange(
  start: number,
  end: number,
  locale: string,
  options?: Intl.NumberFormatOptions
): string {
  const formatter = new Intl.NumberFormat(locale, options);
  
  // Use proper en-dash (–) not hyphen (-)
  return `${formatter.format(start)}–${formatter.format(end)}`;
}

/**
 * List formatter for joining items with locale-appropriate conjunctions.
 * 
 * @example
 * formatList(['claim', 'verification', 'dispute'], 'en', 'conjunction')
 * // => "claim, verification, and dispute"
 * 
 * formatList(['Alice', 'Bob'], 'en', 'disjunction')
 * // => "Alice or Bob"
 */
export function formatList(
  items: string[],
  locale: string,
  type: 'conjunction' | 'disjunction' | 'unit' = 'conjunction'
): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  
  const formatter = new Intl.ListFormat(locale, { type });
  return formatter.format(items);
}

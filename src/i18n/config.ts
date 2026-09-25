/**
 * V2-FE-070 — Internationalization Configuration
 * 
 * Core i18n setup for TruthBounty frontend.
 * Supports locale detection, message loading, and formatting.
 */

export const locales = ['en', 'es', 'fr', 'de', 'zh', 'ja'] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'en';

export const localeNames: Record<Locale, string> = {
  en: 'English',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
  zh: '中文',
  ja: '日本語',
};

/**
 * Configuration for next-intl.
 * This is used by the middleware and in the root layout.
 */
export const i18nConfig = {
  locales,
  defaultLocale,
  localePrefix: 'as-needed' as const,
} as const;

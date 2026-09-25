/**
 * V2-FE-070 — i18n Request Configuration
 * 
 * Server-side configuration for next-intl.
 * This file is imported by the Next.js app to provide translations.
 */

import { getRequestConfig } from 'next-intl/server';
import { locales, defaultLocale, type Locale } from './config';

export default getRequestConfig(async ({ locale }) => {
  // Validate that the incoming locale parameter is valid
  const validatedLocale = locales.includes(locale as Locale) 
    ? (locale as Locale)
    : defaultLocale;

  return {
    locale: validatedLocale,
    messages: (await import(`../../messages/${validatedLocale}.json`)).default,
    timeZone: 'UTC',
    now: new Date(),
  };
});

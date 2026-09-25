/**
 * V2-FE-070 — Next.js Middleware for i18n
 * 
 * Handles locale detection and routing for internationalization.
 * Uses next-intl's createMiddleware for seamless locale management.
 */

import createMiddleware from 'next-intl/middleware';
import { i18nConfig } from './src/i18n/config';

export default createMiddleware(i18nConfig);

export const config = {
  // Match all pathnames except for
  // - API routes
  // - Static files (_next/static)
  // - Image optimization files (_next/image)
  // - Favicon and other public files in the public folder
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};

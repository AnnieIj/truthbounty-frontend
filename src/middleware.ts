/**
 * TruthBounty V2 request middleware.
 *
 * Responsibilities:
 *   - Generate a per-request CSP nonce (128-bit URL-safe base64).
 *   - Set security response headers: CSP, X-Content-Type-Options,
 *     Referrer-Policy, Permissions-Policy.
 *   - Pass the nonce downstream to the app via a request header
 *     (`x-truthbounty-csp-nonce`) so the root layout's inline
 *     ThemeInitScript is the ONLY allowlisted inline script.
 *
 * Production policy is STRICT: no unsafe-inline/unsafe-eval in scripts,
 * frame-ancestors 'none', object-src 'none', base-uri 'none'.
 * Development relaxes script/style-src for Next/Vite HMR and Storybook.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  renderCspHeader,
  CSP_NONCE_HEADER,
  DEFAULT_CSP_ALLOWLIST,
} from '@/lib/security/csp-allowlist';
import { publicEnv } from '@/lib/env';

export const config = {
  matcher: [
    /*
     * Run middleware on everything EXCEPT well-known static assets
     * (images, fonts) and the internal _next build pipeline.
     * API routes and the root document always pass through.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|avif|woff2?|ttf|eot|ico)$).*)',
  ],
};

function generateNonce(): string {
  // 128 bits = 16 bytes = 22-char URL-safe base64 (no padding).
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function middleware(request: NextRequest): NextResponse {
  const nonce = generateNonce();
  const isDevelopment = process.env.NODE_ENV !== 'production';

  // Env-derived URLs that are added to connect-src. These come from the
  // validated public env schema so a bad value can only expand to the
  // explicit URLs provided here — not to arbitrary origins.
  const envConnect: string[] = [];
  const envImg: string[] = [];
  if (publicEnv.NEXT_PUBLIC_API_URL) envConnect.push(publicEnv.NEXT_PUBLIC_API_URL);
  if (publicEnv.NEXT_PUBLIC_WS_URL) envConnect.push(publicEnv.NEXT_PUBLIC_WS_URL);
  if (publicEnv.NEXT_PUBLIC_OPTIMISM_RPC_URL) envConnect.push(publicEnv.NEXT_PUBLIC_OPTIMISM_RPC_URL);
  if (publicEnv.NEXT_PUBLIC_OPTIMISM_SEPOLIA_RPC_URL)
    envConnect.push(publicEnv.NEXT_PUBLIC_OPTIMISM_SEPOLIA_RPC_URL);

  const csp = renderCspHeader({
    nonce,
    allowlist: DEFAULT_CSP_ALLOWLIST,
    envConnectUrls: envConnect,
    envImgUrls: envImg,
    development: isDevelopment,
  });

  const response = NextResponse.next({
    request: {
      headers: new Headers(request.headers),
    },
  });

  // Expose nonce to the rendered app via the forwarded request header,
  // so the root layout can read it from headers().
  response.headers.set(CSP_NONCE_HEADER, nonce);

  // ----- Security headers -----
  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=()',
  );
  // X-Frame-Options is redundant with frame-ancestors 'none' but remains
  // for older browsers that do not implement CSP level 2.
  response.headers.set('X-Frame-Options', 'DENY');

  // Security headers that vary on response (not request) are added by the
  // document headers in the root layout; CSP here is authoritative.
  return response;
}

export const _testing = { generateNonce };

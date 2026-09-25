/**
 * CSP allowlist — single source of truth for origins that may be reached
 * from the TruthBounty browser client.
 *
 * Consumed by:
 *   - src/middleware.ts (renders Content-Security-Policy header)
 *   - regression tests that assert the middleware header matches this list
 *
 * Keep this file in sync with changes to wagmi RPC config, indexer endpoints,
 * explorer links, and Worldcoin IDKit configuration.
 */

export interface CspAllowlist {
  /** Origins allowed in connect-src (RPC, API, WebSocket, indexer). */
  readonly connectSrc: readonly string[];
  /** Origins allowed in script-src (beyond self/nonce). */
  readonly scriptSrc: readonly string[];
  /** Origins allowed in style-src (beyond self/nonce). Usually empty. */
  readonly styleSrc: readonly string[];
  /** Origins allowed in img-src beyond self, data:, https:, ipfs:. */
  readonly imgSrc: readonly string[];
  /** Origins allowed in frame-src. Usually empty for TruthBounty (no iframes required). */
  readonly frameSrc: readonly string[];
}

/**
 * Canonical Optimism RPC and explorer origins — kept explicit so an
 * accidental env change does not silently widen the CSP.
 *
 * Any new environment endpoint must be added here AND reviewed by a
 * CODEOWNERS maintainer per the PR security guardian.
 */
const CANONICAL_OPTIMISM_CONNECT = [
  'https://mainnet.optimism.io',
  'https://sepolia.optimism.io',
  'https://opt-mainnet.g.alchemy.com',
  'https://opt-sepolia.g.alchemy.com',
  'https://optimistic.etherscan.io',
  'https://sepolia-optimistic.etherscan.io',
] as const;

const CANONICAL_IPFS_GATEWAYS = [
  'https://ipfs.io',
  'https://cloudflare-ipfs.com',
] as const;

const CANONICAL_WORLDCOIN = [
  'https://id.worldcoin.org',
  'https://developer.worldcoin.org',
] as const;

const CANONICAL_WALLETCONNECT = [
  'https://rpc.walletconnect.com',
  'wss://relay.walletconnect.com',
  'https://registry.walletconnect.com',
] as const;

/**
 * Origins that are always allowed in connect-src, regardless of env.
 * The environment-specified API/WSS URLs are allowed separately in the
 * middleware renderer so the allowlist itself stays static/reviewable.
 */
export const DEFAULT_CSP_ALLOWLIST: CspAllowlist = {
  connectSrc: [
    ...CANONICAL_OPTIMISM_CONNECT,
    ...CANONICAL_IPFS_GATEWAYS,
    ...CANONICAL_WORLDCOIN,
    ...CANONICAL_WALLETCONNECT,
  ],
  scriptSrc: [],
  styleSrc: [],
  imgSrc: [...CANONICAL_IPFS_GATEWAYS],
  frameSrc: [],
};

/** Quote helper for CSP keywords like 'self', 'none', nonce-*. */
function q(value: string): string {
  return value;
}

/**
 * Render a single CSP directive value from the allowlist plus per-request
 * state (nonce, env-derived URLs, development relaxations).
 *
 * Always returns a string; callers join directives with "; ".
 */
export interface RenderCspOptions {
  readonly nonce: string;
  readonly envConnectUrls?: readonly string[];
  readonly envImgUrls?: readonly string[];
  readonly allowlist?: CspAllowlist;
  readonly development?: boolean;
}

export function renderCspHeader(options: RenderCspOptions): string {
  const {
    nonce,
    envConnectUrls = [],
    envImgUrls = [],
    allowlist = DEFAULT_CSP_ALLOWLIST,
    development = false,
  } = options;

  const nonceToken = `'nonce-${nonce}'`;

  const scriptSrc = [
    q("'self'"),
    nonceToken,
    ...allowlist.scriptSrc,
    // Development: allow Next.js HMR eval/inline scripts.
    ...(development ? [q("'unsafe-eval'"), 'http://localhost:*', 'ws://localhost:*'] : []),
  ].join(' ');

  const styleSrc = [
    q("'self'"),
    nonceToken,
    ...allowlist.styleSrc,
    // Next.js / Tailwind HMR inlines style updates; keep CSP strict by
    // using nonces; only relax to unsafe-inline for storybook/dev.
    ...(development ? [q("'unsafe-inline'")] : []),
  ].join(' ');

  const connectSrc = [
    q("'self'"),
    ...allowlist.connectSrc,
    ...envConnectUrls,
    ...(development ? ['http://localhost:*', 'ws://localhost:*', 'wss://localhost:*'] : []),
  ].join(' ');

  const imgSrc = [
    q("'self'"),
    'data:',
    'https:',
    'ipfs:',
    ...allowlist.imgSrc,
    ...envImgUrls,
  ].join(' ');

  const fontSrc = [q("'self'"), 'data:'].join(' ');
  const mediaSrc = [q("'self'")].join(' ');
  const frameSrc = allowlist.frameSrc.length ? allowlist.frameSrc.join(' ') : q("'none'");
  const objectSrc = q("'none'");
  const baseUri = q("'none'");
  const formAction = q("'self'");
  const frameAncestors = q("'none'");

  return [
    `default-src ${q("'self'")}`,
    `script-src ${scriptSrc}`,
    `style-src ${styleSrc}`,
    `connect-src ${connectSrc}`,
    `img-src ${imgSrc}`,
    `font-src ${fontSrc}`,
    `media-src ${mediaSrc}`,
    `frame-src ${frameSrc}`,
    `object-src ${objectSrc}`,
    `base-uri ${baseUri}`,
    `form-action ${formAction}`,
    `frame-ancestors ${frameAncestors}`,
  ].join('; ');
}

export const CSP_NONCE_HEADER = 'x-truthbounty-csp-nonce';

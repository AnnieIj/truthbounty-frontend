/**
 * @jest-environment node
 */
import { DEFAULT_CSP_ALLOWLIST, renderCspHeader } from '../csp-allowlist';

describe('DEFAULT_CSP_ALLOWLIST', () => {
  it('includes canonical Optimism RPC + explorer origins in connectSrc', () => {
    expect(DEFAULT_CSP_ALLOWLIST.connectSrc).toContain('https://mainnet.optimism.io');
    expect(DEFAULT_CSP_ALLOWLIST.connectSrc).toContain('https://sepolia.optimism.io');
    expect(DEFAULT_CSP_ALLOWLIST.connectSrc).toContain('https://optimistic.etherscan.io');
    expect(DEFAULT_CSP_ALLOWLIST.connectSrc).toContain('https://sepolia-optimistic.etherscan.io');
  });

  it('includes WalletConnect + Worldcoin origins in connectSrc', () => {
    expect(DEFAULT_CSP_ALLOWLIST.connectSrc).toContain('wss://relay.walletconnect.com');
    expect(DEFAULT_CSP_ALLOWLIST.connectSrc).toContain('https://id.worldcoin.org');
  });

  it('includes IPFS gateways in imgSrc', () => {
    expect(DEFAULT_CSP_ALLOWLIST.imgSrc).toContain('https://ipfs.io');
  });
});

describe('renderCspHeader', () => {
  it('renders strict defaults with nonce; no unsafe-inline in script-src in production', () => {
    const header = renderCspHeader({ nonce: 'abc123' });
    expect(header).toContain("frame-ancestors 'none'");
    expect(header).toContain("object-src 'none'");
    expect(header).toContain("base-uri 'none'");
    expect(header).toContain("form-action 'self'");
    expect(header).toContain("'nonce-abc123'");
    expect(header).not.toMatch(/script-src [^;]*unsafe-inline/);
  });

  it('includes env URLs in connect-src', () => {
    const header = renderCspHeader({
      nonce: 'x',
      envConnectUrls: ['https://api.example.com', 'wss://ws.example.com'],
      envImgUrls: ['https://img.example.com'],
    });
    expect(header).toContain('https://api.example.com');
    expect(header).toContain('wss://ws.example.com');
    expect(header).toContain('https://img.example.com');
  });

  it('adds development relaxations only when development=true', () => {
    const prod = renderCspHeader({ nonce: 'n', development: false });
    const dev = renderCspHeader({ nonce: 'n', development: true });
    expect(prod).not.toContain('unsafe-eval');
    expect(dev).toContain("'unsafe-eval'");
    expect(dev).toMatch(/style-src [^;]*unsafe-inline/);
    expect(prod).not.toMatch(/style-src [^;]*unsafe-inline/);
  });
});

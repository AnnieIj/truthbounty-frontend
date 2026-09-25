/**
 * V2-FE-045 — Deterministic wallet reconnection policy (pure unit tests).
 *
 * Proves the restore policy is deterministic and fails closed:
 *  - provider is authoritative; preferences are only hints
 *  - unsupported chain / malformed account never yields a usable connection
 *  - stale preferences are dropped, valid preferences reconnect
 */

import {
  WALLET_CONNECTOR_PREF_KEY,
  isSupportedWalletChain,
  isTrustedProviderConnection,
  isValidWalletAccount,
  planWalletReconnect,
  resolveProviderStatus,
  type WalletProviderSnapshot,
} from '../reconnect';

const VALID = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const ZERO = '0x0000000000000000000000000000000000000000';
const STELLAR = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVW';

describe('resolveProviderStatus', () => {
  it('maps raw wagmi flags deterministically', () => {
    expect(resolveProviderStatus({ isConnecting: true })).toBe('connecting');
    expect(resolveProviderStatus({ isReconnecting: true })).toBe('reconnecting');
    expect(resolveProviderStatus({ isConnected: true })).toBe('connected');
    expect(resolveProviderStatus({})).toBe('disconnected');
  });

  it('prioritises an in-flight connection over a connected flag', () => {
    expect(
      resolveProviderStatus({ isConnected: true, isConnecting: true }),
    ).toBe('connecting');
    expect(
      resolveProviderStatus({ isConnected: true, isReconnecting: true }),
    ).toBe('reconnecting');
  });
});

describe('isSupportedWalletChain', () => {
  it('accepts only Optimism mainnet and OP Sepolia by default', () => {
    expect(isSupportedWalletChain(10)).toBe(true);
    expect(isSupportedWalletChain(11155420)).toBe(true);
    expect(isSupportedWalletChain(1)).toBe(false);
    expect(isSupportedWalletChain(undefined)).toBe(false);
    expect(isSupportedWalletChain(NaN)).toBe(false);
  });
});

describe('isValidWalletAccount', () => {
  it('accepts canonical EVM accounts', () => {
    expect(isValidWalletAccount(VALID)).toBe(true);
  });

  it('rejects malformed, zero, placeholder and Stellar addresses', () => {
    expect(isValidWalletAccount('0x123')).toBe(false);
    expect(isValidWalletAccount(ZERO)).toBe(false);
    expect(isValidWalletAccount(STELLAR)).toBe(false);
    expect(isValidWalletAccount(undefined)).toBe(false);
    expect(isValidWalletAccount('0xYOURCONTRACT')).toBe(false);
  });
});

describe('isTrustedProviderConnection', () => {
  function snapshot(overrides: Partial<WalletProviderSnapshot> = {}): WalletProviderSnapshot {
    return { status: 'connected', address: VALID, chainId: 10, connectorId: 'injected', ...overrides };
  }

  it('trusts only connected + valid account + supported chain', () => {
    expect(isTrustedProviderConnection(snapshot())).toBe(true);
    expect(isTrustedProviderConnection(snapshot({ status: 'disconnected' }))).toBe(false);
    expect(isTrustedProviderConnection(snapshot({ address: 'nope' }))).toBe(false);
    expect(isTrustedProviderConnection(snapshot({ chainId: 1 }))).toBe(false);
  });
});

describe('planWalletReconnect', () => {
  const connectors = [{ id: 'injected' }, { id: 'walletconnect' }];

  it('never races a provider-initiated connection', () => {
    for (const status of ['unknown', 'connecting', 'reconnecting'] as const) {
      const plan = planWalletReconnect({
        provider: { status },
        connectors,
        preferredConnectorId: 'injected',
      });
      expect(plan).toEqual({
        action: 'idle',
        reason: 'provider-connecting',
        clearPreference: false,
      });
    }
  });

  it('treats a trusted provider connection as authoritative (no reconnect)', () => {
    const plan = planWalletReconnect({
      provider: { status: 'connected', address: VALID, chainId: 10, connectorId: 'injected' },
      connectors,
      preferredConnectorId: 'walletconnect',
    });
    expect(plan).toEqual({
      action: 'idle',
      reason: 'provider-connected',
      clearPreference: false,
    });
  });

  it('fails closed and drops the preference when the provider reports a malformed account', () => {
    const plan = planWalletReconnect({
      provider: { status: 'connected', address: '0xdead', chainId: 10, connectorId: 'injected' },
      connectors,
      preferredConnectorId: 'injected',
    });
    expect(plan).toEqual({
      action: 'idle',
      reason: 'provider-invalid-account',
      clearPreference: true,
    });
  });

  it('keeps the preference when the provider is on an unsupported chain', () => {
    const plan = planWalletReconnect({
      provider: { status: 'connected', address: VALID, chainId: 1, connectorId: 'injected' },
      connectors,
      preferredConnectorId: 'injected',
    });
    expect(plan).toEqual({
      action: 'idle',
      reason: 'provider-unsupported-chain',
      clearPreference: false,
    });
  });

  it('does nothing without a stored preference', () => {
    const plan = planWalletReconnect({
      provider: { status: 'disconnected' },
      connectors,
      preferredConnectorId: null,
    });
    expect(plan).toEqual({ action: 'idle', reason: 'no-preference', clearPreference: false });
  });

  it('drops a preference whose connector no longer exists', () => {
    const plan = planWalletReconnect({
      provider: { status: 'disconnected' },
      connectors,
      preferredConnectorId: 'removed-connector',
    });
    expect(plan).toEqual({
      action: 'idle',
      reason: 'connector-unavailable',
      clearPreference: true,
    });
  });

  it('reconnects only through the persisted connector when disconnected', () => {
    const plan = planWalletReconnect({
      provider: { status: 'disconnected' },
      connectors,
      preferredConnectorId: 'walletconnect',
    });
    expect(plan).toEqual({
      action: 'connect',
      reason: 'preferred-connector',
      connectorId: 'walletconnect',
    });
  });

  it('is deterministic — identical inputs always yield identical plans', () => {
    const input = {
      provider: { status: 'disconnected' as const },
      connectors,
      preferredConnectorId: 'injected',
    };
    expect(planWalletReconnect(input)).toEqual(planWalletReconnect(input));
  });
});

describe('WALLET_CONNECTOR_PREF_KEY', () => {
  it('is the documented storage key (connector id only, no secret material)', () => {
    expect(WALLET_CONNECTOR_PREF_KEY).toBe('truthbounty:wallet:connector');
  });
});

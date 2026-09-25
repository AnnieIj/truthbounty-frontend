/**
 * V2-FE-045 — Deterministic wallet reconnection policy.
 *
 * Pure, framework-free decision layer used by the wallet lifecycle hook. It
 * encodes a single rule: wallet state is restored *only* from the active
 * provider. Persisted hints (the connector preference) are never treated as
 * authoritative, so a stale cached session cannot make the UI appear connected.
 *
 * Security invariants:
 *  - Fail closed on unsupported chain or malformed account.
 *  - Never fabricate an address, chain, or connection state.
 *  - No wallet SDKs, no network, no randomness — deterministic and unit-testable.
 */

import { isValidContractAddress } from '@/lib/contracts/address-guard';
import { OPTIMISM_CHAIN_IDS } from '@/lib/transaction-machine/transaction-machine.types';

/** Storage key for the connector preference. Value is a connector id only. */
export const WALLET_CONNECTOR_PREF_KEY = 'truthbounty:wallet:connector';

/** Chains the protocol accepts. */
export const SUPPORTED_WALLET_CHAIN_IDS: readonly number[] = OPTIMISM_CHAIN_IDS;

/**
 * Provider-observed connection status. `unknown` is used before the provider
 * has reported its state (SSR / first paint) so callers can avoid acting on
 * incomplete information.
 */
export type WalletProviderStatus =
  | 'unknown'
  | 'disconnected'
  | 'connecting'
  | 'reconnecting'
  | 'connected';

export interface WalletProviderSnapshot {
  readonly status: WalletProviderStatus;
  /** Account address as reported by the active provider, if any. */
  readonly address?: string | null;
  /** Chain id as reported by the active provider, if any. */
  readonly chainId?: number | null;
  /** Id of the connector the provider is currently bound to, if any. */
  readonly connectorId?: string | null;
}

export type WalletRestoreReason =
  | 'provider-connected'
  | 'provider-connecting'
  | 'provider-unsupported-chain'
  | 'provider-invalid-account'
  | 'no-preference'
  | 'preferred-connector'
  | 'connector-unavailable';

export type WalletReconnectPlan =
  | {
      readonly action: 'idle';
      readonly reason: WalletRestoreReason;
      /** True when the persisted preference is stale and must be dropped. */
      readonly clearPreference: boolean;
    }
  | {
      readonly action: 'connect';
      readonly reason: 'preferred-connector';
      readonly connectorId: string;
    };

export interface WalletReconnectInput {
  readonly provider: WalletProviderSnapshot;
  readonly connectors: readonly { readonly id: string }[];
  readonly preferredConnectorId: string | null | undefined;
  readonly supportedChainIds?: readonly number[];
}

/** Derive a provider status from the raw wagmi lifecycle flags. */
export function resolveProviderStatus(flags: {
  readonly isConnected?: boolean;
  readonly isConnecting?: boolean;
  readonly isReconnecting?: boolean;
}): WalletProviderStatus {
  if (flags.isConnecting) return 'connecting';
  if (flags.isReconnecting) return 'reconnecting';
  if (flags.isConnected) return 'connected';
  return 'disconnected';
}

/** True when the chain is one the protocol accepts. */
export function isSupportedWalletChain(
  chainId: number | null | undefined,
  supportedChainIds: readonly number[] = SUPPORTED_WALLET_CHAIN_IDS,
): boolean {
  return (
    typeof chainId === 'number' &&
    Number.isFinite(chainId) &&
    supportedChainIds.includes(chainId)
  );
}

/**
 * Validate an account address reported by an untrusted wallet. Reuses the
 * canonical EVM address guard (format, zero-address, placeholder rejection).
 */
export function isValidWalletAccount(address: unknown): address is `0x${string}` {
  return isValidContractAddress(address);
}

/**
 * True only when the provider positively confirms a usable connection:
 * connected, on a supported chain, with a canonical EVM account.
 */
export function isTrustedProviderConnection(
  provider: WalletProviderSnapshot,
  supportedChainIds: readonly number[] = SUPPORTED_WALLET_CHAIN_IDS,
): boolean {
  return (
    provider.status === 'connected' &&
    isValidWalletAccount(provider.address) &&
    isSupportedWalletChain(provider.chainId, supportedChainIds)
  );
}

/**
 * Decide — deterministically — whether to (re)connect from the persisted
 * preference. The active provider is always authoritative; the preference is
 * only a hint. A stale preference is reported for removal via
 * `clearPreference` rather than silently retained.
 */
export function planWalletReconnect(input: WalletReconnectInput): WalletReconnectPlan {
  const supported = input.supportedChainIds ?? SUPPORTED_WALLET_CHAIN_IDS;
  const { provider } = input;

  if (
    provider.status === 'unknown' ||
    provider.status === 'connecting' ||
    provider.status === 'reconnecting'
  ) {
    // The provider has not settled (or a connection is in flight); never race it.
    return { action: 'idle', reason: 'provider-connecting', clearPreference: false };
  }

  if (provider.status === 'connected') {
    if (!isValidWalletAccount(provider.address)) {
      // Provider claims connected but the account is malformed/untrusted.
      return { action: 'idle', reason: 'provider-invalid-account', clearPreference: true };
    }
    if (!isSupportedWalletChain(provider.chainId, supported)) {
      // Keep the preference: the wallet is valid, just on the wrong network.
      return { action: 'idle', reason: 'provider-unsupported-chain', clearPreference: false };
    }
    return { action: 'idle', reason: 'provider-connected', clearPreference: false };
  }

  const preferred = input.preferredConnectorId;
  if (!preferred) {
    return { action: 'idle', reason: 'no-preference', clearPreference: false };
  }

  const connector = input.connectors.find((candidate) => candidate.id === preferred);
  if (!connector) {
    // Preference points at a connector that no longer exists — stale session.
    return { action: 'idle', reason: 'connector-unavailable', clearPreference: true };
  }

  return { action: 'connect', reason: 'preferred-connector', connectorId: connector.id };
}

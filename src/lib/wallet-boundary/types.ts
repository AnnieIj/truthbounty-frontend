/**
 * V2-FE-091 — Canonical Wallet Provider Boundary
 * Core type definitions for the wallet-to-UI boundary state model.
 *
 * The boundary exposes a single discriminated union state. Consumers
 * downstream of this boundary can pattern-match on `status` to render the
 * correct accessible UI state without inspecting wallet internals.
 */

import type { Connector } from "wagmi";

/** Canonical phases a wallet can be in at the UI boundary. */
export type WalletBoundaryStatus =
  | "loading"
  | "disconnected"
  | "unsupported"
  | "config_error"
  | "account_error"
  | "ready";

/** Base fields shared by every boundary state. */
export interface WalletBoundaryBase {
  /** Discriminating status tag for the boundary. */
  readonly status: WalletBoundaryStatus;
  /** True when the boundary is actively resolving wallet/config state. */
  readonly isLoading: boolean;
  /** True when the wallet is on a supported Optimism/EVM network. */
  readonly isSupportedNetwork: boolean;
  /** True when a supported wallet is connected and the boundary is ready. */
  readonly isReady: boolean;
  /** True when protocol-mutating actions must be disabled. */
  readonly isProtocolDisabled: boolean;
}

/** Boundary is still resolving hydration / wallet state. */
export interface WalletBoundaryLoading extends WalletBoundaryBase {
  readonly status: "loading";
  readonly isLoading: true;
  readonly isSupportedNetwork: false;
  readonly isReady: false;
  readonly isProtocolDisabled: true;
  readonly address: undefined;
  readonly chainId: undefined;
  readonly connectorError: null;
  readonly configError: null;
}

/** No wallet is connected. */
export interface WalletBoundaryDisconnected extends WalletBoundaryBase {
  readonly status: "disconnected";
  readonly isLoading: false;
  readonly isSupportedNetwork: false;
  readonly isReady: false;
  readonly isProtocolDisabled: true;
  readonly address: undefined;
  readonly chainId: undefined;
  readonly connectorError: null;
  readonly configError: null;
}

/** Wallet is connected but the chain is not in the approved Optimism set. */
export interface WalletBoundaryUnsupported extends WalletBoundaryBase {
  readonly status: "unsupported";
  readonly isLoading: false;
  readonly isSupportedNetwork: false;
  readonly isReady: false;
  readonly isProtocolDisabled: true;
  readonly address: `0x${string}`;
  readonly chainId: number;
  readonly connectorError: Error | null;
  readonly configError: null;
}

/** Wallet provider configuration is missing or invalid. */
export interface WalletBoundaryConfigError extends WalletBoundaryBase {
  readonly status: "config_error";
  readonly isLoading: false;
  readonly isSupportedNetwork: false;
  readonly isReady: false;
  readonly isProtocolDisabled: true;
  readonly address: undefined;
  readonly chainId: undefined;
  readonly connectorError: null;
  readonly configError: Error;
}

/** Wallet reported an account/connection error (e.g. rejected signature). */
export interface WalletBoundaryAccountError extends WalletBoundaryBase {
  readonly status: "account_error";
  readonly isLoading: false;
  readonly isSupportedNetwork: boolean;
  readonly isReady: false;
  readonly isProtocolDisabled: true;
  readonly address: `0x${string}` | undefined;
  readonly chainId: number | undefined;
  readonly connectorError: Error;
  readonly configError: null;
}

/** Wallet is connected, on a supported chain, and configuration is valid. */
export interface WalletBoundaryReady extends WalletBoundaryBase {
  readonly status: "ready";
  readonly isLoading: false;
  readonly isSupportedNetwork: true;
  readonly isReady: true;
  readonly isProtocolDisabled: false;
  readonly address: `0x${string}`;
  readonly chainId: number;
  readonly connectorError: null;
  readonly configError: null;
}

/** Discriminated union of all wallet boundary states. */
export type WalletBoundaryState =
  | WalletBoundaryLoading
  | WalletBoundaryDisconnected
  | WalletBoundaryUnsupported
  | WalletBoundaryConfigError
  | WalletBoundaryAccountError
  | WalletBoundaryReady;

/** Actions exposed by the canonical wallet boundary. */
export interface WalletBoundaryActions {
  /** Initiate connection with the supplied connector. */
  readonly connect: (connector: Connector) => void;
  /** Reconnect using the previously persisted connector preference. */
  readonly reconnect: () => void;
  /** Disconnect the active wallet and clear the connector preference. */
  readonly disconnect: () => void;
  /** Clear any connector-level error. */
  readonly clearError: () => void;
  /** Request a switch to the preferred supported network. */
  readonly switchToSupportedNetwork: () => Promise<unknown>;
  /** Request the wallet add the preferred supported network. */
  readonly addSupportedNetwork: () => Promise<unknown>;
}

/** Complete return shape of `useCanonicalWallet`. */
export type CanonicalWallet = WalletBoundaryState & WalletBoundaryActions;

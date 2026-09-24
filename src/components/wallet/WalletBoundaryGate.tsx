"use client";

/**
 * V2-FE-091 — Canonical Wallet Provider Boundary Gate
 *
 * Renders the appropriate accessible UI for every wallet boundary state:
 *   loading | disconnected | config_error | unsupported | account_error | ready
 *
 * When `status === 'ready'` the children are rendered. All other states surface
 * clear, focusable, screen-reader-friendly explanations and recovery actions.
 */

import React, { ReactNode } from "react";
import { useCanonicalWallet } from "@/hooks/useCanonicalWallet";
import type {
  WalletBoundaryState,
  WalletBoundaryActions,
} from "@/lib/wallet-boundary/types";

export interface WalletBoundaryGateProps {
  /** Content rendered when the wallet boundary is ready. */
  readonly children: ReactNode;
  /** Optional custom rendering for the loading state. */
  readonly renderLoading?: () => ReactNode;
  /** Optional custom rendering for the disconnected state. */
  readonly renderDisconnected?: (
    actions: Pick<WalletBoundaryActions, "connect">,
  ) => ReactNode;
  /** Optional custom rendering for configuration errors. */
  readonly renderConfigError?: (
    state: Extract<WalletBoundaryState, { status: "config_error" }>,
  ) => ReactNode;
  /** Optional custom rendering for unsupported network state. */
  readonly renderUnsupported?: (
    state: Extract<WalletBoundaryState, { status: "unsupported" }>,
    actions: Pick<
      WalletBoundaryActions,
      "switchToSupportedNetwork" | "addSupportedNetwork" | "disconnect"
    >,
  ) => ReactNode;
  /** Optional custom rendering for account errors. */
  readonly renderAccountError?: (
    state: Extract<WalletBoundaryState, { status: "account_error" }>,
    actions: Pick<WalletBoundaryActions, "clearError" | "disconnect">,
  ) => ReactNode;
}

type DisconnectedStateProps = Pick<WalletBoundaryActions, "connect">;

function LoadingState() {
  return (
    <div
      className="rounded-md border border-border bg-muted/50 p-4 text-sm text-muted-foreground"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      Loading wallet state…
    </div>
  );
}

function DisconnectedState({ connect }: DisconnectedStateProps) {
  // Keep connect in scope so callers can wire their own connect modal via
  // renderDisconnected. The default state only explains what is needed.
  void connect;
  return (
    <div
      className="rounded-md border border-border bg-muted/50 p-4 text-sm"
      role="status"
      aria-live="polite"
    >
      <p className="text-foreground">Connect an EVM wallet to continue.</p>
      <p className="mt-1 text-muted-foreground">
        Use your app&apos;s connect button, or supply renderDisconnected to
        customize this state.
      </p>
    </div>
  );
}

function ConfigErrorState(
  state: Extract<WalletBoundaryState, { status: "config_error" }>,
) {
  return (
    <div
      className="rounded-md border border-destructive bg-destructive/10 p-4 text-sm text-destructive"
      role="alert"
      aria-live="assertive"
    >
      <p className="font-medium">Wallet provider configuration error</p>
      <p className="mt-1">{state.configError.message}</p>
      <p className="mt-3">
        Please check your environment variables and reload the page.
      </p>
    </div>
  );
}

type UnsupportedNetworkStateProps = Extract<
  WalletBoundaryState,
  { status: "unsupported" }
> &
  Pick<
    WalletBoundaryActions,
    "switchToSupportedNetwork" | "addSupportedNetwork" | "disconnect"
  >;

function UnsupportedNetworkState({
  chainId,
  switchToSupportedNetwork,
  addSupportedNetwork,
  disconnect,
}: UnsupportedNetworkStateProps) {
  return (
    <div
      className="rounded-md border border-warning bg-warning/10 p-4 text-sm"
      role="alert"
      aria-live="polite"
    >
      <p className="font-medium text-warning-foreground">Unsupported network</p>
      <p className="mt-1 text-warning-foreground/90">
        Your wallet is on chain {chainId}. Switch to Optimism or OP Sepolia to
        interact with TruthBounty.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          onClick={() => switchToSupportedNetwork().catch(() => {})}
        >
          Switch Network
        </button>
        <button
          type="button"
          className="inline-flex items-center rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          onClick={() => addSupportedNetwork().catch(() => {})}
        >
          Add Network
        </button>
        <button
          type="button"
          className="inline-flex items-center rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          onClick={disconnect}
        >
          Disconnect
        </button>
      </div>
    </div>
  );
}

type AccountErrorStateProps = Extract<
  WalletBoundaryState,
  { status: "account_error" }
> &
  Pick<WalletBoundaryActions, "clearError" | "disconnect">;

function AccountErrorState({
  connectorError,
  clearError,
  disconnect,
}: AccountErrorStateProps) {
  return (
    <div
      className="rounded-md border border-destructive bg-destructive/10 p-4 text-sm text-destructive"
      role="alert"
      aria-live="assertive"
    >
      <p className="font-medium">Wallet error</p>
      <p className="mt-1">
        {connectorError?.message ?? "An unexpected wallet error occurred."}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          onClick={clearError}
        >
          Dismiss
        </button>
        <button
          type="button"
          className="inline-flex items-center rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          onClick={disconnect}
        >
          Disconnect
        </button>
      </div>
    </div>
  );
}

export function WalletBoundaryGate(
  props: WalletBoundaryGateProps,
): React.ReactNode {
  const boundary = useCanonicalWallet();
  const {
    status,
    connect,
    disconnect,
    clearError,
    switchToSupportedNetwork,
    addSupportedNetwork,
  } = boundary;

  switch (status) {
    case "loading":
      return props.renderLoading?.() ?? <LoadingState />;
    case "disconnected":
      return (
        props.renderDisconnected?.({ connect }) ?? (
          <DisconnectedState connect={connect} />
        )
      );
    case "config_error":
      return (
        props.renderConfigError?.(boundary) ?? (
          <ConfigErrorState {...boundary} />
        )
      );
    case "unsupported":
      return (
        props.renderUnsupported?.(boundary, {
          switchToSupportedNetwork,
          addSupportedNetwork,
          disconnect,
        }) ?? (
          <UnsupportedNetworkState
            {...boundary}
            switchToSupportedNetwork={switchToSupportedNetwork}
            addSupportedNetwork={addSupportedNetwork}
            disconnect={disconnect}
          />
        )
      );
    case "account_error":
      return (
        props.renderAccountError?.(boundary, { clearError, disconnect }) ?? (
          <AccountErrorState
            {...boundary}
            clearError={clearError}
            disconnect={disconnect}
          />
        )
      );
    case "ready":
      return props.children;
    default: {
      const _exhaustive: never = status;
      return (
        <div
          role="alert"
          className="rounded-md border border-destructive bg-destructive/10 p-4 text-sm text-destructive"
        >
          Unknown wallet boundary state: {String(_exhaustive)}
        </div>
      );
    }
  }
}

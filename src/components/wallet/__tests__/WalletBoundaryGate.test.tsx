/**
 * V2-FE-091 — Accessibility and rendering tests for WalletBoundaryGate.
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import { WalletBoundaryGate } from "../WalletBoundaryGate";
import { deriveWalletBoundaryState } from "@/hooks/useCanonicalWallet";
import type { WalletBoundaryState } from "@/lib/wallet-boundary/types";

jest.mock("@/hooks/useCanonicalWallet", () => ({
  useCanonicalWallet: jest.fn(),
  deriveWalletBoundaryState: jest.requireActual("@/hooks/useCanonicalWallet")
    .deriveWalletBoundaryState,
}));

const { useCanonicalWallet } = jest.requireMock("@/hooks/useCanonicalWallet");

function createBoundaryState(
  state: Partial<WalletBoundaryState> & {
    status: WalletBoundaryState["status"];
  },
) {
  const base = {
    connect: jest.fn(),
    reconnect: jest.fn(),
    disconnect: jest.fn(),
    clearError: jest.fn(),
    switchToSupportedNetwork: jest.fn(),
    addSupportedNetwork: jest.fn(),
  };
  return { ...base, ...state } as unknown as ReturnType<
    typeof useCanonicalWallet
  >;
}

describe("WalletBoundaryGate accessibility", () => {
  it("announces the loading state", () => {
    useCanonicalWallet.mockReturnValue(
      createBoundaryState({ status: "loading" }),
    );
    render(
      <WalletBoundaryGate>
        <button type="button">Child</button>
      </WalletBoundaryGate>,
    );
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveAttribute("aria-busy", "true");
    expect(
      screen.queryByRole("button", { name: "Child" }),
    ).not.toBeInTheDocument();
  });

  it("announces a configuration error as assertive", () => {
    useCanonicalWallet.mockReturnValue(
      createBoundaryState({
        status: "config_error",
        configError: new Error("Missing WalletConnect project ID"),
      }),
    );
    render(
      <WalletBoundaryGate>
        <button type="button">Child</button>
      </WalletBoundaryGate>,
    );
    const alert = screen.getByRole("alert");
    expect(alert).toHaveAttribute("aria-live", "assertive");
    expect(alert.textContent).toContain("Missing WalletConnect project ID");
  });

  it("renders switch/disconnect actions for unsupported network", () => {
    useCanonicalWallet.mockReturnValue(
      createBoundaryState({
        status: "unsupported",
        chainId: 1,
      }),
    );
    render(
      <WalletBoundaryGate>
        <button type="button">Child</button>
      </WalletBoundaryGate>,
    );
    expect(
      screen.getByRole("button", { name: /switch network/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /add network/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /disconnect/i }),
    ).toBeInTheDocument();
  });

  it("renders dismiss/disconnect actions for account errors", () => {
    useCanonicalWallet.mockReturnValue(
      createBoundaryState({
        status: "account_error",
        connectorError: new Error("User rejected the request."),
      }),
    );
    render(
      <WalletBoundaryGate>
        <button type="button">Child</button>
      </WalletBoundaryGate>,
    );
    expect(
      screen.getByRole("button", { name: /dismiss/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /disconnect/i }),
    ).toBeInTheDocument();
  });

  it("renders children when the boundary is ready", () => {
    useCanonicalWallet.mockReturnValue(
      createBoundaryState({ status: "ready" }),
    );
    render(
      <WalletBoundaryGate>
        <button type="button">Child</button>
      </WalletBoundaryGate>,
    );
    expect(screen.getByRole("button", { name: "Child" })).toBeInTheDocument();
  });

  it("supports custom render props for every non-ready state", () => {
    useCanonicalWallet.mockReturnValue(
      createBoundaryState({ status: "disconnected" }),
    );
    render(
      <WalletBoundaryGate
        renderDisconnected={() => (
          <div data-testid="custom-disconnected">Custom disconnected</div>
        )}
      >
        <button type="button">Child</button>
      </WalletBoundaryGate>,
    );
    expect(screen.getByTestId("custom-disconnected")).toBeInTheDocument();
  });
});

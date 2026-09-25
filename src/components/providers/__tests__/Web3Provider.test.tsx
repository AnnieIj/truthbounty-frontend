/**
 * V2-FE-091 — Web3Provider configuration validation tests.
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import { Web3Provider } from "../Web3Provider";

jest.mock("@/lib/wallet-boundary/config-guard", () => ({
  validateWalletProviderConfig: jest.fn(),
}));

const { validateWalletProviderConfig } = jest.requireMock(
  "@/lib/wallet-boundary/config-guard",
);

describe("Web3Provider", () => {
  it("renders children when wallet provider configuration is valid", () => {
    validateWalletProviderConfig.mockReturnValue({ isValid: true, errors: [] });
    render(
      <Web3Provider>
        <button type="button">Child</button>
      </Web3Provider>,
    );
    expect(screen.getByRole("button", { name: "Child" })).toBeInTheDocument();
  });

  it("renders an accessible configuration error when validation fails", () => {
    validateWalletProviderConfig.mockReturnValue({
      isValid: false,
      errors: ["NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is required"],
    });
    render(
      <Web3Provider>
        <button type="button">Child</button>
      </Web3Provider>,
    );
    const alert = screen.getByRole("alert");
    expect(alert).toHaveAttribute("aria-live", "assertive");
    expect(alert.textContent).toContain(
      "NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is required",
    );
    expect(
      screen.queryByRole("button", { name: "Child" }),
    ).not.toBeInTheDocument();
  });
});

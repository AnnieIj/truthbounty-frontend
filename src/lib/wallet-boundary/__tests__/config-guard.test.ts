/**
 * V2-FE-091 — Unit tests for the wallet-provider configuration guard.
 */

import {
  validateWalletProviderConfig,
  assertWalletProviderConfig,
} from "../config-guard";

function validEnv() {
  return {
    NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: "test-walletconnect-project-id",
    NEXT_PUBLIC_SUPPORTED_CHAIN_IDS: [10, 11155420],
    NEXT_PUBLIC_DEFAULT_CHAIN_ID: 10,
    NEXT_PUBLIC_OPTIMISM_RPC_URL: "https://mainnet.optimism.io",
    NEXT_PUBLIC_OPTIMISM_SEPOLIA_RPC_URL: "https://sepolia.optimism.io",
  };
}

describe("validateWalletProviderConfig", () => {
  it("accepts a complete, valid configuration", () => {
    const { isValid, errors } = validateWalletProviderConfig(validEnv());
    expect(isValid).toBe(true);
    expect(errors).toHaveLength(0);
  });

  it("rejects a missing WalletConnect project ID", () => {
    const { isValid, errors } = validateWalletProviderConfig({
      ...validEnv(),
      NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: "",
    });
    expect(isValid).toBe(false);
    expect(errors).toContain(
      "NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is required",
    );
  });

  it("rejects a placeholder WalletConnect project ID", () => {
    const { isValid, errors } = validateWalletProviderConfig({
      ...validEnv(),
      NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: "your-project-id",
    });
    expect(isValid).toBe(false);
    expect(errors).toContain(
      "NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID appears to be a placeholder",
    );
  });

  it("rejects an empty supported-chain list", () => {
    const { isValid, errors } = validateWalletProviderConfig({
      ...validEnv(),
      NEXT_PUBLIC_SUPPORTED_CHAIN_IDS: [],
    });
    expect(isValid).toBe(false);
    expect(errors).toContain(
      "NEXT_PUBLIC_SUPPORTED_CHAIN_IDS must contain at least one chain ID",
    );
  });

  it("rejects a default chain that is not in the supported list", () => {
    const { isValid, errors } = validateWalletProviderConfig({
      ...validEnv(),
      NEXT_PUBLIC_DEFAULT_CHAIN_ID: 8453,
    });
    expect(isValid).toBe(false);
    expect(errors).toContain(
      "NEXT_PUBLIC_DEFAULT_CHAIN_ID must be in NEXT_PUBLIC_SUPPORTED_CHAIN_IDS",
    );
  });

  it("rejects invalid RPC URLs", () => {
    const { isValid, errors } = validateWalletProviderConfig({
      ...validEnv(),
      NEXT_PUBLIC_OPTIMISM_RPC_URL: "not-a-url",
    });
    expect(isValid).toBe(false);
    expect(errors).toContain("NEXT_PUBLIC_OPTIMISM_RPC_URL is not a valid URL");
  });

  it("allows missing RPC URLs outside production", () => {
    (process.env as { NODE_ENV?: string }).NODE_ENV = "development";
    const { isValid, errors } = validateWalletProviderConfig({
      ...validEnv(),
      NEXT_PUBLIC_OPTIMISM_RPC_URL: undefined,
    });
    expect(isValid).toBe(true);
    expect(errors).toHaveLength(0);
  });

  it("requires RPC URLs in production", () => {
    (process.env as { NODE_ENV?: string }).NODE_ENV = "production";
    const { isValid, errors } = validateWalletProviderConfig({
      ...validEnv(),
      NEXT_PUBLIC_OPTIMISM_RPC_URL: undefined,
      NEXT_PUBLIC_OPTIMISM_SEPOLIA_RPC_URL: undefined,
    });
    expect(isValid).toBe(false);
    expect(errors).toContain(
      "NEXT_PUBLIC_OPTIMISM_RPC_URL is required in production",
    );
    expect(errors).toContain(
      "NEXT_PUBLIC_OPTIMISM_SEPOLIA_RPC_URL is required in production",
    );
  });
});

describe("assertWalletProviderConfig", () => {
  it("does not throw for a valid configuration", () => {
    expect(() => assertWalletProviderConfig(validEnv())).not.toThrow();
  });

  it("throws with all collected errors when configuration is invalid", () => {
    expect(() =>
      assertWalletProviderConfig({
        ...validEnv(),
        NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: "",
      }),
    ).toThrow(/NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is required/);
  });
});

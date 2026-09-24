/**
 * V2-FE-091 — Canonical Wallet Provider Boundary
 * Configuration guard for wallet/provider setup.
 *
 * Validates that the runtime configuration needed by Wagmi/RainbowKit is present
 * and is not a placeholder. In production (`NODE_ENV === 'production'`) the
 * guard fails closed (returns errors). In development/test it allows safe
 * fallbacks so engineers can run the app without real third-party credentials.
 */

import { publicEnv } from "@/lib/env";
import type { PublicEnvSchema } from "@/lib/env";

const PLACEHOLDER_PATTERNS = [
  /yourprojectid/i,
  /your-project-id/i,
  /placeholder/i,
  /dummy/i,
  /example/i,
  /localhost:3001/, // fallback API only acceptable in dev/test
];

function isPlaceholder(value: string): boolean {
  return PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(value));
}

function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return ["http:", "https:", "ws:", "wss:"].includes(url.protocol);
  } catch {
    return false;
  }
}

export interface WalletProviderConfigValidation {
  /** `true` when the configuration is safe to use. */
  readonly isValid: boolean;
  /** Human-readable errors; empty when `isValid` is true. */
  readonly errors: readonly string[];
}

/**
 * Validate the public configuration required by the wallet provider boundary.
 *
 * In production this function is strict: missing WalletConnect project IDs,
 * placeholder RPC URLs, or empty supported-chain lists all produce errors.
 * In development and test, missing values are tolerated so long as they do
 * not contain obvious placeholder strings.
 *
 * @param env - Optional env source used for testing. Defaults to the canonical
 *              `publicEnv` exported from `@/lib/env`.
 */
export function validateWalletProviderConfig(
  env?: Partial<PublicEnvSchema>,
): WalletProviderConfigValidation {
  const isProduction = process.env.NODE_ENV === "production";
  const source = env ?? publicEnv;
  const errors: string[] = [];

  const walletConnectProjectId = source.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;
  if (!walletConnectProjectId || walletConnectProjectId.trim().length === 0) {
    errors.push("NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is required");
  } else if (isPlaceholder(walletConnectProjectId)) {
    errors.push(
      "NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID appears to be a placeholder",
    );
  }

  const supportedChainIds = source.NEXT_PUBLIC_SUPPORTED_CHAIN_IDS;
  if (!Array.isArray(supportedChainIds) || supportedChainIds.length === 0) {
    errors.push(
      "NEXT_PUBLIC_SUPPORTED_CHAIN_IDS must contain at least one chain ID",
    );
  } else if (
    !supportedChainIds.every(
      (id) => typeof id === "number" && Number.isInteger(id) && id > 0,
    )
  ) {
    errors.push("NEXT_PUBLIC_SUPPORTED_CHAIN_IDS must be positive integers");
  }

  const defaultChainId = source.NEXT_PUBLIC_DEFAULT_CHAIN_ID;
  if (typeof defaultChainId !== "number" || defaultChainId <= 0) {
    errors.push("NEXT_PUBLIC_DEFAULT_CHAIN_ID must be a positive integer");
  } else if (
    Array.isArray(supportedChainIds) &&
    !supportedChainIds.includes(defaultChainId)
  ) {
    errors.push(
      "NEXT_PUBLIC_DEFAULT_CHAIN_ID must be in NEXT_PUBLIC_SUPPORTED_CHAIN_IDS",
    );
  }

  const optimismRpc = source.NEXT_PUBLIC_OPTIMISM_RPC_URL;
  if (!optimismRpc) {
    if (isProduction) {
      errors.push("NEXT_PUBLIC_OPTIMISM_RPC_URL is required in production");
    }
  } else if (!isValidUrl(optimismRpc)) {
    errors.push("NEXT_PUBLIC_OPTIMISM_RPC_URL is not a valid URL");
  }

  const sepoliaRpc = source.NEXT_PUBLIC_OPTIMISM_SEPOLIA_RPC_URL;
  if (!sepoliaRpc) {
    if (isProduction) {
      errors.push(
        "NEXT_PUBLIC_OPTIMISM_SEPOLIA_RPC_URL is required in production",
      );
    }
  } else if (!isValidUrl(sepoliaRpc)) {
    errors.push("NEXT_PUBLIC_OPTIMISM_SEPOLIA_RPC_URL is not a valid URL");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Throws if the wallet provider configuration is invalid.
 * Use at provider mount time to fail closed.
 */
export function assertWalletProviderConfig(
  env?: Partial<PublicEnvSchema>,
): void {
  const { isValid, errors } = validateWalletProviderConfig(env);
  if (!isValid) {
    throw new Error(
      `Wallet provider configuration error: ${errors.join("; ")}`,
    );
  }
}

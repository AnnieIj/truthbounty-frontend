// src/components/providers/Web3Provider.tsx

"use client";

import React, { ReactNode } from "react";
import { WagmiProvider } from "wagmi";
import {
  RainbowKitProvider,
  darkTheme,
  lightTheme,
} from "@rainbow-me/rainbowkit";
import "@rainbow-me/rainbowkit/styles.css";
import { wagmiConfig } from "@/config/wagmi";
import { validateWalletProviderConfig } from "@/lib/wallet-boundary/config-guard";
import { useTheme } from "./ThemeProvider";

interface Web3ProviderProps {
  children: ReactNode;
}

/**
 * RainbowKit theme provider synced with TruthBounty ThemeContext
 */
export function RainbowKitThemedProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { resolvedTheme } = useTheme();

  const customDarkTheme = darkTheme({
    accentColor: "#5b5bf6",
    accentColorForeground: "#ffffff",
    borderRadius: "medium",
  });

  const customLightTheme = lightTheme({
    accentColor: "#5b5bf6",
    accentColorForeground: "#ffffff",
    borderRadius: "medium",
  });

  return (
    <RainbowKitProvider
      theme={resolvedTheme === "light" ? customLightTheme : customDarkTheme}
      modalSize="compact"
    >
      {children}
    </RainbowKitProvider>
  );
}

function ConfigErrorFallback({ errors }: { errors: readonly string[] }) {
  return (
    <div
      className="m-4 rounded-md border border-destructive bg-destructive/10 p-4 text-sm text-destructive"
      role="alert"
      aria-live="assertive"
    >
      <p className="font-medium">Wallet provider configuration error</p>
      <ul className="mt-2 list-inside list-disc">
        {errors.map((error) => (
          <li key={error}>{error}</li>
        ))}
      </ul>
      <p className="mt-3">
        Please check your environment variables and reload the page.
      </p>
    </div>
  );
}

/**
 * Canonical Web3 provider combining Wagmi configuration.
 *
 * Validates the wallet provider configuration before instantiating Wagmi so the
 * app fails closed when required environment variables are missing or
 * placeholder values are detected in production.
 */
export function Web3Provider({ children }: Web3ProviderProps) {
  const configValidation = validateWalletProviderConfig();

  if (!configValidation.isValid) {
    return <ConfigErrorFallback errors={configValidation.errors} />;
  }

  return <WagmiProvider config={wagmiConfig}>{children}</WagmiProvider>;
}

"use client"
import { useEffect, useState } from "react";
import { useAccount } from "@/hooks/useAccount";
import { useUserVerification } from "@/app/queries/user.queries";

/**
 * Represents a small set of trust data.  In production this should all
 * come from the backend; for now only `isVerified` is fetched from the
 * API (Worldcoin verification status) while the remaining fields use
 * randomized demo values.
 */
export interface TrustInfo {
  /** has the user completed an identity verification flow? */
  isVerified: boolean;
  /** 0..100 score reflecting past behaviour/reputation */
  reputation: number;
  /** age of the wallet in days (new wallets get extra scrutiny) */
  accountAgeDays: number;
  /** whether the user has been flagged by simple heuristics */
  suspicious: boolean;
}

/**
 * Utility to generate a pseudo-random TrustInfo based on an address string.
 * The values are stable across rerenders for the same address but not
 * cryptographically secure – just enough for demo purposes.
 */
function makeTrustFromAddress(addr: string): TrustInfo {
  // simple hash: sum of char codes
  let sum = 0;
  for (let i = 0; i < addr.length; i++) sum += addr.charCodeAt(i);
  const reputation = sum % 101; // 0..100
  const accountAgeDays = (sum % 30) + 1;
  const isVerified = sum % 2 === 0;
  const suspicious = sum % 10 < 2;
  return { isVerified, reputation, accountAgeDays, suspicious };
}

/**
 * Hook that returns trust information for the given address.  If the
 * address is omitted it falls back to the current user.
 */
function parseTrustInfoFromStorage(): Partial<TrustInfo> | null {
  try {
    const stored = localStorage.getItem("trustInfo");
    if (!stored) return null;

    const parsed = JSON.parse(stored);
    const overrides: Partial<TrustInfo> = {};

    if (typeof parsed.isVerified === "boolean") {
      overrides.isVerified = parsed.isVerified;
    }
    if (typeof parsed.reputation === "number") {
      overrides.reputation = parsed.reputation;
    }
    if (typeof parsed.accountAgeDays === "number") {
      overrides.accountAgeDays = parsed.accountAgeDays;
    }
    if (typeof parsed.suspicious === "boolean") {
      overrides.suspicious = parsed.suspicious;
    }

    return Object.keys(overrides).length > 0 ? overrides : null;
  } catch (error) {
    console.warn("Invalid localStorage.trustInfo", error);
    return null;
  }
}

export function useTrustForAddress(address?: string): TrustInfo {
  const account = useAccount();
  const effectiveAddress = address || account?.address || "";
  const { data: verification } = useUserVerification(effectiveAddress);

  const [storageUpdateTrigger, setStorageUpdateTrigger] = useState(0);

  useEffect(() => {
    const handleStorage = () => {
      setStorageUpdateTrigger((prev) => prev + 1);
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const base: Partial<TrustInfo> = {
    reputation: 0,
    accountAgeDays: 0,
    suspicious: false,
    isVerified: false,
  };

  if (address) {
    const derived = makeTrustFromAddress(address);
    Object.assign(base, {
      reputation: derived.reputation,
      accountAgeDays: derived.accountAgeDays,
      suspicious: derived.suspicious,
      isVerified: derived.isVerified,
    });
  }

  const trust = {
    ...base,
    isVerified: verification?.status === "SUCCESS",
  };

  const overrideInfo =
    !address && typeof window !== "undefined"
      ? parseTrustInfoFromStorage()
      : null;
  void storageUpdateTrigger;

  return overrideInfo ? { ...trust, ...overrideInfo } : trust;
}

/**
 * Hook that returns the current user's trust information.
 *
 * The current user can be simulated using `localStorage.trustInfo`.
 * If the value is valid JSON, it overrides the demo trust values.
 */
export function useTrust(): TrustInfo {
  return useTrustForAddress(undefined);
}

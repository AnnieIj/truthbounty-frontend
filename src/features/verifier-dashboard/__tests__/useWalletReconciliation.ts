"use client";
import { useEffect, useRef } from "react";
import { useAccount, useChainId } from "wagmi";

/** Calls onInvalidate whenever the connected account or chain changes. */
export function useWalletReconciliation(onInvalidate: () => void) {
  const { address } = useAccount();
  const chainId = useChainId();
  const prev = useRef({ address, chainId });

  useEffect(() => {
    if (prev.current.address !== address || prev.current.chainId !== chainId) {
      prev.current = { address, chainId };
      onInvalidate();
    }
  }, [address, chainId, onInvalidate]);
}
"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { createPublicClient, formatUnits, http } from "viem";
import { optimismSepolia } from "viem/chains";
import {
  getContractAbi,
  getContractAddress,
  getReleaseChainId,
} from "@/lib/contracts/registry";
import { getTransactionExplorerUrl } from "@/lib/explorer";
import { useWriteReadiness } from "@/hooks/useWriteReadiness";

const publicClient = createPublicClient({
  chain: optimismSepolia,
  transport: http(),
});

export default function RewardsPage() {
  const { address } = useAccount();
  const contractAddress = getContractAddress("TruthBountyWeighted");
  const contractAbi = getContractAbi("TruthBountyWeighted");
  const chainId = getReleaseChainId();

  // V2-FE-100: fail-closed readiness for claim writes
  const readiness = useWriteReadiness({
    targetAddress: contractAddress,
    requireCanonicalMatch: true,
  });

  const [balance, setBalance] = useState<string>("0");
  const [rewards, setRewards] = useState<Array<{ amount?: number | string; id?: string; reason?: string }>>([]);
  const [loading, setLoading] = useState(false);

  const { data: hash, writeContract, isPending } = useWriteContract();
  const { isSuccess } = useWaitForTransactionReceipt({ hash });

  const claimableAmount = useMemo(
    () => rewards.reduce((sum, reward) => sum + Number(reward?.amount ?? 0), 0),
    [rewards],
  );

  const canClaim = Boolean(
    address && !isPending && !loading && claimableAmount > 0 && readiness.isReady,
  );

  const fetchBalance = useCallback(async () => {
    if (!address) return;

    try {
      const result = await publicClient.readContract({
        address: contractAddress,
        abi: contractAbi,
        functionName: "balanceOf",
        args: [address],
      });

      setBalance(formatUnits(result as bigint, 18));
    } catch (err) {
      console.error("Balance fetch error:", err);
    }
  }, [address, contractAddress, contractAbi]);

  const fetchRewards = useCallback(async () => {
    if (!address) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/rewards?user=${address}`);
      const data = await res.json();
      setRewards(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Rewards fetch error:", err);
      setRewards([]);
    } finally {
      setLoading(false);
    }
  }, [address]);

  const handleClaim = async () => {
    if (!canClaim) return;

    try {
      writeContract({
        address: contractAddress,
        abi: contractAbi,
        functionName: "claimRewards",
        chainId,
      });
    } catch (err) {
      console.error("Claim error:", err);
    }
  };

  useEffect(() => {
    if (isSuccess) {
      void fetchBalance();
      void fetchRewards();
    }
  }, [isSuccess, fetchBalance, fetchRewards]);

  useEffect(() => {
    void fetchBalance();
    void fetchRewards();
  }, [address, fetchBalance, fetchRewards]);

  return (
    <div style={{ padding: 20 }}>
      <h1>Rewards Dashboard</h1>

      <p>
        <strong>Wallet:</strong> {address || "Not connected"}
      </p>
      <p>
        <strong>Balance:</strong> {balance}
      </p>

      {address && !readiness.isReady && readiness.message && (
        <p data-testid="write-readiness-reason" role="status">
          {readiness.message}
        </p>
      )}

      <button
        onClick={handleClaim}
        disabled={!canClaim}
        aria-label={
          isPending
            ? "Claiming rewards"
            : !readiness.isReady
              ? readiness.message || "Claim unavailable"
              : "Claim Rewards"
        }
        aria-describedby={
          address && !readiness.isReady ? "write-readiness-reason" : undefined
        }
      >
        {isPending ? "Claiming..." : "Claim Rewards"}
      </button>

      {hash && (
        <p>
          Tx Hash:{" "}
          <a href={getTransactionExplorerUrl(hash, chainId)} target="_blank" rel="noreferrer">
            View on Explorer
          </a>
        </p>
      )}

      <h2>Claimable Rewards</h2>

      {loading ? (
        <p>Loading...</p>
      ) : rewards.length === 0 ? (
        <p>No rewards available</p>
      ) : (
        <ul>
          {rewards.map((r, i) => (
            <li key={i}>
              {r.amount} tokens - {r.reason}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

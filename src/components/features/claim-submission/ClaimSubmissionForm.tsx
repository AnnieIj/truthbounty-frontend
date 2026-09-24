"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { useConnect } from "wagmi";
import { useTrust } from "@/components/hooks/useTrust";
import TrustScoreTooltip from "@/components/ui/TrustScoreTooltip";
import { useSubmitClaim } from "@/app/queries/claims.queries";
import { useWriteContract, useReadContract, usePublicClient, useChainId } from "wagmi";
import { keccak256, stringToHex, parseAbi } from "viem";
import { useTranslations } from '@/i18n';
import { useAccount } from "@/hooks/useAccount";

const claimAbi = parseAbi([
  "function createClaim(bytes32 contentDigest, address bountyAsset, uint256 amount, bytes32 configHash) returns (uint256 claimId)",
]);
const erc20Abi = parseAbi([
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
]);

function getClaimConfig() {
  const address = process.env.NEXT_PUBLIC_BOUNTY_CLAIM_ADDRESS;
  const asset = process.env.NEXT_PUBLIC_BOUNTY_ASSET;
  const amount = process.env.NEXT_PUBLIC_CLAIM_AMOUNT;
  const configHash = process.env.NEXT_PUBLIC_CLAIM_CONFIG_HASH;
  const chainId = process.env.NEXT_PUBLIC_EXPECTED_CHAIN_ID;
  if (!address || !asset || !amount || !configHash || !chainId) {
    return null;
  }
  return {
    address: address as `0x${string}`,
    asset: asset as `0x${string}`,
    amount: BigInt(amount),
    configHash: configHash as `0x${string}`,
    chainId: Number(chainId),
  };
}

function useCreateClaimTransaction() {
  const t = useTranslations('claim');
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [transactionHash, setTransactionHash] = useState<`0x${string}` | null>(null);
  const account = useAccount();
  const address = account?.address;
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const config = getClaimConfig();
  const contractAddress = config?.address;
  const asset = config?.asset;
  const amount = config?.amount ?? 0n;
  const configHash = config?.configHash;
  const expectedChainId = config?.chainId;

  const { data: allowance = 0n } = useReadContract({
    address: asset,
    abi: erc20Abi,
    functionName: "allowance",
    args: address && contractAddress ? [address, contractAddress] : undefined,
    query: {
      enabled: !!address && !!contractAddress && !!asset,
    },
  });

  const { writeContractAsync: writeAllowanceAsync } = useWriteContract();
  const { writeContractAsync: writeClaimAsync } = useWriteContract();

  const submitClaim = async (contentDigest: `0x${string}`) => {
    if (!address) {
      throw new Error(t('errors.WALLET_NOT_CONNECTED'));
    }
    if (!config || !contractAddress || !asset || !configHash) {
      throw new Error(t('errors.configIncomplete'));
    }
    const targetContract = contractAddress;
    const targetAsset = asset;
    const targetConfigHash = configHash;

    if (chainId !== expectedChainId) {
      throw new Error(t('errors.networkMismatch', { connected: chainId, expected: expectedChainId }));
    }
    if (!publicClient) {
      throw new Error(t('errors.unexpectedError'));
    }

    setIsPending(true);
    setError(null);

    try {
      if (amount > 0n && allowance < amount) {
        const approvalHash = await writeAllowanceAsync({
          address: targetAsset,
          abi: erc20Abi,
          functionName: "approve",
          args: [targetContract, amount],
        });
        await publicClient.waitForTransactionReceipt({ hash: approvalHash });
      }

      const { request } = await publicClient.simulateContract({
        address: targetContract,
        abi: claimAbi,
        functionName: "createClaim",
        args: [contentDigest, targetAsset, amount, targetConfigHash],
        account: address,
      });

      const hash = await writeClaimAsync(request);
      setTransactionHash(hash);
      await publicClient.waitForTransactionReceipt({ hash });
    } catch (err) {
      const message = err instanceof Error ? err.message : t('errors.unexpectedError');
      setError(message);
      throw err;
    } finally {
      setIsPending(false);
    }
  };

  return { submitClaim, isPending, error, transactionHash };
}
import { useAccount } from "@/hooks/useAccount";

export interface ClaimFormData {
  title: string;
  category: string;
  impact: string;
  source: string;
  description: string;
}

interface FormErrors {
  title?: string;
  category?: string;
  impact?: string;
  source?: string;
  description?: string;
}

interface ClaimFormProps {
  onSubmit?: (data: ClaimFormData) => void;
  onClose: () => void;
}

type StringFormField = "title" | "category" | "impact" | "source";

const ClaimSubmissionForm: React.FC<ClaimFormProps> = ({ onSubmit, onClose }) => {
  const t = useTranslations('claim');
  const tWallet = useTranslations('wallet');
  const tCommon = useTranslations('common');
  
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [impact, setImpact] = useState("");
  const [source, setSource] = useState("");
  const [description, setDescription] = useState("");

  const [errors, setErrors] = useState<FormErrors>({});
  const [touched, setTouched] = useState<{ [key: string]: boolean }>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  const trust = useTrust();
  const account = useAccount();
  const { connect, connectors } = useConnect();
  const isWalletConnected = !!account?.address;

  const { mutateAsync, isPending: isSubmittingApi } = useSubmitClaim?.() ?? { mutateAsync: undefined, isPending: false };
  const { submitClaim, isPending: isSubmittingTx } = useCreateClaimTransaction();
  const isPending = isSubmittingApi || isSubmittingTx;


  const lowReputation = trust.reputation < 20;
  const newWallet = trust.accountAgeDays < 7;
  const lowTrust =
    !trust.isVerified || lowReputation || newWallet || trust.suspicious;

  const modalRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    previousActiveElement.current = document.activeElement as HTMLElement;
    firstInputRef.current?.focus();
    return () => {
      previousActiveElement.current?.focus();
    };
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  }, [onClose]);

  const handleFocusTrap = useCallback((e: React.KeyboardEvent) => {
    if (e.key !== "Tab") return;

    const focusableElements = modalRef.current?.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (!focusableElements || focusableElements.length === 0) return;

    const firstElement = focusableElements[0] as HTMLElement;
    const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

    if (e.shiftKey) {
      if (document.activeElement === firstElement) {
        e.preventDefault();
        lastElement.focus();
      }
    } else {
      if (document.activeElement === lastElement) {
        e.preventDefault();
        firstElement.focus();
      }
    }
  }, []);

  const validateField = (name: string, value: string): string | undefined => {
    switch (name) {
      case "title":
        if (!value.trim()) return t('validation.titleRequired');
        if (value.length < 5) return t('validation.titleMinLength', { min: 5 });
        break;
      case "category":
        if (!value.trim()) return t('validation.categoryRequired');
        break;
      case "impact":
        if (!value.trim()) return t('validation.impactRequired');
        break;
      case "source":
        if (!value.trim()) return t('validation.sourceRequired');
        try {
          new URL(value);
        } catch {
          return t('validation.sourceInvalidUrl');
        }
        break;
      case "description":
        if (!value.trim()) return t('validation.descriptionRequired');
        if (value.length < 10) return t('validation.descriptionMinLength', { min: 10 });
        break;
    }
    return undefined;
  };

  const validate = (): boolean => {
    const newErrors: FormErrors = {};
    const fields = { title, category, impact, source, description };

    Object.entries(fields).forEach(([name, value]) => {
      const error = validateField(name, value);
      if (error) newErrors[name as keyof FormErrors] = error;
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    setTouched({
      title: true,
      category: true,
      impact: true,
      source: true,
      description: true,
    });

    if (!isWalletConnected) {
      setSubmitError(tWallet('connectPrompt'));
      return;
    }

    if (!validate()) return;

    try {
      if (process.env.NEXT_PUBLIC_BOUNTY_CLAIM_ADDRESS) {
        const contentDigest = keccak256(
          stringToHex(`${title}|${category}|${impact}|${source}|${description}`)
        );
        await submitClaim(contentDigest);
      }

      if (mutateAsync) {
        await mutateAsync({
          title,
          category,
          impact,
          source,
          description,
        });
      }

      onSubmit?.({ title, category, impact, source, description });

      onClose();
    } catch (err: unknown) {
      console.error("Claim submission failed:", err);
      setSubmitError(
        err instanceof Error
          ? err.message
          : t('errors.submissionFailed')
      );
    }
  };

  const handleFieldChange = (name: string, value: string) => {
    const setters = {
      title: setTitle,
      category: setCategory,
      impact: setImpact,
      source: setSource,
      description: setDescription,
    };

    setters[name as keyof typeof setters]?.(value);

    if (touched[name]) {
      const error = validateField(name, value);
      setErrors((prev) => ({ ...prev, [name]: error }));
    }
  };

  const handleBlur = (name: string, value: string) => {
    setTouched((prev) => ({ ...prev, [name]: true }));
    const error = validateField(name, value);
    setErrors((prev) => ({ ...prev, [name]: error }));
  };

  const handleConnectWallet = async () => {
    try {
      // Use the first available EVM connector (injected / WalletConnect / etc.).
      const connector = connectors[0];
      if (!connector) {
        setSubmitError(tWallet('noConnector'));
        return;
      }
      connect({ connector });
    } catch (err) {
      console.error("Failed to open wallet connector:", err);
      setSubmitError(tWallet('connectFailed'));
    }
  };

  const capitalize = (str: string) =>
    str.charAt(0).toUpperCase() + str.slice(1);

  const statusMessage = isPending
    ? t('submittingClaim')
    : submitError
      ? submitError
      : "";

  const formValues: Record<StringFormField, string> = {
    title,
    category,
    impact,
    source,
  };

  return (
    <div
      ref={modalRef}
      className="fixed inset-0 z-50 modal-shell bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-labelledby="claim-submission-title"
      data-testid="claim-submission-modal"
      onKeyDown={handleFocusTrap}
    >
      <form
        className="modal-panel bg-[#18181b] border border-[#232329] flex flex-col gap-4"
        onSubmit={handleSubmit}
        onKeyDown={handleKeyDown}
      >
        <h2 id="claim-submission-title" className="text-xl font-bold text-white">{t('submitClaim')}</h2>

        <div
          aria-live="polite"
          aria-atomic="true"
          className="sr-only"
        >
          {statusMessage}
        </div>

        {!isWalletConnected && (
          <div
            data-testid="connect-wallet-banner"
            role="alert"
            className="flex flex-col gap-2 bg-[#2a1d05] border border-yellow-600/50 text-yellow-200 px-3 py-3 rounded-lg text-sm"
          >
            <p className="font-medium">
              {tWallet('connectPrompt')}
            </p>
            <button
              type="button"
              data-testid="connect-wallet-button"
              onClick={handleConnectWallet}
              className="self-start bg-yellow-500 hover:bg-yellow-400 text-black px-3 py-2 rounded-md font-semibold"
            >
              {tWallet('connect')}
            </button>
          </div>
        )}

        {lowTrust && (
          <div className="bg-yellow-500 text-black px-2 py-2 rounded text-sm">
            {t('trust.lowTrustWarning')} <TrustScoreTooltip />
          </div>
        )}

        {submitError && (
          <p className="text-red-500 text-sm break-words" role="alert">
            {submitError}
          </p>
        )}

        {(["title", "category", "impact", "source"] as StringFormField[]).map((field, index) => (
          <div key={field}>
            <input
              ref={index === 0 ? firstInputRef : undefined}
              id={`claim-${field}`}
              name={field}
              type="text"
              className={`input ${errors[field] ? "border-red-500" : ""}`}
              placeholder={field === "source" ? "https://example.com" : capitalize(field)}
              aria-label={capitalize(field)}
              value={formValues[field]}
              onChange={(e) =>
                handleFieldChange(field, e.target.value)
              }
              onBlur={() =>
                handleBlur(field, formValues[field])
              }
            />
            {errors[field] && touched[field] && (
              <p className="text-red-500 text-sm break-words" role="alert">{errors[field]}</p>
            )}
          </div>
        ))}

        <textarea
          id="claim-description"
          name="description"
          className={`input ${errors.description ? "border-red-500" : ""}`}
          placeholder="Description"
          aria-label="Description"
          value={description}
          onChange={(e) =>
            handleFieldChange("description", e.target.value)
          }
          onBlur={() => handleBlur("description", description)}
        />
        {errors.description && touched.description && (
          <p className="text-red-500 text-sm break-words" role="alert">{errors.description}</p>
        )}

        <div className="flex gap-2 justify-end">
          <button
            type="button"
            className="btn btn-secondary flex-1"
            onClick={onClose}
            disabled={isPending}
            aria-label={tCommon('cancel')}
          >
            {tCommon('cancel')}
          </button>
          <button
            type="submit"
            data-testid="submit-claim-button"
            className="btn btn-primary flex-1 disabled:opacity-50"
            disabled={isPending || !isWalletConnected}
            aria-label={isPending ? t('submittingClaim') : !isWalletConnected ? tWallet('connectToSubmit') : t('submitClaim')}
          >
            {isPending
              ? t('submittingClaim')
              : !isWalletConnected
                ? tWallet('connectToSubmit')
                : t('submitClaim')}
          </button>
        </div>
      </form>
    </div>
  );
};

export default ClaimSubmissionForm;

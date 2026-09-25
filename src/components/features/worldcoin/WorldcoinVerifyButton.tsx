'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Shield, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import type { WorldcoinVerificationStatus, IDKitResponse } from '@/app/types/worldcoin';
// import { IDKit, VerificationLevel } from '@worldcoin/idkit';
import {
  IDKitRequestWidget,
  orbLegacy,
  type IDKitResult,
  type RpContext,
} from '@worldcoin/idkit';
import { getWorldcoinConfig, isWorldcoinConfigured } from '@/config/worldcoin-client';

interface WorldcoinVerifyButtonProps {
  walletAddress?: string;
  onVerificationStart?: () => void;
  onVerificationComplete?: (success: boolean) => void;
  onIDKitProof?: (proof: IDKitResponse) => Promise<void>;
  disabled?: boolean;
  className?: string;
  useMockMode?: boolean;
}

function mapIDKitResultToResponse(result: IDKitResult): IDKitResponse | null {
  if (result.protocol_version === '3.0') {
    const response = result.responses[0];
    if (!response) return null;

    return {
      proof: response.proof,
      merkle_root: response.merkle_root,
      nullifier_hash: response.nullifier,
      verification_level: 'orb',
      credential_uuids: [],
    };
  }

  if (result.protocol_version === '4.0' && 'action' in result) {
    const response = result.responses[0];
    if (!response || !('proof' in response)) return null;

    const proofPayload = Array.isArray(response.proof) ? response.proof[0] : response.proof;
    const merkleRoot = Array.isArray(response.proof) ? response.proof[4] : '';

    return {
      proof: proofPayload ?? '',
      merkle_root: merkleRoot ?? '',
      nullifier_hash: response.nullifier,
      verification_level: 'orb',
      credential_uuids: [],
    };
  }

  return null;
}

function WorldcoinIDKitFlow({
  walletAddress,
  rpContext,
  onVerificationStart,
  onVerificationComplete,
  onIDKitProof,
  disabled,
  className,
  status,
  setStatus,
}: {
  walletAddress: string;
  rpContext: RpContext;
  onVerificationStart?: () => void;
  onVerificationComplete?: (success: boolean) => void;
  onIDKitProof?: (proof: IDKitResponse) => Promise<void>;
  disabled?: boolean;
  className?: string;
  status: WorldcoinVerificationStatus;
  setStatus: (status: WorldcoinVerificationStatus) => void;
}) {
  const [open, setOpen] = useState(false);
  const config = getWorldcoinConfig();

  const handleIDKitSuccess = useCallback(
    async (result: IDKitResult) => {
      try {
        const proof = mapIDKitResultToResponse(result);
        if (!proof) {
          throw new Error('Unsupported IDKit response format');
        }

        if (onIDKitProof) {
          await onIDKitProof(proof);
        }

        setStatus('SUCCESS');
        onVerificationComplete?.(true);
      } catch (error) {
        console.error('Failed to submit IDKit proof:', error);
        setStatus('FAILED');
        onVerificationComplete?.(false);
      }
    },
    [onIDKitProof, onVerificationComplete, setStatus],
  );

  const handleIDKitError = useCallback(() => {
    console.error('IDKit verification failed');
    setStatus('FAILED');
    onVerificationComplete?.(false);
  }, [onVerificationComplete, setStatus]);

  const getButtonContent = () => {
    switch (status) {
      case 'IN_PROGRESS':
        return (
          <>
            <Loader2 className="animate-spin" />
            Verifying...
          </>
        );
      case 'SUCCESS':
        return (
          <>
            <CheckCircle2 />
            Verified
          </>
        );
      case 'FAILED':
        return (
          <>
            <AlertCircle />
            Retry Verification
          </>
        );
      default:
        return (
          <>
            <Shield />
            Verify with Worldcoin
          </>
        );
    }
  };

  return (
    <>
      <Button
        onClick={() => {
          setStatus('IN_PROGRESS');
          onVerificationStart?.();
          setOpen(true);
        }}
        disabled={disabled || status === 'IN_PROGRESS' || status === 'SUCCESS'}
        variant={status === 'SUCCESS' ? 'outline' : 'default'}
        className={className}
      >
        {getButtonContent()}
      </Button>
      <IDKitRequestWidget
        open={open}
        onOpenChange={setOpen}
        app_id={config.appId as `app_${string}`}
        action={config.action}
        rp_context={rpContext}
        allow_legacy_proofs
        preset={orbLegacy({ signal: walletAddress })}
        onSuccess={handleIDKitSuccess}
        onError={handleIDKitError}
      />
    </>
  );
}

export function WorldcoinVerifyButton({
  walletAddress,
  onVerificationStart,
  onVerificationComplete,
  onIDKitProof,
  disabled,
  className,
  useMockMode = false,
}: WorldcoinVerifyButtonProps) {
  const [status, setStatus] = useState<WorldcoinVerificationStatus>('NOT_STARTED');
  const [isIDKitConfigured, setIsIDKitConfigured] = useState(false);
  const [rpContext, setRpContext] = useState<RpContext | null>(null);
  const [rpContextError, setRpContextError] = useState<string | null>(null);

  useEffect(() => {
    setIsIDKitConfigured(isWorldcoinConfigured());
  }, []);

  useEffect(() => {
    if (useMockMode || !isWorldcoinConfigured() || !walletAddress) {
      return;
    }

    let cancelled = false;

    async function loadRpContext() {
      try {
        const response = await fetch('/api/identity/worldcoin/rp-context', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ walletAddress }),
        });

        if (!response.ok) {
          throw new Error('Failed to load Worldcoin RP context');
        }

        const payload = (await response.json()) as RpContext;
        if (!cancelled) {
          setRpContext(payload);
          setRpContextError(null);
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to fetch Worldcoin RP context:', error);
          setRpContext(null);
          setRpContextError('Worldcoin verification is temporarily unavailable');
        }
      }
    }

    void loadRpContext();

    return () => {
      cancelled = true;
    };
  }, [useMockMode, walletAddress]);

  const handleVerify = async () => {
    if (!walletAddress) {
      alert('Please connect your wallet first');
      return;
    }

    if (!onIDKitProof) {
      setStatus('FAILED');
      onVerificationComplete?.(false);
      return;
    }

    setStatus('IN_PROGRESS');
    onVerificationStart?.();

    try {
      await onIDKitProof({
        merkle_root: '',
        nullifier_hash: '',
        proof: '',
        verification_level: 'orb',
        credential_uuids: [],
      });
      setStatus('SUCCESS');
      onVerificationComplete?.(true);
    } catch (error) {
      console.error('Verification failed:', error);
      setStatus('FAILED');
      onVerificationComplete?.(false);
    }
  };

  const getButtonContent = () => {
    switch (status) {
      case 'IN_PROGRESS':
        return (
          <>
            <Loader2 className="animate-spin" />
            Verifying...
          </>
        );
      case 'SUCCESS':
        return (
          <>
            <CheckCircle2 />
            Verified
          </>
        );
      case 'FAILED':
        return (
          <>
            <AlertCircle />
            Retry Verification
          </>
        );
      default:
        return (
          <>
            <Shield />
            {useMockMode ? 'Mock Verify' : 'Verify with Worldcoin'}
          </>
        );
    }
  };

  if (!useMockMode && !isIDKitConfigured) {
    return (
      <Button
        disabled
        variant="outline"
        className={className}
        title="Worldcoin verification is not configured"
      >
        <Shield />
        Verify with Worldcoin (Unavailable)
      </Button>
    );
  }

  // Use mock verification for now (IDKit widget API compatibility issue)
  // TODO: Update to use IDKit v4.1.2 API when available
  if (!useMockMode && isIDKitConfigured && walletAddress) {
    if (rpContextError) {
      return (
        <Button disabled variant="outline" className={className} title={rpContextError}>
          <Shield />
          Verify with Worldcoin (Unavailable)
        </Button>
      );
    }

    if (!rpContext) {
      return (
        <Button disabled variant="outline" className={className}>
          <Loader2 className="animate-spin" />
          Preparing verification...
        </Button>
      );
    }

    return (
      <WorldcoinIDKitFlow
        walletAddress={walletAddress}
        rpContext={rpContext}
        onVerificationStart={onVerificationStart}
        onVerificationComplete={onVerificationComplete}
        onIDKitProof={onIDKitProof}
        disabled={disabled}
        className={className}
        status={status}
        setStatus={setStatus}
      />
    );
  }

  return (
    <Button
      onClick={handleVerify}
      disabled={disabled || status === 'IN_PROGRESS' || status === 'SUCCESS'}
      variant={status === 'SUCCESS' ? 'outline' : 'default'}
      className={className}
    >
      {getButtonContent()}
    </Button>
  );
}

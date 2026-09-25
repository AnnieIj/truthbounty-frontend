'use client';

import React from 'react';
import { useSiweAuth } from '@/hooks/useSiweAuth';
import { useAccount } from '@/hooks/useAccount';
import { Button } from '@/components/ui/button';
import { AlertCircle, CheckCircle2, Loader2, LogOut, Wallet } from 'lucide-react';

/**
 * SafeSiweAuth provides a secure, user-facing client interface for the Sign-In with Ethereum (SIWE) flow.
 * It manages the UI state model for authentication including connected, disconnected, loading, 
 * ready-to-sign, signing, and verified states.
 * 
 * Security and UX guarantees:
 * - Deterministic, recoverable failure states for user rejections and network errors.
 * - Accessible loading and error announcements (aria-live, role="alert").
 * - Does not invent success states; relies on canonical hook validation.
 */
export function SafeSiweAuth() {
  const account = useAccount();
  const {
    status,
    error,
    isAuthenticated,
    isBusy,
    begin,
    signAndSubmit,
    clear,
    resetError,
    address,
    displayMessage,
    session,
  } = useSiweAuth();

  // 1. Wallet is disconnected
  if (!account || account.isDisconnected) {
    return (
      <div className="flex flex-col items-center justify-center p-6 border rounded-xl bg-card text-card-foreground shadow-sm max-w-md w-full mx-auto space-y-4">
        <div className="p-3 bg-muted rounded-full">
          <Wallet className="w-6 h-6 text-muted-foreground" />
        </div>
        <div className="text-center space-y-1">
          <h3 className="font-semibold tracking-tight">Wallet Disconnected</h3>
          <p className="text-sm text-muted-foreground">
            Connect your wallet to sign in.
          </p>
        </div>
        {session && (
          <Button variant="outline" onClick={clear} className="w-full gap-2 mt-4" aria-label="Sign out">
            <LogOut className="w-4 h-4" />
            Sign Out
          </Button>
        )}
      </div>
    );
  }

  // 2. Authenticated State
  if (isAuthenticated) {
    return (
      <div className="flex flex-col items-center p-6 border rounded-xl bg-card text-card-foreground shadow-sm max-w-md w-full mx-auto space-y-4">
        <div className="p-3 bg-green-500/10 rounded-full">
          <CheckCircle2 className="w-6 h-6 text-green-500" />
        </div>
        <div className="text-center space-y-1">
          <h3 className="font-semibold tracking-tight">Securely Signed In</h3>
          <p className="text-sm text-muted-foreground font-mono bg-muted px-2 py-1 rounded-md break-all">
            {address}
          </p>
        </div>
        <Button variant="outline" onClick={clear} className="w-full gap-2 mt-4" aria-label="Sign out">
          <LogOut className="w-4 h-4" />
          Sign Out
        </Button>
      </div>
    );
  }

  // 3. Error State
  if (status === 'error' && error) {
    return (
      <div className="flex flex-col items-start p-6 border border-destructive/20 rounded-xl bg-destructive/10 text-destructive max-w-md w-full mx-auto space-y-4" role="alert">
        <div className="flex items-center gap-2">
          <AlertCircle className="w-5 h-5" />
          <h3 className="font-semibold">Sign-In Failed</h3>
        </div>
        <p className="text-sm">{error.message}</p>
        <div className="flex gap-2 w-full mt-2">
          <Button variant="outline" onClick={resetError} className="flex-1 text-foreground border-destructive/20 hover:bg-destructive/20">
            Cancel
          </Button>
          <Button variant="destructive" onClick={begin} className="flex-1">
            Retry
          </Button>
        </div>
      </div>
    );
  }

  // 4. Loading States
  if (status === 'requesting-challenge' || status === 'signing' || status === 'submitting') {
    return (
      <div className="flex flex-col items-center justify-center p-6 border rounded-xl bg-card text-card-foreground shadow-sm max-w-md w-full mx-auto space-y-4" aria-live="polite">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <div className="text-center space-y-1">
          <h3 className="font-semibold tracking-tight">
            {status === 'requesting-challenge' && 'Preparing Sign-In'}
            {status === 'signing' && 'Awaiting Signature'}
            {status === 'submitting' && 'Verifying'}
          </h3>
          <p className="text-sm text-muted-foreground animate-pulse">
            {status === 'requesting-challenge' && 'Requesting secure challenge...'}
            {status === 'signing' && 'Please check your wallet and sign the message.'}
            {status === 'submitting' && 'Confirming signature with the server...'}
          </p>
        </div>
      </div>
    );
  }

  // 5. Ready to Sign State
  if (status === 'ready-to-sign' && displayMessage) {
    return (
      <div className="flex flex-col items-start p-6 border rounded-xl bg-card text-card-foreground shadow-sm max-w-md w-full mx-auto space-y-4">
        <h3 className="font-semibold tracking-tight">Review Message</h3>
        <p className="text-sm text-muted-foreground">
          Please review the message below and sign it in your wallet to confirm you own this address.
        </p>
        <div className="w-full bg-muted p-3 rounded-md overflow-x-auto">
          <pre className="text-xs font-mono whitespace-pre-wrap text-muted-foreground break-all">
            {displayMessage}
          </pre>
        </div>
        <div className="flex gap-2 w-full mt-2">
          <Button variant="outline" onClick={clear} className="flex-1">
            Cancel
          </Button>
          <Button onClick={signAndSubmit} disabled={isBusy} className="flex-1">
            Sign Message
          </Button>
        </div>
      </div>
    );
  }

  // 6. Idle State (Ready to begin)
  return (
    <div className="flex flex-col items-center p-6 border rounded-xl bg-card text-card-foreground shadow-sm max-w-md w-full mx-auto space-y-4">
      <div className="p-3 bg-primary/10 rounded-full">
        <Wallet className="w-6 h-6 text-primary" />
      </div>
      <div className="text-center space-y-1">
        <h3 className="font-semibold tracking-tight">Sign In With Ethereum</h3>
        <p className="text-sm text-muted-foreground">
          Sign a message to verify wallet ownership. This request will not trigger a blockchain transaction or cost any gas fees.
        </p>
      </div>
      <Button onClick={begin} disabled={isBusy} className="w-full mt-2">
        Begin Sign-In
      </Button>
      {session && (
        <Button variant="outline" onClick={clear} className="w-full gap-2" aria-label="Sign out">
          <LogOut className="w-4 h-4" />
          Sign Out
        </Button>
      )}
    </div>
  );
}

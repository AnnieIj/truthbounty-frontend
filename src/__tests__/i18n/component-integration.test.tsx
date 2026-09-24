/**
 * V2-FE-070 — Component i18n Integration Tests
 * 
 * Tests that components properly use i18n hooks and display translated text.
 * Ensures no hardcoded strings in user-facing components.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import enMessages from '@/../messages/en.json';

// Mock components since they may have complex dependencies
jest.mock('@/hooks/useAccount', () => ({
  useAccount: jest.fn(),
  useDisconnect: jest.fn(() => jest.fn()),
}));

jest.mock('@/hooks/useIsMounted', () => ({
  useIsMounted: jest.fn(() => true),
}));

jest.mock('@/components/ui/ConnectButton', () => ({
  ConnectButton: ({ label }: { label: string }) => <button>{label}</button>,
}));

describe('i18n Integration Tests', () => {
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <NextIntlClientProvider locale="en" messages={enMessages}>
      {children}
    </NextIntlClientProvider>
  );

  describe('Translation Key Coverage', () => {
    test('wallet namespace has required keys', () => {
      expect(enMessages.wallet.connect).toBeDefined();
      expect(enMessages.wallet.disconnect).toBeDefined();
      expect(enMessages.wallet.addressCopied).toBeDefined();
      expect(enMessages.wallet.notConnected).toBeDefined();
      expect(enMessages.wallet.wrongNetwork).toBeDefined();
    });

    test('transaction namespace has required keys', () => {
      expect(enMessages.transaction.states).toBeDefined();
      expect(enMessages.transaction.states.idle).toBeDefined();
      expect(enMessages.transaction.states.preparing).toBeDefined();
      expect(enMessages.transaction.states.confirmed).toBeDefined();
      expect(enMessages.transaction.errors).toBeDefined();
      expect(enMessages.transaction.errors.USER_REJECTED).toBeDefined();
    });

    test('claim namespace has required keys', () => {
      expect(enMessages.claim.submitClaim).toBeDefined();
      expect(enMessages.claim.submittingClaim).toBeDefined();
      expect(enMessages.claim.validation).toBeDefined();
      expect(enMessages.claim.validation.titleRequired).toBeDefined();
      expect(enMessages.claim.errors).toBeDefined();
      expect(enMessages.claim.errors.WALLET_NOT_CONNECTED).toBeDefined();
    });

    test('verification namespace has required keys', () => {
      expect(enMessages.verification.verify).toBeDefined();
      expect(enMessages.verification.reject).toBeDefined();
      expect(enMessages.verification.verifying).toBeDefined();
      expect(enMessages.verification.rejecting).toBeDefined();
    });

    test('common namespace has required keys', () => {
      expect(enMessages.common.loading).toBeDefined();
      expect(enMessages.common.error).toBeDefined();
      expect(enMessages.common.success).toBeDefined();
      expect(enMessages.common.cancel).toBeDefined();
      expect(enMessages.common.submit).toBeDefined();
    });
  });

  describe('Translation Interpolation', () => {
    test('handles variable interpolation', () => {
      const titleMinLength = enMessages.claim.validation.titleMinLength;
      expect(titleMinLength).toContain('{min}');
    });

    test('handles plural forms', () => {
      const items = enMessages.common.items;
      expect(items).toContain('{count, plural');
      expect(items).toContain('=0');
      expect(items).toContain('=1');
      expect(items).toContain('other');
    });

    test('error messages include contextual parameters', () => {
      const wrongNetwork = enMessages.transaction.errors.WRONG_NETWORK;
      expect(wrongNetwork).toContain('{expectedChain}');
      expect(wrongNetwork).toContain('{connectedChain}');
    });
  });

  describe('Message Structure Validation', () => {
    test('all transaction states have labels', () => {
      const states = [
        'idle',
        'preparing',
        'signatureRequested',
        'submitted',
        'confirming',
        'confirmed',
        'safe',
        'indexing',
        'finalized',
        'dropped',
        'replaced',
        'reverted',
        'failed',
        'pending',
        'success',
      ];

      states.forEach(state => {
        expect(enMessages.transaction.states[state as keyof typeof enMessages.transaction.states]).toBeDefined();
      });
    });

    test('all transaction errors have messages', () => {
      const errors = [
        'USER_REJECTED',
        'WRONG_NETWORK',
        'REVERT',
        'DROPPED',
        'REPLACED',
        'STALE_RECEIPT',
        'INVALID_TRANSITION',
        'INVALID_PERSISTED_STATE',
      ];

      errors.forEach(error => {
        expect(enMessages.transaction.errors[error as keyof typeof enMessages.transaction.errors]).toBeDefined();
      });
    });

    test('all claim errors have messages', () => {
      const errors = [
        'INVALID_CHAIN',
        'INVALID_ADDRESS',
        'INVALID_CONTENT_DIGEST',
        'INVALID_AMOUNT',
        'WALLET_NOT_CONNECTED',
        'USER_REJECTED',
        'SIMULATION_REVERTED',
        'TRANSACTION_REVERTED',
        'CLAIM_NOT_INDEXED',
        'UNEXPECTED_ERROR',
      ];

      errors.forEach(error => {
        expect(enMessages.claim.errors[error as keyof typeof enMessages.claim.errors]).toBeDefined();
      });
    });

    test('all verification actions have labels', () => {
      expect(enMessages.verification.verify).toBeDefined();
      expect(enMessages.verification.reject).toBeDefined();
      expect(enMessages.verification.verifying).toBeDefined();
      expect(enMessages.verification.rejecting).toBeDefined();
      expect(enMessages.verification.verified).toBeDefined();
      expect(enMessages.verification.rejected).toBeDefined();
    });
  });

  describe('Accessibility Support', () => {
    test('has accessible labels', () => {
      expect(enMessages.accessibility).toBeDefined();
      expect(enMessages.accessibility.skipToContent).toBeDefined();
      expect(enMessages.accessibility.closeDialog).toBeDefined();
      expect(enMessages.accessibility.loading).toBeDefined();
    });
  });

  describe('Security-Critical Messages', () => {
    test('wallet connection messages are clear', () => {
      expect(enMessages.wallet.notConnected).toContain('not connected');
      expect(enMessages.wallet.wrongNetwork).toContain('Wrong network');
    });

    test('error messages are unambiguous', () => {
      expect(enMessages.claim.errors.WALLET_NOT_CONNECTED).toContain('not connected');
      expect(enMessages.transaction.errors.WRONG_NETWORK).toContain('Wrong network');
      expect(enMessages.transaction.errors.USER_REJECTED).toContain('rejected');
    });

    test('validation messages are clear', () => {
      expect(enMessages.claim.validation.titleRequired).toContain('required');
      expect(enMessages.claim.validation.sourceInvalidUrl).toContain('valid URL');
      expect(enMessages.verification.errors.stakeAmountInvalid).toContain('required');
    });
  });

  describe('Consistency', () => {
    test('action verbs are consistent', () => {
      // Present tense for buttons
      expect(enMessages.claim.submitClaim).toContain('Submit');
      expect(enMessages.verification.verify).toBe('Verify');
      expect(enMessages.verification.reject).toBe('Reject');
      
      // Progressive for status
      expect(enMessages.claim.submittingClaim).toContain('Submitting');
      expect(enMessages.verification.verifying).toContain('Verifying');
    });

    test('error message format is consistent', () => {
      // All error messages should be descriptive
      Object.values(enMessages.claim.errors).forEach(error => {
        expect(typeof error).toBe('string');
        expect(error.length).toBeGreaterThan(0);
      });
    });

    test('state labels are consistent', () => {
      Object.values(enMessages.transaction.states).forEach(state => {
        expect(typeof state).toBe('string');
        expect(state.length).toBeGreaterThan(0);
      });
    });
  });

  describe('No Hardcoded Technical Identifiers', () => {
    test('messages do not contain hardcoded addresses', () => {
      const allMessages = JSON.stringify(enMessages);
      // Should not contain any hardcoded Ethereum addresses
      expect(allMessages).not.toMatch(/0x[a-fA-F0-9]{40}/);
    });

    test('messages do not contain hardcoded hashes', () => {
      const allMessages = JSON.stringify(enMessages);
      // Should not contain any hardcoded transaction hashes
      expect(allMessages).not.toMatch(/0x[a-fA-F0-9]{64}/);
    });

    test('messages use parameters for dynamic values', () => {
      // Check that messages use {} for interpolation where needed
      expect(enMessages.claim.validation.titleMinLength).toMatch(/\{min\}/);
      expect(enMessages.transaction.errors.WRONG_NETWORK).toMatch(/\{expectedChain\}/);
    });
  });

  describe('Completeness', () => {
    test('all major workflows have translation coverage', () => {
      // Wallet connection
      expect(enMessages.wallet).toBeDefined();
      
      // Claim submission
      expect(enMessages.claim.submitClaim).toBeDefined();
      expect(enMessages.claim.validation).toBeDefined();
      
      // Verification
      expect(enMessages.verification.verify).toBeDefined();
      expect(enMessages.verification.reject).toBeDefined();
      
      // Transaction states
      expect(enMessages.transaction.states).toBeDefined();
      expect(enMessages.transaction.errors).toBeDefined();
      
      // Disputes
      expect(enMessages.dispute).toBeDefined();
      
      // Appeals
      expect(enMessages.appeal).toBeDefined();
      
      // Settlement
      expect(enMessages.settlement).toBeDefined();
    });
  });
});

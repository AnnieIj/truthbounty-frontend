/**
 * V2-FE-070 — i18n Type Definitions
 * 
 * TypeScript types for type-safe translations.
 * Ensures all translation keys are valid at compile time.
 */

import type enMessages from '../../messages/en.json';

/**
 * Type representing all available translation keys.
 * Derived from the English translation file structure.
 */
export type Messages = typeof enMessages;

/**
 * Deeply nested keys from the messages object.
 * Used for type-safe translation key access.
 */
export type MessageKeys = {
  [K in keyof Messages]: Messages[K] extends Record<string, any>
    ? `${K & string}.${keyof Messages[K] & string}`
    : K & string;
}[keyof Messages];

/**
 * Translation parameters for interpolation.
 * Values that can be safely interpolated into translated strings.
 */
export type TranslationParams = Record<
  string,
  string | number | boolean | null | undefined
>;

/**
 * Technical identifiers that should never be translated.
 * These are preserved as-is in all locales.
 */
export type TechnicalIdentifier =
  | `0x${string}` // Ethereum addresses and hashes
  | `${number}` // Chain IDs, block numbers
  | 'ABI'
  | 'ERC20'
  | 'ERC721'
  | 'UTC'
  | 'ISO8601';

/**
 * Transaction state labels for UI display.
 * Maps internal state names to translation keys.
 */
export type TransactionStateKey =
  | 'idle'
  | 'preparing'
  | 'signatureRequested'
  | 'submitted'
  | 'confirming'
  | 'confirmed'
  | 'safe'
  | 'indexing'
  | 'finalized'
  | 'dropped'
  | 'replaced'
  | 'reverted'
  | 'failed'
  | 'pending'
  | 'success';

/**
 * Error code to translation key mapping.
 */
export type ErrorCodeKey =
  | 'userRejected'
  | 'wrongNetwork'
  | 'revert'
  | 'dropped'
  | 'replaced'
  | 'staleReceipt'
  | 'invalidTransition'
  | 'invalidPersistedState'
  | 'timeout'
  | 'insufficientFunds'
  | 'gasEstimationFailed'
  | 'networkError'
  | 'unknownError';

/**
 * Claim creation error codes.
 */
export type ClaimErrorCodeKey =
  | 'invalidChain'
  | 'invalidAddress'
  | 'invalidContentDigest'
  | 'invalidAmount'
  | 'invalidConfig'
  | 'invalidArtifactVersion'
  | 'walletNotConnected'
  | 'userRejected'
  | 'simulationReverted'
  | 'transactionReverted'
  | 'txNotFound'
  | 'allowanceInsufficient'
  | 'approvalFailed'
  | 'claimNotIndexed'
  | 'unexpectedError';

declare global {
  // Use type-safe messages from the English translation file
  interface IntlMessages extends Messages {}
}

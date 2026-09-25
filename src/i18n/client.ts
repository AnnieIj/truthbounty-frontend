/**
 * V2-FE-070 — Client-side i18n Utilities
 * 
 * Custom hooks and utilities for using translations in client components.
 * Provides type-safe access to translations with automatic locale detection.
 */

'use client';

import { useTranslations as useNextIntlTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import type { Locale } from './config';
import type { TranslationParams } from './types';
import {
  getTransactionErrorKey,
  getTransactionStateKey,
  getTransactionStateDescriptionKey,
  getClaimErrorKey,
  getClaimStatusKey,
  extractErrorParams,
} from './protocol-mapper';
import type {
  TransactionMachineErrorReason,
  TransactionStatus,
} from '@/lib/transaction-machine/transaction-machine.types';
import type { ClaimCreationErrorCode } from '@/hooks/useClaimCreationTransaction';

/**
 * Type-safe translation hook for client components.
 * 
 * @example
 * const t = useTranslations('wallet');
 * return <button>{t('connect')}</button>;
 */
export function useTranslations<Namespace extends string = string>(
  namespace?: Namespace
) {
  return useNextIntlTranslations(namespace);
}

/**
 * Get the current locale from the URL params.
 */
export function useLocale(): Locale {
  const params = useParams();
  return (params?.locale as Locale) ?? 'en';
}

/**
 * Hook for formatting numbers with the current locale.
 */
export function useNumberFormat(options?: Intl.NumberFormatOptions) {
  const locale = useLocale();
  
  return (value: number | bigint) => {
    return new Intl.NumberFormat(locale, options).format(value);
  };
}

/**
 * Hook for formatting dates with the current locale.
 */
export function useDateFormat(options?: Intl.DateTimeFormatOptions) {
  const locale = useLocale();
  
  return (date: Date | number) => {
    return new Intl.DateTimeFormat(locale, options).format(date);
  };
}

/**
 * Hook for formatting relative time (e.g., "2 hours ago").
 */
export function useRelativeTime() {
  const locale = useLocale();
  
  return (date: Date | number, baseDate: Date = new Date()) => {
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
    const timestamp = typeof date === 'number' ? date : date.getTime();
    const baseTimestamp = baseDate.getTime();
    const diffInSeconds = Math.floor((timestamp - baseTimestamp) / 1000);

    const units: Array<{ unit: Intl.RelativeTimeFormatUnit; seconds: number }> = [
      { unit: 'year', seconds: 31536000 },
      { unit: 'month', seconds: 2592000 },
      { unit: 'week', seconds: 604800 },
      { unit: 'day', seconds: 86400 },
      { unit: 'hour', seconds: 3600 },
      { unit: 'minute', seconds: 60 },
      { unit: 'second', seconds: 1 },
    ];

    for (const { unit, seconds } of units) {
      const value = Math.floor(diffInSeconds / seconds);
      if (Math.abs(value) >= 1) {
        return rtf.format(value, unit);
      }
    }

    return rtf.format(0, 'second');
  };
}

/**
 * Get a translated error message for a specific error code.
 * Safely handles unknown error codes with a fallback.
 * 
 * @deprecated Use useTransactionError or useClaimError instead
 */
export function useErrorMessage() {
  const t = useTranslations('transaction.errors');
  
  return (errorCode: string, params?: TranslationParams) => {
    try {
      // @ts-expect-error - Dynamic key access
      return t(errorCode, params);
    } catch {
      return t('unknownError', params);
    }
  };
}

/**
 * Get a translated transaction state label.
 * 
 * @deprecated Use useTransactionStateLabel instead
 */
export function useTransactionStateLabel() {
  const t = useTranslations('transaction.states');
  
  return (state: string) => {
    try {
      // @ts-expect-error - Dynamic key access
      return t(state);
    } catch {
      return state;
    }
  };
}

/**
 * Hook for translating transaction machine errors.
 * Maps error reasons to localized user messages.
 * 
 * @example
 * const getErrorMessage = useTransactionError();
 * return <div>{getErrorMessage('WRONG_NETWORK', { expectedChain: 10 })}</div>;
 */
export function useTransactionError() {
  const t = useTranslations();
  
  return (errorReason: TransactionMachineErrorReason, additionalParams?: Record<string, unknown>) => {
    const key = getTransactionErrorKey(errorReason);
    const params = additionalParams ?? {};
    
    try {
      // @ts-expect-error - Dynamic translation key
      return t(key, params);
    } catch {
      // @ts-expect-error - Fallback translation
      return t('transaction.errors.unknownError', params);
    }
  };
}

/**
 * Hook for translating transaction states.
 * 
 * @example
 * const getStateLabel = useTransactionState();
 * return <span>{getStateLabel('confirming')}</span>;
 */
export function useTransactionState() {
  const t = useTranslations();
  
  return (status: TransactionStatus) => {
    const key = getTransactionStateKey(status);
    
    try {
      // @ts-expect-error - Dynamic translation key
      return t(key);
    } catch {
      return status;
    }
  };
}

/**
 * Hook for translating transaction state descriptions.
 * 
 * @example
 * const getDescription = useTransactionStateDescription();
 * return <p>{getDescription('confirming')}</p>;
 */
export function useTransactionStateDescription() {
  const t = useTranslations();
  
  return (status: TransactionStatus) => {
    const key = getTransactionStateDescriptionKey(status);
    
    try {
      // @ts-expect-error - Dynamic translation key
      return t(key);
    } catch {
      return '';
    }
  };
}

/**
 * Hook for translating claim creation errors.
 * 
 * @example
 * const getErrorMessage = useClaimError();
 * return <div>{getErrorMessage('INVALID_CHAIN')}</div>;
 */
export function useClaimError() {
  const t = useTranslations();
  
  return (errorCode: ClaimCreationErrorCode, error?: unknown) => {
    const key = getClaimErrorKey(errorCode);
    const params = error ? extractErrorParams(error) : {};
    
    try {
      // @ts-expect-error - Dynamic translation key
      return t(key, params);
    } catch {
      // @ts-expect-error - Fallback translation
      return t('claim.errors.unexpectedError', params);
    }
  };
}

/**
 * Hook for translating claim creation status.
 * 
 * @example
 * const getStatusLabel = useClaimStatus();
 * return <span>{getStatusLabel('validating')}</span>;
 */
export function useClaimStatus() {
  const t = useTranslations();
  
  return (status: string) => {
    const key = getClaimStatusKey(status);
    
    try {
      // @ts-expect-error - Dynamic translation key
      return t(key);
    } catch {
      return status;
    }
  };
}

/**
 * Hook for complete error message formatting.
 * Automatically extracts params from error objects and provides localized message.
 * 
 * @example
 * const formatError = useFormatError();
 * return <div role="alert">{formatError(caughtError)}</div>;
 */
export function useFormatError() {
  const getTransactionError = useTransactionError();
  const getClaimError = useClaimError();
  const t = useTranslations('errors');
  
  return (error: unknown): string => {
    if (!error) {
      // @ts-expect-error - Fallback
      return t('generic');
    }

    // Handle TransactionMachineError
    if (
      typeof error === 'object' &&
      error !== null &&
      'reason' in error &&
      typeof (error as { reason: unknown }).reason === 'string'
    ) {
      const reason = (error as { reason: TransactionMachineErrorReason }).reason;
      const params = extractErrorParams(error);
      return getTransactionError(reason, params);
    }

    // Handle ClaimCreationError
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      typeof (error as { code: unknown }).code === 'string'
    ) {
      const code = (error as { code: ClaimCreationErrorCode }).code;
      return getClaimError(code, error);
    }

    // Handle generic Error
    if (error instanceof Error) {
      return error.message;
    }

    // Fallback for unknown error types
    // @ts-expect-error - Fallback
    return t('generic');
  };
}


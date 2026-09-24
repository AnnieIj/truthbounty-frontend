'use client';

import React, { useState } from 'react';
import { useAccount, useDisconnect } from '@/hooks/useAccount';
import { useIsMounted } from '@/hooks/useIsMounted';
import { ConnectButton } from '@/components/ui/ConnectButton';
import { useTranslations } from '@/i18n';
import styles from './style.module.css';

export function WalletConnection() {
  const t = useTranslations('wallet');
  const mounted = useIsMounted();
  const account = useAccount();
  const disconnect = useDisconnect();
  const [copyStatus, setCopyStatus] = useState('');

  const handleDisconnect = async () => {
    await disconnect();
  };

  const handleCopyAddress = async () => {
    if (account?.address && typeof navigator !== 'undefined' && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(account.address);
        setCopyStatus(t('addressCopied'));
        setTimeout(() => setCopyStatus(''), 3000);
      } catch (error) {
        console.error('Failed to copy address:', error);
      }
    }
  };

  return (
    <>
      {mounted && account ? (
        <div className={styles.displayData}>
          {/* Address button (accessible + keyboard friendly) */}
          <button
            type="button"
            className={styles.card}
            onClick={handleCopyAddress}
            aria-label={t('copyAddress', { address: account.displayName })}
          >
            {account.displayName}
          </button>

          {/* Screen-reader feedback for copy status */}
          <span className="sr-only" aria-live="polite" aria-atomic="true">
            {copyStatus}
          </span>

          {/* Disconnect button */}
          <button
            type="button"
            className={styles.disconnectButton}
            onClick={handleDisconnect}
            aria-label={t('disconnect')}
          >
            {t('disconnect')}
          </button>
        </div>
      ) : (
        <ConnectButton label={t('connect')} />
      )}
    </>
  );
}

export default WalletConnection;
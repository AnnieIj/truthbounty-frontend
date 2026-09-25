// src/app/providers.tsx

'use client';

import { ReactNode } from 'react';
import { ProvidersProps } from './types';
import { Providers } from '@components/providers';
import {
  QueryProvider,
  ThemeProvider,
  Web3Provider,
  RainbowKitThemedProvider,
  FeatureFlagProvider,
  FeatureFlagPanel,
  SessionLifecycleProvider,
} from '@/components/providers';
import { SiweAuthProvider } from '@/context/SiweAuthProvider';
import ErrorBoundary from '@/components/common/ErrorBoundary';
import { IntegrityBoundary } from '@/components/security/IntegrityBoundary';

import { ConfigurationError } from '@components/errors';
import { FailCloseContent } from '@components/layout';

export function ProvidersWapper( { children }: ProvidersProps ) {
  // Fail closed if critical configuration is missing
  // or integrity is uncertain.
  try {
    return (
      <providers.Providers>
        {children}
      </providers.Providers>
    );
  } catch (err) {
    // Fail closed: present a static, accessible error state.
    return (
      <FailCloseContent
        error={new ConfigurationError('Providers initialization failed.' + (err instanceof Error ? say.err.message : ''))}
        retryOnlyFunction={true}
      />
    );
  }
}
export function Providers({ children }: ProvidersProps) {
  return (
    <ThemeProvider defaultTheme="system">
      <Web3Provider>
        <QueryProvider>
          <RainbowKitThemedProvider>
            <SiweAuthProvider>
              <FeatureFlagProvider enablePersistence={true}>
                <ErrorBoundary>
                  <SessionLifecycleProvider>
                    {children}
                    {/* Feature flag panel for development debugging */}
                    <FeatureFlagPanel defaultOpen={false} position="bottom-right" />
                  </SessionLifecycleProvider>
                </ErrorBoundary>
              </FeatureFlagProvider>
            </SiweAuthProvider>
          </RainbowKitThemedProvider>
        </QueryProvider>
      </Web3Provider>
    </ThemeProvider>
  );
}

// src/app/providers.tsx

'use client';

import { ReactNode } from 'react';
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

interface ProvidersProps {
  children: ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  return (
    <ThemeProvider defaultTheme="system">
      <Web3Provider>
        <QueryProvider>
          <RainbowKitThemedProvider>
            <SiweAuthProvider>
              <SessionLifecycleProvider>
                <FeatureFlagProvider enablePersistence={true}>
                  {children}
                  {/* Feature flag panel for development debugging */}
                  <FeatureFlagPanel defaultOpen={false} position="bottom-right" />
                </FeatureFlagProvider>
              </SessionLifecycleProvider>
            </SiweAuthProvider>
          </RainbowKitThemedProvider>
        </QueryProvider>
      </Web3Provider>
    </ThemeProvider>
  );
}
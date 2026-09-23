// src/app/providers.tsx

'use client';

import { ReactNode } from 'react';
import { ProvidersProps } from './types';
import { Providers } from '@components/providers';

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

# Internationalization Setup (V2-FE-070)

## Overview

This document describes the i18n infrastructure for TruthBounty frontend, implementing protocol and error message internationalization while preserving technical identifiers.

## Installation

### Required Dependencies

Add the following dependency to enable internationalization:

```bash
pnpm add next-intl
```

**Version:** `^3.0.0` or latest compatible with Next.js 16.x

### Verification

After installation, verify the setup:

```bash
pnpm install
pnpm type-check
pnpm build
```

## Architecture

### Directory Structure

```
truthbounty-frontend/
├── messages/
│   ├── en.json          # English (default)
│   ├── es.json          # Spanish (future)
│   ├── fr.json          # French (future)
│   └── ...
├── src/
│   └── i18n/
│       ├── config.ts    # Locale configuration
│       ├── request.ts   # Server-side setup
│       ├── client.ts    # Client-side hooks
│       ├── types.ts     # TypeScript types
│       └── utils.ts     # Formatting utilities
├── middleware.ts         # Locale detection
└── next.config.ts       # Next.js i18n plugin
```

### Core Principles

1. **Type Safety**: All translation keys are type-checked at compile time
2. **Technical Preservation**: Addresses, hashes, ABIs, chain IDs are never translated
3. **Security First**: Error messages remain unambiguous across all locales
4. **No Fabrication**: Translation system cannot generate false technical data

## Configuration

### Supported Locales

Currently configured locales (extendable):
- `en` - English (default)
- `es` - Spanish
- `fr` - French
- `de` - German
- `zh` - Chinese
- `ja` - Japanese

### Locale Detection

The middleware automatically detects user locale based on:
1. URL path segment (e.g., `/es/claims`)
2. `Accept-Language` header
3. Fallback to `en` (default)

## Usage

### In Client Components

```tsx
'use client';

import { useTranslations } from '@/i18n/client';

export function WalletButton() {
  const t = useTranslations('wallet');
  
  return (
    <button>
      {t('connect')}
    </button>
  );
}
```

### In Server Components

```tsx
import { useTranslations } from 'next-intl';

export default function ClaimPage() {
  const t = useTranslations('claim');
  
  return <h1>{t('title')}</h1>;
}
```

### With Parameters

```tsx
const t = useTranslations('transaction.errors');

// Interpolate values
const message = t('wrongNetwork', { expectedNetwork: 'Optimism' });
// => "Wrong network. Please switch to Optimism"
```

### Error Messages

```tsx
import { useErrorMessage } from '@/i18n/client';

function ErrorDisplay({ errorCode }: { errorCode: string }) {
  const getErrorMessage = useErrorMessage();
  
  return (
    <div role="alert">
      {getErrorMessage(errorCode)}
    </div>
  );
}
```

### Transaction States

```tsx
import { useTransactionStateLabel } from '@/i18n/client';

function TransactionStatus({ state }: { state: string }) {
  const getStateLabel = useTransactionStateLabel();
  
  return <span>{getStateLabel(state)}</span>;
}
```

### Formatting Utilities

```tsx
import { 
  formatNumber,
  formatTokenAmount,
  shortenAddress,
  getNetworkName 
} from '@/i18n/utils';

// Format numbers with locale
formatNumber(1234567, 'en'); // "1,234,567"
formatNumber(1234567, 'de'); // "1.234.567"

// Format token amounts
formatTokenAmount(1000000000000000000n, 18, 'en'); // "1"

// Shorten addresses (technical, never translated)
shortenAddress('0x1234...7890'); // "0x1234...7890"

// Get network names (conventional, not translated)
getNetworkName(10); // "Optimism"
```

## Translation Keys

### Namespace Structure

- `common.*` - Common UI elements
- `wallet.*` - Wallet connection and management
- `transaction.*` - Transaction states and errors
- `claim.*` - Claim submission and management
- `verification.*` - Verification actions
- `dispute.*` - Dispute operations
- `appeal.*` - Appeal operations
- `settlement.*` - Settlement operations
- `errors.*` - General error messages
- `accessibility.*` - Accessibility labels

### Key Naming Conventions

- Use camelCase for keys
- Group related keys by namespace
- Use descriptive names that indicate context
- Keep keys stable across versions

### Reserved Technical Terms

The following MUST NOT be translated:
- Ethereum addresses (`0x...`)
- Transaction hashes (`0x...`)
- Chain IDs (numbers)
- Block numbers (numbers)
- ABI function names
- Smart contract events
- Gas values (bigint)
- Token symbols (e.g., ETH, USDC)

## Adding New Languages

1. Create a new message file:
   ```bash
   cp messages/en.json messages/es.json
   ```

2. Translate user-facing strings (preserve technical identifiers)

3. Add locale to `src/i18n/config.ts`:
   ```ts
   export const locales = ['en', 'es', 'fr'] as const;
   ```

4. Verify types still compile:
   ```bash
   pnpm type-check
   ```

## Testing

### Type Safety

```bash
pnpm type-check
```

### Build Verification

```bash
pnpm build
```

### Unit Tests

```tsx
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '@/messages/en.json';

test('renders translated text', () => {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <YourComponent />
    </NextIntlClientProvider>
  );
  
  expect(screen.getByText('Connect Wallet')).toBeInTheDocument();
});
```

## Security Constraints

### ✅ ALLOWED

- Translate user-facing labels and messages
- Interpolate safe values (strings, numbers)
- Format numbers and dates per locale
- Pluralize based on count

### ❌ FORBIDDEN

- Fabricate transaction hashes or addresses
- Translate technical identifiers
- Modify smart contract ABIs
- Generate fake receipt data
- Alter chain IDs or block numbers
- Translate error codes (only error messages)

### Security Warnings

Security-critical messages (e.g., "Wrong network", "Insufficient funds") MUST:
- Remain clear and unambiguous in all languages
- Never be softened or made vague
- Preserve all technical details in the original form
- Include actionable information

## Performance

- Translation files are static JSON (no runtime overhead)
- Messages are tree-shaken (only used keys included)
- Locale detection happens once per request
- No client-side translation loading required

## Maintenance

### Adding New Keys

1. Add to `messages/en.json`
2. TypeScript will automatically detect the new key
3. Add translations to other locale files
4. Import where needed

### Deprecating Keys

1. Mark as deprecated in code comments
2. Add migration path to new key
3. Update all usages
4. Remove after one release cycle

### Key Validation

Use the script to verify all keys are present in all locales:

```bash
node scripts/validate-i18n.js
```

## Troubleshooting

### Type Errors

If you see type errors after adding new keys:
```bash
# Restart TypeScript server
# In VS Code: Cmd/Ctrl + Shift + P -> "TypeScript: Restart TS Server"
```

### Missing Translations

Check the browser console for warnings about missing keys.

### Build Failures

Ensure `next-intl` is installed and `middleware.ts` is properly configured.

## References

- [next-intl Documentation](https://next-intl-docs.vercel.app/)
- [Next.js i18n Routing](https://nextjs.org/docs/app/building-your-application/routing/internationalization)
- [V2-FE-070 Implementation Spec](../IMPLEMENTATION_V2_FE_070.md)

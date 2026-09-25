# Internationalization (i18n) Module

**Version:** 1.0.0  
**Implementation:** V2-FE-070

## Overview

This module provides type-safe internationalization for the TruthBounty frontend. It externalizes all user-facing text while preserving technical identifiers and maintaining security constraints.

## Quick Start

```typescript
// In a client component
'use client';
import { useTranslations, useFormatters } from '@/i18n';

export function MyComponent() {
  const t = useTranslations('wallet');
  const format = useFormatters();

  return (
    <div>
      <button>{t('connect')}</button>
      <p>{format.address(address, 'short')}</p>
    </div>
  );
}
```

## Core Principles

### ✅ DO

- Use `useTranslations` for user-facing text
- Use formatters for technical identifiers
- Preserve addresses, hashes, and chain IDs exactly
- Keep error messages clear and unambiguous
- Test translations with actual users

### ❌ DON'T

- Translate technical identifiers (addresses, hashes)
- Fabricate protocol data in formatters
- Soften or vague security warnings
- Use hardcoded strings in components
- Bypass type checking with `any`

## Module Structure

```
src/i18n/
├── config.ts              # Locale configuration
├── request.ts             # Server-side setup (for Next.js)
├── client.ts              # Client hooks (useTranslations, etc.)
├── types.ts               # TypeScript type definitions
├── utils.ts               # Basic utility functions
├── formatters.ts          # Blockchain-specific formatters
├── pluralization.ts       # Plural forms and ICU helpers
├── protocol-mapper.ts     # Error/state to translation key mapping
├── use-formatters.ts      # React hooks for formatters
├── use-pluralization.ts   # React hooks for pluralization
├── index.ts               # Public API (import from here)
└── README.md              # This file
```

## Usage Guide

### Translations

#### Basic Usage

```typescript
import { useTranslations } from '@/i18n';

const t = useTranslations('claim');

// Simple translation
t('submitClaim')  // => "Submit a Claim"

// With parameters
t('validation.titleMinLength', { min: 5 })
// => "Title must be at least 5 characters"

// Nested namespaces
t('errors.WALLET_NOT_CONNECTED')
// => "Wallet not connected. Connect a wallet before creating a claim."
```

#### Multiple Namespaces

```typescript
const tClaim = useTranslations('claim');
const tWallet = useTranslations('wallet');
const tCommon = useTranslations('common');

return (
  <>
    <h1>{tClaim('submitClaim')}</h1>
    <button>{tCommon('cancel')}</button>
    {!isConnected && <p>{tWallet('notConnected')}</p>}
  </>
);
```

### Formatters

#### Address Formatting

```typescript
import { useFormatters } from '@/i18n';

const format = useFormatters();

// Short format (default for UI)
format.address('0x742d35Cc6634C0532925a3b844Bc9e7595f0eB1E', 'short')
// => "0x742d...0eB1E"

// Medium format (more context)
format.address('0x742d35Cc6634C0532925a3b844Bc9e7595f0eB1E', 'medium')
// => "0x742d35Cc66...95f0eB1E"

// Full format (technical displays)
format.address('0x742d35Cc6634C0532925a3b844Bc9e7595f0eB1E', 'full')
// => "0x742d35Cc6634C0532925a3b844Bc9e7595f0eB1E"
```

#### Token Amounts

```typescript
// Basic amount
format.token(1000000000000000000n, 18)
// => "1"

// With symbol
format.token(1500000000000000000n, 18, { symbol: 'ETH' })
// => "1.5 ETH"

// Control decimals
format.token(1234567890123456789n, 18, { maxDecimals: 4 })
// => "1.2345"

// Compact notation
format.token(1500000000000000000000n, 18, { compact: true, symbol: 'ETH' })
// => "1.5K ETH"
```

#### Time Formatting

```typescript
// Relative time
format.relativeTime(Date.now() - 2 * 60 * 60 * 1000)
// => "2 hours ago"

// Absolute time
format.absoluteTime(Date.now())
// => "Jan 15, 2024, 3:45 PM"

// Duration
format.duration(65000)
// => "1 minute 5 seconds"
```

#### Block and Gas

```typescript
// Block number (locale-aware)
format.blockNumber(12345678)
// => "12,345,678" (en) or "12.345.678" (de)

// Gas amount
format.gas(21000)
// => "21,000"

// Gas price
format.gasPrice(50000000000n)
// => "50 Gwei"
```

### Pluralization

```typescript
import { usePluralizers } from '@/i18n';

const plural = usePluralizers();

// Protocol entities
plural.claims(1)         // => "1 claim"
plural.claims(5)         // => "5 claims"
plural.verifications(3)  // => "3 verifications"
plural.confirmations(10) // => "10 confirmations"

// Ordinal numbers
plural.ordinal(1)   // => "1st"
plural.ordinal(2)   // => "2nd"
plural.ordinal(21)  // => "21st"

// Ranges
plural.range(1, 10)  // => "1–10"

// Lists
plural.list(['Alice', 'Bob', 'Charlie'], 'conjunction')
// => "Alice, Bob, and Charlie"
```

### Error Handling

```typescript
import { useTransactionError, useClaimError, useFormatError } from '@/i18n';

// Transaction errors
const getTransactionError = useTransactionError();
const message = getTransactionError('WRONG_NETWORK', {
  expectedChain: 10,
  connectedChain: 1,
});
// => "Wrong network. Connected to chain 1, expected chain 10"

// Claim errors
const getClaimError = useClaimError();
const message = getClaimError('WALLET_NOT_CONNECTED');
// => "Wallet not connected. Connect a wallet before creating a claim."

// Generic error formatting
const formatError = useFormatError();
try {
  await someOperation();
} catch (error) {
  const message = formatError(error);
  // Automatically detects error type and formats appropriately
}
```

## Adding New Translations

### 1. Add to English Messages

```json
// messages/en.json
{
  "myFeature": {
    "title": "My Feature",
    "action": "Do Something",
    "error": "Something went wrong: {reason}"
  }
}
```

### 2. Use in Component

```typescript
const t = useTranslations('myFeature');

<h1>{t('title')}</h1>
<button>{t('action')}</button>
<p>{t('error', { reason: errorReason })}</p>
```

### 3. TypeScript Auto-Detection

TypeScript automatically detects the new keys. Invalid keys cause compile errors:

```typescript
t('title')      // ✅ Valid
t('invalidKey') // ❌ Compile error
```

## Translation Key Conventions

### Naming

- Use `camelCase` for all keys
- Be descriptive: `submitVerification` not `submit`
- Group related keys by feature
- Keep keys stable across versions

### Organization

```
feature.*              # Top-level feature namespace
  .fields.*            # Form field labels
  .actions.*           # Button/action labels  
  .messages.*          # Status/info messages
  .errors.*            # Error messages
  .validation.*        # Validation errors
```

### Parameters

Use `{paramName}` for interpolation:

```json
{
  "message": "User {userName} has {count} claims"
}
```

### Plurals

Use ICU MessageFormat syntax:

```json
{
  "items": "{count, plural, =0 {no items} =1 {one item} other {# items}}"
}
```

## Security Guidelines

### Never Translate

- Ethereum addresses (`0x...`)
- Transaction hashes (`0x...`)
- Chain IDs (numbers)
- Block numbers (numbers)
- Gas amounts (numbers)
- ABI function names
- Contract event names

### Always Preserve

- Numeric precision (use bigint)
- Hex format for addresses/hashes
- Original error codes
- Technical constants

### Error Messages

- Be explicit and clear
- Include actionable information
- Don't soften security warnings
- Show both expected and actual values

## Testing

### Test Your Translations

```typescript
import { render } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '@/../messages/en.json';

const Wrapper = ({ children }) => (
  <NextIntlClientProvider locale="en" messages={messages}>
    {children}
  </NextIntlClientProvider>
);

test('displays translated text', () => {
  const { getByText } = render(<MyComponent />, { wrapper: Wrapper });
  expect(getByText('Connect Wallet')).toBeInTheDocument();
});
```

### Test Formatters

```typescript
import { formatAddress } from '@/i18n/formatters';

test('formats address correctly', () => {
  const formatted = formatAddress('0x742d35Cc6634C0532925a3b844Bc9e7595f0eB1E', 'short');
  expect(formatted).toBe('0x742d...0eB1E');
});
```

## Performance Tips

1. **Use Memoization**
   - Formatters are already memoized
   - Translation hooks auto-optimize

2. **Avoid Inline Functions**
   ```typescript
   // ❌ Bad: Creates new function on every render
   <button onClick={() => t('action')}>

   // ✅ Good: Memoized
   const actionText = t('action');
   <button onClick={handleClick}>{actionText}</button>
   ```

3. **Batch Formatter Calls**
   ```typescript
   // ✅ Use comprehensive hook
   const format = useFormatters();
   format.address(addr);
   format.token(amount, 18);
   ```

## Troubleshooting

### "Key not found" Errors

**Cause:** Translation key doesn't exist in messages file.

**Solution:**
1. Check spelling of key
2. Verify key exists in `messages/en.json`
3. Restart TypeScript server
4. Clear Next.js cache: `rm -rf .next`

### Type Errors on Translation Keys

**Cause:** TypeScript types out of sync with messages.

**Solution:**
1. Restart TypeScript server (VS Code: Cmd/Ctrl+Shift+P → "Restart TS Server")
2. Verify `messages/en.json` is valid JSON
3. Check `src/i18n/types.ts` imports correctly

### Formatter Not Working

**Cause:** Invalid input or wrong usage.

**Solution:**
1. Check input format (addresses must be 0x + 40 hex chars)
2. Verify numeric types (use bigint for large numbers)
3. Check console for warnings
4. Review formatter test files for examples

### Translation Not Showing

**Cause:** Component not wrapped in provider or wrong locale.

**Solution:**
1. Verify middleware is configured
2. Check `next.config.ts` includes next-intl plugin
3. Ensure messages file is in correct location
4. Check browser console for errors

## Migration from Hardcoded Strings

### Before

```typescript
<button>Connect Wallet</button>
<p>Wallet not connected</p>
```

### After

```typescript
const t = useTranslations('wallet');

<button>{t('connect')}</button>
<p>{t('notConnected')}</p>
```

### Migration Checklist

- [ ] Import `useTranslations` hook
- [ ] Add translation keys to `messages/en.json`
- [ ] Replace hardcoded strings with `t()` calls
- [ ] Test all user flows
- [ ] Verify accessibility maintained

## Resources

### Internal

- [I18N_SETUP.md](../../docs/I18N_SETUP.md) - Complete setup guide
- [IMPLEMENTATION_V2_FE_070.md](../../IMPLEMENTATION_V2_FE_070.md) - Implementation details
- [Test Examples](../__tests__/i18n/) - Test file examples

### External

- [next-intl Documentation](https://next-intl-docs.vercel.app/)
- [ICU Message Format](https://unicode-org.github.io/icu/userguide/format_parse/messages/)
- [Intl.NumberFormat](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/NumberFormat)
- [Intl.DateTimeFormat](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat)

## Support

### Getting Help

1. Check this README first
2. Review test files for examples
3. Check [I18N_SETUP.md](../../docs/I18N_SETUP.md)
4. Ask in team chat
5. Create issue with reproduction

### Reporting Issues

Include:
- Code snippet
- Expected behavior
- Actual behavior
- Error messages
- Browser/environment

---

**Maintained by:** Frontend Team  
**Last Updated:** September 24, 2026  
**Version:** 1.0.0

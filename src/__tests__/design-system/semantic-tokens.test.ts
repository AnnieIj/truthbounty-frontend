/**
 * Design system: semantic token contract (V2-FE-121).
 *
 * Keeps `src/lib/design-tokens.ts` (the code-side source of truth) and
 * `src/app/globals.css` (the styling source of truth) synchronised. Every
 * declared semantic colour role MUST:
 *   - be defined as a CSS variable in BOTH the light (`:root`) and dark
 *     (`.dark`) themes, and
 *   - be mapped into the Tailwind `@theme inline` block as `--color-*`.
 *
 * Type-scale and layout tokens must exist, and the tabular-numeral data
 * utility must be present so amounts never jitter.
 */

import fs from 'node:fs';
import path from 'node:path';

import {
  LAYOUT_TOKENS,
  SEMANTIC_COLOR_TOKENS,
  STATUS_TONES,
  TYPE_SCALE_TOKENS,
} from '@/lib/design-tokens';

const GLOBALS_CSS = fs.readFileSync(
  path.resolve(__dirname, '../../app/globals.css'),
  'utf8',
);

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe('Design system: semantic colour tokens (V2-FE-121)', () => {
  it.each(SEMANTIC_COLOR_TOKENS)(
    'declares --%s in both the light and dark themes',
    (token) => {
      // One declaration in `:root`, one in `.dark`.
      expect(countOccurrences(GLOBALS_CSS, `--${token}:`)).toBeGreaterThanOrEqual(2);
    },
  );

  it.each(SEMANTIC_COLOR_TOKENS)(
    'maps --%s into a Tailwind colour utility',
    (token) => {
      expect(GLOBALS_CSS).toContain(`--color-${token}: var(--${token})`);
    },
  );
});

describe('Design system: type-scale and layout tokens (V2-FE-121)', () => {
  it.each(TYPE_SCALE_TOKENS)('declares type scale token --type-%s', (token) => {
    expect(GLOBALS_CSS).toContain(`--type-${token}:`);
  });

  it.each(LAYOUT_TOKENS)('declares layout token --%s', (token) => {
    expect(GLOBALS_CSS).toContain(`--${token}:`);
  });

  it('enforces a 44px minimum touch target', () => {
    expect(GLOBALS_CSS).toContain('--touch-target: 44px');
  });

  it('provides a tabular-numeral data utility for stable amounts', () => {
    expect(GLOBALS_CSS).toContain('.tb-data');
    expect(GLOBALS_CSS).toContain('tabular-nums');
  });
});

describe('Design system: status tone contract (V2-FE-121)', () => {
  it('exposes the transaction-lifecycle tones', () => {
    expect(STATUS_TONES).toEqual(
      expect.arrayContaining([
        'neutral',
        'pending',
        'confirmed',
        'finalized',
        'orphaned',
      ]),
    );
  });
});

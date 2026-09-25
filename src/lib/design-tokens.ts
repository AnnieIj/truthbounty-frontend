/**
 * V2 Design Token contract (V2-FE-121)
 *
 * Single source of truth for the semantic token names that MUST exist in
 * `src/app/globals.css` (as CSS variables) and be mapped into the Tailwind
 * `@theme inline` block (as `--color-*` utilities).
 *
 * The design-system test suite reads these arrays and asserts that every
 * declared role is present in both themes and mapped to a Tailwind colour
 * utility, keeping tokens and code synchronised.
 */

/** Surface + text + action/focus semantic colour roles. */
export const SEMANTIC_COLOR_TOKENS = [
  'canvas',
  'surface',
  'elevated',
  'ink',
  'ink-secondary',
  'ink-muted',
  'action',
  'action-hover',
  'action-ink',
  'focus',
  'success',
  'warning',
  'danger',
  'info',
  'pending',
  'confirmed',
  'finalized',
  'orphaned',
  'divider',
  'disabled',
] as const;

export type SemanticColorToken = (typeof SEMANTIC_COLOR_TOKENS)[number];

/** Type-scale roles (4px-friendly rem scale). */
export const TYPE_SCALE_TOKENS = [
  'display',
  'title',
  'section',
  'body',
  'small',
  'label',
  'code',
  'data',
] as const;

export type TypeScaleToken = (typeof TYPE_SCALE_TOKENS)[number];

/** Layout / responsive tokens. */
export const LAYOUT_TOKENS = ['touch-target', 'content-width', 'gutter'] as const;

export type LayoutToken = (typeof LAYOUT_TOKENS)[number];

/**
 * Status tones exposed by the `StatusBadge` primitive. Each tone maps to a
 * semantic colour role plus a distinct icon glyph so colour never carries
 * meaning alone (WCAG 1.4.1).
 */
export const STATUS_TONES = [
  'neutral',
  'pending',
  'confirmed',
  'finalized',
  'orphaned',
  'success',
  'warning',
  'danger',
  'info',
] as const;

export type StatusToneName = (typeof STATUS_TONES)[number];

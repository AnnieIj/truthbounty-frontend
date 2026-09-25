# UI Primitives (V2-FE-121)

Accessible, token-bound building blocks for the V2 design system. Every
primitive derives its colour/spacing from the semantic tokens declared in
`src/app/globals.css`; the token names are mirrored in
[`src/lib/design-tokens.ts`](../../../lib/design-tokens.ts) and kept in sync by
`src/__tests__/design-system/semantic-tokens.test.ts`.

## Components

### StatusBadge

Accessible status indicator. Meaning is carried by the **text label plus a
distinct icon glyph** — never by colour alone (WCAG 1.4.1).

```tsx
import { StatusBadge } from "@/components/ui/primitives";

<StatusBadge label="Finalized" tone="finalized" description="Durable success." live />;
```

| Prop | Type | Notes |
| --- | --- | --- |
| `label` | `string` | Visible text; the accessible name. |
| `tone` | `StatusToneName` | `neutral \| pending \| confirmed \| finalized \| orphaned \| success \| warning \| danger \| info`. |
| `description` | `string` | Extra detail, exposed to assistive tech only (`sr-only`). |
| `live` | `boolean` | Renders `role="status" aria-live="polite"` for changing tx state. |
| `icon` | `LucideIcon` | Override the tone's default glyph. |

### Card

Presentational surface bound to `--surface` / `--elevated`. Forwards landmark
props (`role`, `aria-labelledby`, `aria-busy`). Use `elevated` for content that
sits above the base surface.

```tsx
<Card elevated role="region" aria-labelledby="h">…</Card>
```

### TokenAmount

Deterministic, tabular-numeral display for amounts. It renders a **pre-formatted
string verbatim** and never derives, rounds or invents a value — callers must
pass canonical data (receipt, projection or protocol parameter).

```tsx
<TokenAmount amount="1.5" symbol="TBNT" />
```

## Guarantees

- Colour never carries meaning alone (paired icon/text).
- No fabricated values: `TokenAmount` displays exactly what it is given.
- Landmark-forwarding so panels can expose accessible `region`s.

## Tests

`src/components/ui/primitives/__tests__/` — `StatusBadge.test.tsx`,
`Card.TokenAmount.test.tsx` (unit + `jest-axe`). Storybook:
`StatusBadge.stories.tsx`.

# V2-FE-131 — Content Security Policy & Security Headers

## Purpose

Enforce browser security headers for the TruthBounty frontend without fabricating protocol outcomes or weakening wallet / identity flows.

## Behavior

| Header | Source | Notes |
| --- | --- | --- |
| `Content-Security-Policy` | `src/middleware.ts` | Per-request nonce; scripts use `nonce` + `strict-dynamic` |
| HSTS, `X-Content-Type-Options`, `X-Frame-Options`, Referrer-Policy, Permissions-Policy, COOP, CORP | middleware + `next.config.ts` | Static headers also apply to static assets |

## Nonce wiring

1. Middleware generates a nonce and sets `x-nonce` on the request.
2. `src/app/layout.tsx` reads `x-nonce` and passes it to `ThemeInitScript`.
3. CSP `script-src` allows only that nonce (plus `strict-dynamic` for trusted chain).

## Failure / degraded posture

- Missing nonce → `buildContentSecurityPolicy` throws (fail closed).
- Report-only mode available via `reportOnly: true` for staged rollout; default is enforce.
- Camera is permitted only for self + Worldcoin IDKit; mic/geo/payment/usb stay closed.
- COOP is `same-origin-allow-popups` so wallet connect popups continue to work.

## Tests

```bash
pnpm test -- src/__tests__/security-headers.test.ts
```

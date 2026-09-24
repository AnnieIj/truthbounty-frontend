# Contract Release Artifacts

The frontend consumes a pinned TruthBounty V2 release package under `release/`.

## Layout

- `manifest.json` — protocol version, chain ID, contract topology
- `addresses/<chainId>.json` — deployed addresses
- `abi/*.json` — contract ABIs
- `events/event-schema.json` — indexed event schema version
- `parameters/<chainId>.json` — on-chain parameter snapshot
- `roles/<chainId>.json` — role holder addresses
- `checksums.json` — SHA-256 checksums for every tracked file

## Verification

```bash
pnpm verify-artifacts
pnpm type-check
pnpm test src/lib/contracts
pnpm build
```

Build runs `verify-artifacts` automatically via `prebuild`.

## Environment

- `NEXT_PUBLIC_PROTOCOL_RELEASE` — optional pin (defaults to manifest `protocolVersion`)
- `TRUTHBOUNTY_ARTIFACT_DIR` — optional override for the release directory (CI/build only)

Diagnostics: `GET /api/protocol`

## Component-level protocol contract tests (V2-FE-141)

Mutation UI should be wrapped in `ProtocolContractBoundary`, which resolves
canonical release diagnostics + the verification artifact and fail-closes when
the active chain is unsupported, addresses are unpinned, or the transaction
lifecycle is stale/rejected/failed/reorged.

```bash
pnpm test src/components/protocol
pnpm test src/components/features/claim-verification/__tests__/protocol-contract-components.test.tsx
```

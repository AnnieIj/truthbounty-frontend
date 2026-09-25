// Test fixtures for canonical claim-list projection tests (V2-FE-109).
// Test-only helpers: never imported from production code.

import type {
  ClaimListItem,
  ClaimsListEnvelope,
} from '@/app/types/claim-list';
import type { ClaimStatus } from '@/app/types/claim';

export function makeClaimItem(
  overrides: Partial<ClaimListItem> = {}
): ClaimListItem {
  return {
    id: 'claim-1',
    title: 'Global average temperatures increased by 1.1°C',
    category: 'Climate',
    status: 'VERIFIED',
    claimantAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0eB1E',
    confidenceScore: 97,
    totalStaked: 45200,
    highImpact: true,
    createdAt: '2026-09-24T10:00:00Z',
    updatedAt: '2026-09-24T10:00:00Z',
    ...overrides,
  };
}

export function makeEnvelope(
  overrides: {
    items?: ClaimListItem[];
    page?: number;
    pageSize?: number;
    total?: number;
    totalPages?: number;
    freshness?: ClaimsListEnvelope['projection']['freshness'];
    generatedAt?: string;
    reason?: string;
  } = {}
): ClaimsListEnvelope {
  const items = overrides.items ?? [makeClaimItem()];
  const pageSize = overrides.pageSize ?? 10;
  const total = overrides.total ?? items.length;
  return {
    items,
    pagination: {
      page: overrides.page ?? 1,
      pageSize,
      total,
      totalPages: overrides.totalPages ?? Math.max(1, Math.ceil(total / pageSize)),
    },
    projection: {
      freshness: overrides.freshness ?? 'fresh',
      generatedAt: overrides.generatedAt ?? new Date().toISOString(),
      reason: overrides.reason,
    },
  };
}

/**
 * Minimal Response stand-in for mocking fetch in the jsdom environment,
 * which does not expose the global Response constructor. Production code
 * only consumes ok/status/json, so a structural subset is sufficient at
 * runtime; the cast satisfies the DOM typing at the spy boundary.
 */
export function makeJsonResponse(
  body: unknown,
  init: { status?: number } = {}
): Response {
  const status = init.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

/** A 2xx response whose body is not valid JSON (integrity failure). */
export function makeNonJsonResponse(status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      throw new SyntaxError('Unexpected token in JSON');
    },
  } as unknown as Response;
}

/** Deterministic fake timers-compatible clock for relative-age tests. */
export const NOW_MS = Date.parse('2026-09-24T12:00:00Z');

export function isoAgo(msAgo: number, now: number = NOW_MS): string {
  return new Date(now - msAgo).toISOString();
}

export const STATUS_CASES: Array<{ status: ClaimStatus; label: string }> = [
  { status: 'OPEN', label: 'Open' },
  { status: 'UNDER_REVIEW', label: 'Under Review' },
  { status: 'VERIFIED', label: 'Verified' },
  { status: 'REJECTED', label: 'Rejected' },
  { status: 'DISPUTED', label: 'Disputed' },
];

import { test as base, expect, type Page } from '@playwright/test';
import { seededClaims, seededClaimById } from './claims';

const STATUS_QUERY_MAP: Record<string, string> = {
  verified: 'VERIFIED',
  open: 'OPEN',
  disputed: 'DISPUTED',
  rejected: 'REJECTED',
  'under-review': 'UNDER_REVIEW',
  under_review: 'UNDER_REVIEW',
};

function json(body: unknown, status = 200) {
  return {
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  };
}

export async function stubClaimsApi(page: Page) {
  await page.route('**/api/claims/*', async (route) => {
    const id = new URL(route.request().url()).pathname.split('/').pop() ?? '';
    const claim = seededClaimById.get(id);
    await route.fulfill(claim ? json(claim) : json({ message: 'Not found' }, 404));
  });

  await page.route('**/api/claims*', async (route) => {
    const request = route.request();

    if (request.method() === 'POST') {
      const payload = request.postDataJSON() as { title?: string; description?: string };
      const now = new Date().toISOString();
      await route.fulfill(
        json(
          {
            id: 'claim-created',
            title: payload?.title ?? 'Untitled claim',
            description: payload?.description ?? '',
            claimantAddress: '0x4444444444444444444444444444444444444444',
            status: 'OPEN',
            bountyAmount: 0,
            totalStaked: 0,
            evidence: [],
            createdAt: now,
            updatedAt: now,
          },
          201,
        ),
      );
      return;
    }

    const status = new URL(request.url()).searchParams.get('status');
    if (!status) {
      await route.fulfill(json(seededClaims));
      return;
    }

    const normalised = STATUS_QUERY_MAP[status.toLowerCase()] ?? status.toUpperCase();
    await route.fulfill(json(seededClaims.filter((claim) => claim.status === normalised)));
  });
}

export const test = base.extend<{ stubbedApi: void }>({
  stubbedApi: [
    async ({ page }, use) => {
      await stubClaimsApi(page);
      await use();
    },
    { auto: true },
  ],
});

export { expect };

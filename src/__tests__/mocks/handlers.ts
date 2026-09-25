import { http, HttpResponse } from 'msw'
import { createMockClaim, createMockVerification } from '../utils/test-utils'

// ---------------------------------------------------------------------------
// Canonical reward entitlement fixtures (V2-FE-060)
// Structurally valid RawRewardEntitlement payloads used for test overrides.
// Not mock rewards — minimal well-formed inputs for validateRewardEntitlements.
// ---------------------------------------------------------------------------

export const REWARD_FIXTURES = {
  /** A single claimable verification reward entitlement. */
  verificationReward: {
    claimId: `0x${'a'.repeat(64)}`,
    category: 'verification_reward',
    amount: '1000000000000000000',
    asset: '0x1111111111111111111111111111111111111111',
    decimals: 18,
    claimable: true,
  },
  /** A non-claimable stake return (e.g. still pending finality). */
  pendingStakeReturn: {
    claimId: `0x${'b'.repeat(64)}`,
    category: 'stake_return',
    amount: '500000000000000000',
    asset: '0x1111111111111111111111111111111111111111',
    decimals: 18,
    claimable: false,
  },
  /** A claimable stake winnings entry with a different asset address. */
  stakeWinnings: {
    claimId: `0x${'c'.repeat(64)}`,
    category: 'stake_winnings',
    amount: '250000000000000000',
    asset: '0x2222222222222222222222222222222222222222',
    decimals: 18,
    claimable: true,
  },
} as const;

// MSW handlers for API mocking (v2 syntax)
export const handlers = [
  // GET /api/claims
  http.get('/api/claims', ({ request }) => {
    const url = new URL(request.url)
    const status = url.searchParams.get('status')
    
    const claims = [
      createMockClaim({ id: 'claim-1', title: 'First Claim' }),
      createMockClaim({ id: 'claim-2', title: 'Second Claim', status: 'UNDER_REVIEW' }),
      createMockClaim({ id: 'claim-3', title: 'Third Claim', status: 'VERIFIED' }),
      createMockClaim({ id: 'claim-4', title: 'Open Claim', status: 'OPEN' }),
      createMockClaim({ id: 'claim-5', title: 'Review Claim', status: 'UNDER_REVIEW' }),
      createMockClaim({ id: 'claim-6', title: 'Verified Claim', status: 'VERIFIED' }),
    ]
    
    const filteredClaims = status 
      ? claims.filter(claim => claim.status === status)
      : claims.slice(0, 3)
    
    return HttpResponse.json(filteredClaims, { status: 200 })
  }),

  // GET /api/claims/:id
  http.get('/api/claims/:claimId', ({ params }) => {
    const { claimId } = params
    return HttpResponse.json(
      createMockClaim({ id: String(claimId), title: `Claim ${claimId}` }),
      { status: 200 }
    )
  }),

  // POST /api/claims
  http.post('/api/claims', async ({ request }) => {
    const body = await request.json() as { title: string; description: string }
    return HttpResponse.json(
      createMockClaim({
        id: 'new-claim',
        title: body.title,
        description: body.description,
        status: 'OPEN',
      }),
      { status: 201 }
    )
  }),

  // POST /api/verifications
  http.post('/api/verifications', async ({ request }) => {
    const body = await request.json() as { claimId: string; decision: string }
    return HttpResponse.json(
      createMockVerification({
        id: 'new-verification',
        claimId: body.claimId,
        decision: body.decision.toUpperCase(),
        status: 'PENDING',
      }),
      { status: 201 }
    )
  }),

  // GET /api/user/:userId/reputation
  http.get('/api/user/:userId/reputation', ({ params }) => {
    const { userId } = params
    return HttpResponse.json({
      userId: String(userId),
      reputation: 50,
      isVerified: true,
      accountAgeDays: 30,
      suspicious: false,
    }, { status: 200 })
  }),

  // GET /api/leaderboard
  http.get('/api/leaderboard', () => {
    return HttpResponse.json([
      {
        rank: 1,
        userId: 'user-1',
        username: 'Academic Consortium',
        totalVerifications: 10,
        accuracy: 98.2,
        totalStaked: 12400,
        totalEarned: 850,
      },
      {
        rank: 2,
        userId: 'user-2',
        username: 'News Alliance',
        totalVerifications: 8,
        accuracy: 96.8,
        totalStaked: 8200,
        totalEarned: 620,
      },
      {
        rank: 3,
        userId: 'user-3',
        username: 'Data Science Labs',
        totalVerifications: 6,
        accuracy: 97.5,
        totalStaked: 6100,
        totalEarned: 480,
      },
    ], { status: 200 })
  }),

  // ---------------------------------------------------------------------------
  // GET /api/rewards — V2-FE-060
  // Returns an empty entitlement list for any well-formed address by default.
  // Individual tests override this handler with server.use() to inject data.
  // ---------------------------------------------------------------------------
  http.get('/api/rewards', ({ request }) => {
    const url = new URL(request.url)
    const user = url.searchParams.get('user')

    // Mirror the route handler's address validation.
    if (!user || !/^0x[a-fA-F0-9]{40}$/.test(user)) {
      return HttpResponse.json(
        { error: 'Missing or invalid `user` address parameter.' },
        { status: 400 },
      )
    }

    // Default: no entitlements. Tests override with server.use().
    return HttpResponse.json([], { status: 200 })
  }),

  // Error handlers
  http.get('/api/claims/error', () => {
    return HttpResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }),

  http.post('/api/claims/error', () => {
    return HttpResponse.json({ error: 'Bad Request' }, { status: 400 })
  }),
]

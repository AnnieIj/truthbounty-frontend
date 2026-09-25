// src/app/queries/queryKeys.ts

export const queryKeys = {
  claims: {
    all: ['claims'] as const,
    detail: (claimId: string) => ['claims', claimId] as const,
    byStatus: (status: string) => ['claims', 'status', status] as const,
    /** Canonical paginated projection read path (V2-FE-109). */
    list: (params: unknown) => ['claims', 'list', params] as const,
  },
  verifications: {
    all: ['verifications'] as const,
    byClaim: (claimId: string) => ['verifications', 'claim', claimId] as const,
    byUser: (userId: string) => ['verifications', 'user', userId] as const,
  },
  disputes: {
    all: ['disputes'] as const,
    byClaim: (claimId: string) => ['disputes', 'claim', claimId] as const,
    detail: (disputeId: string) => ['disputes', disputeId] as const,
  },
  leaderboard: ['leaderboard'] as const,
  user: {
    profile: (userId: string) => ['user', userId] as const,
    reputation: (userId: string) => ['user', userId, 'reputation'] as const,
    verification: (userId: string) => ['user', userId, 'verification'] as const,
  },
  freshness: {
    all: ['api', 'freshness'] as const,
    data: ['api', 'freshness', 'data'] as const,
    degraded: ['api', 'freshness', 'degraded'] as const,
    dependencies: ['api', 'freshness', 'dependencies'] as const,
  },
};

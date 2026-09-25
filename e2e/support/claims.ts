import type { Claim } from '../../src/app/types/claim';

export const seededClaims: Claim[] = [
  {
    id: 'claim-001',
    title: 'Global average temperatures increased by 1.1°C since pre-industrial times',
    description: 'Synthesis of instrumental temperature records since 1850.',
    category: 'Climate',
    claimantAddress: '0x1111111111111111111111111111111111111111',
    status: 'VERIFIED',
    bountyAmount: 45200,
    totalStaked: 45200,
    evidence: [
      {
        id: 'evidence-001',
        type: 'link',
        value: 'https://www.ipcc.ch/report/ar6/syr/',
        createdAt: '2024-01-01T00:00:00.000Z',
      },
    ],
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-02T00:00:00.000Z',
  },
  {
    id: 'claim-002',
    title: 'New vaccine shows 95% efficacy in Phase 3 trials',
    description: 'Randomised controlled trial across 21 sites.',
    category: 'Health',
    claimantAddress: '0x2222222222222222222222222222222222222222',
    status: 'VERIFIED',
    bountyAmount: 38600,
    totalStaked: 38600,
    evidence: [],
    createdAt: '2024-01-03T00:00:00.000Z',
    updatedAt: '2024-01-04T00:00:00.000Z',
  },
  {
    id: 'claim-003',
    title: 'Tech company achieved quantum supremacy milestone',
    description: 'Vendor benchmark pending independent replication.',
    category: 'Technology',
    claimantAddress: '0x3333333333333333333333333333333333333333',
    status: 'UNDER_REVIEW',
    bountyAmount: 12000,
    totalStaked: 9000,
    evidence: [],
    createdAt: '2024-01-05T00:00:00.000Z',
    updatedAt: '2024-01-06T00:00:00.000Z',
  },
];

export const seededClaimById = new Map(seededClaims.map((claim) => [claim.id, claim]));

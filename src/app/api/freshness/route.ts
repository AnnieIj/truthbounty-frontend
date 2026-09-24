import { NextResponse } from 'next/server';
import type { ApiHealthResponse, DependencyHealth, DependencyStatus } from '@/app/types/api-freshness';

// In production, this would:
// 1. Query the indexer for latest indexed block
// 2. Query the chain RPC for latest finalized block
// 3. Check dependency health (RPC, subgraph, websocket, etc.)
// 4. Calculate lag and degradation status

const MOCK_CHAIN_HEAD = 12_345_678;
const MOCK_INDEXED_HEIGHT = 12_345_650;
const MOCK_FINALIZED_HEIGHT = 12_345_600;

function getMockDependencyHealth(): DependencyHealth[] {
  const now = new Date().toISOString();
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  return [
    {
      name: 'indexer',
      status: 'healthy',
      lastSuccessfulUpdate: now,
      latencyMs: 45,
    },
    {
      name: 'rpc_provider',
      status: 'healthy',
      lastSuccessfulUpdate: now,
      latencyMs: 120,
    },
    {
      name: 'contract_registry',
      status: 'healthy',
      lastSuccessfulUpdate: now,
      latencyMs: 30,
    },
    {
      name: 'websocket',
      status: 'healthy',
      lastSuccessfulUpdate: fiveMinutesAgo,
      latencyMs: 15,
    },
    {
      name: 'subgraph',
      status: 'degraded',
      lastSuccessfulUpdate: oneHourAgo,
      error: 'Subgraph sync lag detected',
      latencyMs: 2500,
    },
  ];
}

function calculateDegradedState(
  lag: number,
  dependencies: DependencyHealth[]
): ApiHealthResponse['degradedState'] {
  const hasDegradedDeps = dependencies.some((d) => d.status === 'degraded');
  const hasUnavailableDeps = dependencies.some((d) => d.status === 'unavailable');
  const criticalLag = lag > 500;

  if (criticalLag || hasUnavailableDeps) {
    return {
      isDegraded: true,
      degradationReason: criticalLag ? 'indexer_lag' : 'dependency_failure',
      affectedDependencies: dependencies
        .filter((d) => d.status !== 'healthy')
        .map((d) => d.name),
      lastHealthyUpdate: dependencies.find((d) => d.status === 'healthy')?.lastSuccessfulUpdate,
      estimatedRecovery: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    };
  }

  if (lag > 100 || hasDegradedDeps) {
    return {
      isDegraded: true,
      degradationReason: lag > 100 ? 'indexer_lag' : 'dependency_failure',
      affectedDependencies: dependencies
        .filter((d) => d.status !== 'healthy')
        .map((d) => d.name),
      lastHealthyUpdate: dependencies.find((d) => d.status === 'healthy')?.lastSuccessfulUpdate,
      estimatedRecovery: new Date(Date.now() + 2 * 60 * 1000).toISOString(),
    };
  }

  if (lag > 50) {
    return {
      isDegraded: true,
      degradationReason: 'stale_data',
      affectedDependencies: ['indexer'],
      lastHealthyUpdate: dependencies.find((d) => d.status === 'healthy')?.lastSuccessfulUpdate,
    };
  }

  return {
    isDegraded: false,
    affectedDependencies: [],
    lastHealthyUpdate: now,
  };
}

const now = new Date().toISOString();
const lag = MOCK_CHAIN_HEAD - MOCK_INDEXED_HEIGHT;
const dependencies = getMockDependencyHealth();

const MOCK_RESPONSE: ApiHealthResponse = {
  freshness: {
    indexedHeight: MOCK_INDEXED_HEIGHT,
    finalizedHeight: MOCK_FINALIZED_HEIGHT,
    lastUpdate: now,
    lag,
    chainHeadHeight: MOCK_CHAIN_HEAD,
    dependencies,
  },
  degradedState: calculateDegradedState(lag, dependencies),
  fetchedAt: now,
};

export async function GET() {
  // Simulate network latency
  await new Promise((resolve) => setTimeout(resolve, 50));

  // In production, validate chain ID from request headers or query params
  // const chainId = parseInt(request.headers.get('x-chain-id') || '11155420', 10);

  return NextResponse.json(MOCK_RESPONSE, {
    headers: {
      'Cache-Control': 'no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
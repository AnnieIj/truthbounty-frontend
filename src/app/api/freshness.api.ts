// src/app/api/freshness.api.ts

import type { ApiHealthResponse } from '@/app/types/api-freshness';

export async function fetchApiHealth(): Promise<ApiHealthResponse> {
  const res = await fetch('/api/freshness', {
    // No cache - we always want fresh data
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => 'Unknown error');
    throw new Error(`Failed to fetch API health: ${res.status} ${errorText}`);
  }

  return res.json();
}
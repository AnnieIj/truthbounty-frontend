/**
 * GET /api/rewards — V2-FE-060
 *
 * Proxy route for the V2-BE-017 reward entitlement projection endpoint.
 *
 * Security invariants:
 *  - `user` query parameter is validated as a well-formed EVM address before
 *    forwarding. Requests with a missing or malformed address fail closed
 *    with 400 — never forwarded with unsanitised input.
 *  - The downstream backend URL is read from the server-side env variable
 *    `BACKEND_API_URL` only; it is never derived from request data.
 *  - Error details from the upstream backend are not forwarded to the client
 *    to avoid information leakage (a sanitised 502 is returned instead).
 *  - No reward fabrication, no amount invention, no hash generation.
 *  - No Stellar/Soroban/Freighter/mock-wallet/simulator dependencies.
 */

import { NextRequest, NextResponse } from 'next/server';
import { isAddress } from 'viem';

/** EVM address pattern: 0x + 40 hex chars (case-insensitive). */
const EVM_ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;

function isValidEvmAddress(value: string | null): value is string {
  if (!value) return false;
  return EVM_ADDRESS_PATTERN.test(value);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = request.nextUrl;
  const user = searchParams.get('user');

  // Fail closed: require a valid EVM address before forwarding anything.
  if (!isValidEvmAddress(user) || !isAddress(user)) {
    return NextResponse.json(
      { error: 'Missing or invalid `user` address parameter.' },
      { status: 400 },
    );
  }

  const backendUrl = process.env.BACKEND_API_URL;

  if (!backendUrl) {
    return NextResponse.json(
      { error: 'Reward projection service is not configured.' },
      { status: 503 },
    );
  }

  try {
    const upstreamUrl = new URL(
      `/api/v2/rewards/entitlements?user=${encodeURIComponent(user)}`,
      backendUrl,
    );

    const response = await fetch(upstreamUrl.toString(), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        // Forward the caller's authorization token when present, so the
        // backend can validate the SIWE session for the requested address.
        ...(request.headers.get('authorization')
          ? { Authorization: request.headers.get('authorization') as string }
          : {}),
      },
      // 10-second upstream timeout. Node 18+ fetch supports AbortSignal.timeout.
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      // Do not leak upstream error bodies to the client.
      console.error(
        `[GET /api/rewards] upstream returned ${response.status} for user ${user.slice(0, 10)}…`,
      );
      return NextResponse.json(
        { error: 'Reward projection service is temporarily unavailable.' },
        { status: 502 },
      );
    }

    // Forward the raw JSON payload unchanged. All validation happens in the
    // client's `validateRewardEntitlements` — never coerce here.
    const data: unknown = await response.json();
    return NextResponse.json(data, { status: 200 });
  } catch (err: unknown) {
    // Network or timeout failures — sanitised error, no upstream details.
    const isTimeout =
      err instanceof Error &&
      (err.name === 'TimeoutError' || err.name === 'AbortError');
    console.error(
      `[GET /api/rewards] upstream fetch failed for user ${user.slice(0, 10)}…:`,
      isTimeout ? 'timeout' : 'network error',
    );
    return NextResponse.json(
      {
        error: isTimeout
          ? 'Reward projection service timed out.'
          : 'Failed to reach the reward projection service.',
      },
      { status: 502 },
    );
  }
}

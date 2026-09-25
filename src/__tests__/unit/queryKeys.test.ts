/**
 * Unit tests for V2-FE-063 query key factories.
 * Covers chain, wallet, claim, projection watermark, filters, finality,
 * collision resistance, and fail-closed wallet scope normalization.
 */

import {
  chainKeys,
  claimKeys,
  filterKeys,
  finalityKeys,
  normalizeAddress,
  projectionWatermarkKeys,
  queryKeys,
  walletKeys,
  walletScope,
} from '@/app/queries/queryKeys';

describe('normalizeAddress / walletScope', () => {
  it('normalizes valid addresses to lowercase', () => {
    expect(normalizeAddress('0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD')).toBe(
      '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
    );
  });

  it('fails closed on malformed addresses', () => {
    expect(normalizeAddress(undefined)).toBeNull();
    expect(normalizeAddress('')).toBeNull();
    expect(normalizeAddress('not-an-address')).toBeNull();
    expect(normalizeAddress('0x123')).toBeNull();
  });

  it('fails closed on unsupported chain ids', () => {
    expect(walletScope('0xabcdefabcdefabcdefabcdefabcdefabcdefabcd', 0)).toBeNull();
    expect(walletScope('0xabcdefabcdefabcdefabcdefabcdefabcdefabcd', -1)).toBeNull();
    expect(walletScope('0xabcdefabcdefabcdefabcdefabcdefabcdefabcd', 1.5)).toBeNull();
    expect(walletScope('bad', 10)).toBeNull();
  });

  it('returns normalized scope for valid inputs', () => {
    expect(walletScope('0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD', 10)).toEqual({
      address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
      chainId: 10,
    });
  });
});

describe('chainKeys', () => {
  it('exposes a stable root', () => {
    expect(chainKeys.all).toEqual(['chain']);
  });

  it('scopes config/status/block by chainId and tag', () => {
    expect(chainKeys.config(10)).toEqual(['chain', 'config', 10]);
    expect(chainKeys.status(11155420)).toEqual(['chain', 'status', 11155420]);
    expect(chainKeys.block(10, 'finalized')).toEqual(['chain', 'block', 10, 'finalized']);
  });

  it('does not collide across tags for the same chain', () => {
    expect(JSON.stringify(chainKeys.block(10, 'safe'))).not.toBe(
      JSON.stringify(chainKeys.block(10, 'finalized')),
    );
  });
});

describe('walletKeys', () => {
  const addr = '0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD';
  const normalized = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';

  it('scopes balance by normalized address + chainId', () => {
    expect(walletKeys.balance(addr, 10)).toEqual(['wallet', 'balance', normalized, 10]);
  });

  it('isolates the same address across chains', () => {
    expect(JSON.stringify(walletKeys.balance(addr, 10))).not.toBe(
      JSON.stringify(walletKeys.balance(addr, 11155420)),
    );
  });

  it('isolates different addresses on the same chain', () => {
    const other = '0x0000000000000000000000000000000000000001';
    expect(JSON.stringify(walletKeys.scope(addr, 10))).not.toBe(
      JSON.stringify(walletKeys.scope(other, 10)),
    );
  });

  it('fail-closed invalid scope does not look like a real address key', () => {
    expect(walletKeys.balance('nope', 10)).toEqual(['wallet', 'balance', 'invalid']);
  });

  it('tokenBalance and allowance include token/spender discriminants', () => {
    const token = '0x1111111111111111111111111111111111111111';
    const spender = '0x2222222222222222222222222222222222222222';
    expect(walletKeys.tokenBalance(addr, token, 10)).toEqual([
      'wallet',
      'token',
      normalized,
      token,
      10,
    ]);
    expect(walletKeys.allowance(addr, spender, token, 10)[0]).toBe('wallet');
    expect(walletKeys.allowance(addr, spender, token, 10)).toContain(normalized);
  });
});

describe('claimKeys', () => {
  it('preserves legacy detail shape', () => {
    expect(claimKeys.detail('claim-1')).toEqual(['claims', 'claim-1']);
  });

  it('encodes list filters to prevent filter collisions', () => {
    const a = claimKeys.list({ status: 'OPEN' });
    const b = claimKeys.list({ status: 'CLOSED' });
    expect(a).toEqual(['claims', 'list', { status: 'OPEN' }]);
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });

  it('wallet-scoped index is chain aware', () => {
    const addr = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';
    expect(claimKeys.byWallet(addr, 10)).toEqual(['claims', 'wallet', addr, 10]);
    expect(JSON.stringify(claimKeys.byWallet(addr, 10))).not.toBe(
      JSON.stringify(claimKeys.byWallet(addr, 11155420)),
    );
  });

  it('finality key does not collide with detail', () => {
    expect(JSON.stringify(claimKeys.finality('claim-1', 10))).not.toBe(
      JSON.stringify(claimKeys.detail('claim-1')),
    );
  });
});

describe('projectionWatermarkKeys', () => {
  it('scopes by chain and namespace', () => {
    expect(projectionWatermarkKeys.byChain(10)).toEqual([
      'projectionWatermark',
      'chain',
      10,
    ]);
    expect(projectionWatermarkKeys.byNamespace('claims', 10)).toEqual([
      'projectionWatermark',
      'claims',
      10,
    ]);
    expect(projectionWatermarkKeys.entity('claims', 'c1', 10)).toEqual([
      'projectionWatermark',
      'claims',
      'c1',
      10,
    ]);
  });

  it('entity keys do not collide with namespace keys', () => {
    expect(
      JSON.stringify(projectionWatermarkKeys.entity('claims', 'c1', 10)),
    ).not.toBe(JSON.stringify(projectionWatermarkKeys.byNamespace('claims', 10)));
  });
});

describe('filterKeys', () => {
  it('keeps claim filter keys distinct by filter object', () => {
    expect(JSON.stringify(filterKeys.claims({ status: 'OPEN' }))).not.toBe(
      JSON.stringify(filterKeys.claims({ status: 'CLOSED' })),
    );
  });

  it('activity filters are wallet scoped', () => {
    const addr = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';
    expect(filterKeys.activity(addr, { page: 1 })).toEqual([
      'filters',
      'activity',
      addr,
      { page: 1 },
    ]);
  });
});

describe('finalityKeys', () => {
  it('scopes tx finality by hash + chain', () => {
    expect(finalityKeys.byTx('0xAbC', 10)).toEqual(['finality', 'tx', '0xabc', 10]);
  });

  it('entity and level keys are distinct', () => {
    expect(JSON.stringify(finalityKeys.byEntity('claim', 'c1', 10))).not.toBe(
      JSON.stringify(finalityKeys.level('claim', 'c1', 10)),
    );
  });
});

describe('queryKeys unified export', () => {
  it('exposes V2-FE-063 factories', () => {
    expect(queryKeys.chain).toBe(chainKeys);
    expect(queryKeys.wallet).toBe(walletKeys);
    expect(queryKeys.claims).toBe(claimKeys);
    expect(queryKeys.projectionWatermark).toBe(projectionWatermarkKeys);
    expect(queryKeys.filters).toBe(filterKeys);
    expect(queryKeys.finality).toBe(finalityKeys);
  });

  it('preserves legacy leaderboard + user roots', () => {
    expect(queryKeys.leaderboard).toEqual(['leaderboard']);
    expect(queryKeys.user.profile('u1')).toEqual(['user', 'u1']);
  });
});

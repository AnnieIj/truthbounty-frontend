import assert from 'node:assert/strict';
import test from 'node:test';
import { checkMaintainerApproval } from '../../.github/scripts/pr-guardian.mjs';

test('(a) Sensitive file changed, 0 reviews -> returns {ok:false}', () => {
  const result = checkMaintainerApproval({
    changedFiles: ['src/lib/contracts/load-artifacts.ts'],
    reviews: [],
  });
  assert.equal(result.ok, false);
  assert.ok(result.reason && result.reason.length > 0);
  assert.match(result.reason, /load-artifacts\.ts/);
  assert.match(result.reason, /maintainer approval/i);
});

test('(b) Sensitive file changed, 1 APPROVED review from user in MAINTAINER_ALLOWLIST_LOGINS -> ok=true', () => {
  const previous = process.env.MAINTAINER_ALLOWLIST_LOGINS;
  try {
    process.env.MAINTAINER_ALLOWLIST_LOGINS = 'alice,bob';
    const result = checkMaintainerApproval({
      changedFiles: ['src/lib/contracts/load-artifacts.ts'],
      reviews: [
        { user: { login: 'alice' }, state: 'APPROVED' },
      ],
    });
    assert.equal(result.ok, true);
    assert.equal(result.reason, undefined);
  } finally {
    if (previous === undefined) {
      delete process.env.MAINTAINER_ALLOWLIST_LOGINS;
    } else {
      process.env.MAINTAINER_ALLOWLIST_LOGINS = previous;
    }
  }
});

test('(c) Non-sensitive file changed, 0 reviews -> ok=true', () => {
  const result = checkMaintainerApproval({
    changedFiles: ['src/components/home/Header.tsx'],
    reviews: [],
  });
  assert.equal(result.ok, true);
  assert.equal(result.reason, undefined);
});

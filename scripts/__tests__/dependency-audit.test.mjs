import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { runAudit, isAllowlisted, loadAllowlist, extractAdvisories } from '../dependency-audit.mjs';

function makeTempProject() {
  const dir = mkdtempSync(join(tmpdir(), 'truthbounty-audit-'));
  mkdirSync(join(dir, '.github'), { recursive: true });
  return dir;
}

function cleanup(dir) {
  rmSync(dir, { recursive: true, force: true });
}

function mockExecFn(auditJson) {
  return async (_cmd, _args, _opts) => ({
    stdout: JSON.stringify(auditJson),
    stderr: '',
  });
}

function captureConsole(fn) {
  const logs = [];
  const errors = [];
  const origLog = console.log;
  const origError = console.error;
  const origExitCode = process.exitCode;
  console.log = (...args) => logs.push(args.join(' '));
  console.error = (...args) => errors.push(args.join(' '));
  process.exitCode = 0;
  try {
    fn();
    return { logs, errors, exitCode: process.exitCode };
  } finally {
    console.log = origLog;
    console.error = origError;
    process.exitCode = origExitCode;
  }
}

const LEGACY_HIGH_999 = {
  advisories: {
    '999': {
      severity: 'high',
      title: 'Prototype pollution in example-lib',
    },
  },
};

const MODERN_HIGH_999 = {
  data: {
    vulnerabilities: [
      {
        advisory: {
          ghsa_id: '999',
          severity: 'high',
          title: 'Prototype pollution in example-lib',
        },
      },
    ],
  },
};

test('(a) legacy format: no allowlist, high severity -> exit 1, output contains advisory id', async () => {
  const dir = makeTempProject();
  try {
    const { failing, allowlistedCount } = await runAudit({
      execFn: mockExecFn(LEGACY_HIGH_999),
      projectRoot: dir,
    });
    assert.equal(failing.length, 1);
    assert.equal(failing[0].id, '999');
    assert.equal(failing[0].severity, 'high');
    assert.equal(allowlistedCount, 0);

    const { errors, exitCode } = captureConsole(() => {
      if (failing.length > 0) {
        console.error(`Dependency audit failed with ${failing.length} advisory(ies):`);
        for (const adv of failing) {
          console.error(`  - [${adv.severity}] ${adv.id}: ${adv.title}`);
        }
        process.exitCode = 1;
      } else {
        console.log(`Dependency audit passed (${allowlistedCount} allowlisted)`);
      }
    });
    assert.equal(exitCode, 1);
    assert.match(errors.join('\n'), /999/);
  } finally {
    cleanup(dir);
  }
});

test('(b) modern format: allowlist id=999 expiresAt=null -> exit 0, audit passed', async () => {
  const dir = makeTempProject();
  try {
    writeFileSync(
      join(dir, '.github', 'dependency-audit-allowlist.json'),
      JSON.stringify({
        advisories: [{ id: '999', reason: 'Test allowlist', expiresAt: null }],
      })
    );

    const { failing, allowlistedCount } = await runAudit({
      execFn: mockExecFn(MODERN_HIGH_999),
      projectRoot: dir,
    });
    assert.equal(failing.length, 0);
    assert.equal(allowlistedCount, 1);

    const { logs, exitCode } = captureConsole(() => {
      if (failing.length > 0) {
        console.error(`Dependency audit failed with ${failing.length} advisory(ies):`);
        for (const adv of failing) {
          console.error(`  - [${adv.severity}] ${adv.id}: ${adv.title}`);
        }
        process.exitCode = 1;
      } else {
        console.log(`Dependency audit passed (${allowlistedCount} allowlisted)`);
      }
    });
    assert.equal(exitCode, 0);
    assert.match(logs.join('\n'), /Dependency audit passed/);
  } finally {
    cleanup(dir);
  }
});

test('(c) allowlist entry with past expiresAt -> entry rejected, still fails', async () => {
  const dir = makeTempProject();
  try {
    const pastDate = new Date('2020-01-01T00:00:00Z').toISOString();
    writeFileSync(
      join(dir, '.github', 'dependency-audit-allowlist.json'),
      JSON.stringify({
        advisories: [{ id: '999', reason: 'Expired allowlist', expiresAt: pastDate }],
      })
    );

    const allowlist = loadAllowlist(dir);
    const now = new Date('2025-06-01T00:00:00Z');
    assert.equal(isAllowlisted('999', allowlist, now), false);

    const { failing, allowlistedCount } = await runAudit({
      execFn: mockExecFn(LEGACY_HIGH_999),
      projectRoot: dir,
      now,
    });
    assert.equal(failing.length, 1);
    assert.equal(failing[0].id, '999');
    assert.equal(allowlistedCount, 0);

    const { errors, exitCode } = captureConsole(() => {
      if (failing.length > 0) {
        console.error(`Dependency audit failed with ${failing.length} advisory(ies):`);
        for (const adv of failing) {
          console.error(`  - [${adv.severity}] ${adv.id}: ${adv.title}`);
        }
        process.exitCode = 1;
      } else {
        console.log(`Dependency audit passed (${allowlistedCount} allowlisted)`);
      }
    });
    assert.equal(exitCode, 1);
    assert.match(errors.join('\n'), /999/);
  } finally {
    cleanup(dir);
  }
});

test('extractAdvisories supports both legacy and modern shapes', () => {
  const fromLegacy = extractAdvisories(LEGACY_HIGH_999);
  assert.equal(fromLegacy.length, 1);
  assert.equal(fromLegacy[0].id, '999');
  assert.equal(fromLegacy[0].severity, 'high');

  const fromModern = extractAdvisories(MODERN_HIGH_999);
  assert.equal(fromModern.length, 1);
  assert.equal(fromModern[0].id, '999');
  assert.equal(fromModern[0].severity, 'high');
});

test('critical severity is also failing', async () => {
  const dir = makeTempProject();
  try {
    const criticalAudit = {
      advisories: {
        '500': { severity: 'critical', title: 'Remote code execution' },
        '100': { severity: 'moderate', title: 'Minor info leak' },
      },
    };
    const { failing, remaining } = await runAudit({
      execFn: mockExecFn(criticalAudit),
      projectRoot: dir,
    });
    assert.equal(failing.length, 1);
    assert.equal(failing[0].id, '500');
    assert.equal(remaining.length, 2);
  } finally {
    cleanup(dir);
  }
});

test('missing allowlist file treated as empty', async () => {
  const dir = makeTempProject();
  try {
    const allowlist = loadAllowlist(dir);
    assert.deepEqual(allowlist.advisories, []);
  } finally {
    cleanup(dir);
  }
});

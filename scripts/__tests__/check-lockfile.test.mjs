import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync, copyFileSync, openSync, writeSync, closeSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { sha256File } from '../check-lockfile.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Z]:\/)/, '$1');
const REAL_LOCKFILE = join(PROJECT_ROOT, 'pnpm-lock.yaml');
const SCRIPT_PATH = join(PROJECT_ROOT, 'scripts', 'check-lockfile.mjs');

function makeTempDir() {
  return mkdtempSync(join(tmpdir(), 'truthbounty-lockfile-'));
}

function cleanup(dir) {
  rmSync(dir, { recursive: true, force: true });
}

function runScript(args) {
  const result = spawnSync(process.execPath, [SCRIPT_PATH, ...args], {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
  });
  return {
    exitCode: result.status ?? (result.error ? 1 : 0),
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

function mutateFileAtOffset(filePath, offset, byteValue) {
  const fd = openSync(filePath, 'r+');
  try {
    const buf = Buffer.from([byteValue]);
    writeSync(fd, buf, 0, 1, offset);
  } finally {
    closeSync(fd);
  }
}

test('(a) SHA mode: mutated lockfile → exit 1 with SHA mismatch message', () => {
  const tempDir = makeTempDir();
  try {
    const unchangedCopy = join(tempDir, 'pnpm-lock-original.yaml');
    const mutatedCopy = join(tempDir, 'pnpm-lock-mutated.yaml');

    copyFileSync(REAL_LOCKFILE, unchangedCopy);
    copyFileSync(REAL_LOCKFILE, mutatedCopy);

    const originalSha = sha256File(unchangedCopy);

    const randomByte = Math.floor(Math.random() * 256);
    mutateFileAtOffset(mutatedCopy, 100, randomByte);

    const result = runScript(['--before', originalSha, '--after-path', mutatedCopy]);

    assert.equal(result.exitCode, 1, `Expected exit 1, got ${result.exitCode}. Stderr: ${result.stderr}`);
    assert.match(
      (result.stdout + result.stderr),
      /sha.*mismatch|Unexpected pnpm-lock/i,
      `Expected SHA mismatch or lockfile error in output. Got: ${result.stdout} ${result.stderr}`
    );
  } finally {
    cleanup(tempDir);
  }
});

test('(b) SHA mode: unchanged lockfile → exit 0 with OK message', () => {
  const tempDir = makeTempDir();
  try {
    const unchangedCopy = join(tempDir, 'pnpm-lock-copy.yaml');
    copyFileSync(REAL_LOCKFILE, unchangedCopy);

    const originalSha = sha256File(unchangedCopy);

    const result = runScript(['--before', originalSha, '--after-path', unchangedCopy]);

    assert.equal(result.exitCode, 0, `Expected exit 0, got ${result.exitCode}. Stderr: ${result.stderr}`);
    assert.match(
      (result.stdout + result.stderr),
      /integrity OK/i,
      `Expected integrity OK in output. Got: ${result.stdout} ${result.stderr}`
    );
  } finally {
    cleanup(tempDir);
  }
});

test('sha256File produces consistent hex digests for identical content', () => {
  const tempDir = makeTempDir();
  try {
    const a = join(tempDir, 'a.bin');
    const b = join(tempDir, 'b.bin');
    const content = Buffer.from('truthbounty-lockfile-integrity-test-payload');
    writeFileSync(a, content);
    writeFileSync(b, content);
    assert.equal(sha256File(a), sha256File(b));
    assert.match(sha256File(a), /^[0-9a-f]{64}$/);
  } finally {
    cleanup(tempDir);
  }
});

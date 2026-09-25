import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawnSync } from 'child_process';

const SCRIPT_PATH = join(process.cwd(), 'scripts', 'secret-scan.mjs');

function makeTempRoot() {
  return mkdtempSync(join(tmpdir(), 'truthbounty-secret-scan-'));
}

function runScan(root, dirs) {
  const args = [SCRIPT_PATH, ...dirs];
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return result;
}

function writeSubFile(root, subPath, contents) {
  const fullPath = join(root, subPath);
  const dir = fullPath.slice(0, Math.max(0, fullPath.lastIndexOf('/'), fullPath.lastIndexOf('\\')));
  if (dir) mkdirSync(dir, { recursive: true });
  writeFileSync(fullPath, contents);
}

test('scenario a: EVM private key in src/bad.js -> non-zero exit', () => {
  const root = makeTempRoot();
  try {
    writeSubFile(root, 'src/bad.js', 'const key = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";\n');
    const result = runScan(root, ['src']);
    assert.notEqual(result.status, 0, 'expected non-zero exit code when EVM key present');
    assert.match(result.stderr, /EVM_PRIVATE_KEY/);
    assert.match(result.stderr, /src[\/\\]bad\.js:/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('scenario b: allow comment on line before EVM key -> exit 0', () => {
  const root = makeTempRoot();
  try {
    const contents = [
      '// secret-scan-allow: test fixture',
      'const key = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";',
      '',
    ].join('\n');
    writeSubFile(root, 'src/bad.js', contents);
    const result = runScan(root, ['src']);
    assert.equal(result.status, 0, 'expected zero exit when allow comment precedes match');
    assert.doesNotMatch(result.stderr, /EVM_PRIVATE_KEY/);
    assert.match(result.stdout, /Secret scan passed/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('scenario c: sk_live token in release/test.json -> non-zero exit', () => {
  const root = makeTempRoot();
  try {
    writeSubFile(root, 'release/test.json', JSON.stringify({ token: 'sk' + '_live' + '_abcdefghijklmnopqrstuvwxyz' }));
    const result = runScan(root, ['release']);
    assert.notEqual(result.status, 0, 'expected non-zero exit when sk_live token present');
    assert.match(result.stderr, /STRIPE_TOKEN/);
    assert.match(result.stderr, /release[\/\\]test\.json:/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('scenario d: NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID with "secret" on same line -> non-zero exit', () => {
  const root = makeTempRoot();
  try {
    writeSubFile(root, 'src/env.js', 'const NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID = "this is a secret value";\n');
    const result = runScan(root, ['src']);
    assert.notEqual(result.status, 0, 'expected non-zero exit when NEXT_PUBLIC + sensitive substring on same line');
    assert.match(result.stderr, /NEXT_PUBLIC_SUSPICIOUS/);
    assert.match(result.stderr, /src[\/\\]env\.js:/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('scenario e: benign src/good.ts with no secrets -> exit 0', () => {
  const root = makeTempRoot();
  try {
    const contents = [
      'export function add(a: number, b: number): number {',
      '  return a + b;',
      '}',
      '',
      'export const GREETING = "hello world";',
      '',
    ].join('\n');
    writeSubFile(root, 'src/good.ts', contents);
    const result = runScan(root, ['src']);
    assert.equal(result.status, 0, 'expected zero exit for clean file');
    assert.match(result.stdout, /Secret scan passed/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

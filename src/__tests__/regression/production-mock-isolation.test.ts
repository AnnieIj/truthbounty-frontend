/**
 * V2-FE-044 — Production bundle mock / simulator isolation.
 *
 * Acceptance: "No production bundle imports mocks or simulators."
 * Test doubles must remain confined to the test harness (`src/__tests__/`).
 */

import * as fs from 'fs';
import * as path from 'path';

const SRC_ROOT = path.resolve(__dirname, '../..');
const TEST_ROOT = path.join(SRC_ROOT, '__tests__');

/** Files that are allowed to reference mock fixtures (harness / docs / demos). */
const ALLOWED_MOCK_PATH_PREFIXES = [
  path.join(SRC_ROOT, '__tests__'),
  path.join(SRC_ROOT, 'stories'),
  path.join(SRC_ROOT, 'data', 'mock-data.ts'),
];

/** Production modules that must never be imported by production code. */
const FORBIDDEN_PRODUCTION_IMPORTS = [
  /from\s+['"]@\/__tests__\//,
  /from\s+['"]\.\.\/.*__tests__\//,
  /from\s+['"]msw['"]/,
  /from\s+['"]msw\/node['"]/,
  /require\(['"]msw['"]\)/,
  /from\s+['"]@\/__tests__\/mocks/,
  /mock-wagmi/,
  /setupMockServer/,
];

/** Lifecycle production modules that must not import demo/mock fixtures. */
const LIFECYCLE_PATH_FRAGMENTS = [
  path.join('hooks', 'useRewards.ts'),
  path.join('hooks', 'useClaimCreationTransaction.ts'),
  path.join('hooks', 'useEvidenceRegistration.ts'),
  path.join('hooks', 'useVerificationSubmission.ts'),
  path.join('hooks', 'useSettlement'),
  path.join('hooks', 'useDispute'),
  path.join('hooks', 'useAppeal'),
  path.join('hooks', 'useFinalization'),
  path.join('hooks', 'useStateReconciliation.ts'),
  path.join('hooks', 'useTransactionMachine.ts'),
  path.join('hooks', 'useEvmTransaction.ts'),
  path.join('hooks', 'useReceiptProjection.ts'),
  path.join('hooks', 'usePendingTransactions.ts'),
  path.join('lib', 'transaction-machine'),
  path.join('lib', 'transaction-state.ts'),
  path.join('lib', 'pending-transactions.ts'),
  path.join('lib', 'transaction-simulator.ts'),
  path.join('app', 'lib', 'verification-reconcile.ts'),
  path.join('app', 'lib', 'wallet.ts'),
  path.join('app', 'queries'),
  path.join('components', 'transactions'),
];

const MOCK_FIXTURE_IMPORT = /from\s+['"]@\/data\/mock-data['"]/;

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.next') continue;
      walk(full, acc);
    } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
      acc.push(full);
    }
  }
  return acc;
}

function isAllowed(file: string): boolean {
  if (
    file.includes(`${path.sep}__tests__${path.sep}`) ||
    file.includes(`${path.sep}tests${path.sep}`) ||
    /\.(test|spec)\.(ts|tsx|js|jsx)$/.test(file)
  ) {
    return true;
  }
  return ALLOWED_MOCK_PATH_PREFIXES.some(
    (prefix) => file === prefix || file.startsWith(prefix + path.sep),
  );
}

function relative(file: string): string {
  return path.relative(SRC_ROOT, file).split(path.sep).join('/');
}

describe('V2-FE-044 — production bundle does not import mocks or simulators', () => {
  const allFiles = walk(SRC_ROOT);
  const productionFiles = allFiles.filter((f) => !isAllowed(f));

  it('discovers production source files outside the test harness', () => {
    expect(productionFiles.length).toBeGreaterThan(20);
    // Sanity: harness files are excluded.
    expect(productionFiles.some((f) => f.includes(`${path.sep}__tests__${path.sep}`))).toBe(false);
  });

  it.each(
    FORBIDDEN_PRODUCTION_IMPORTS.map((re, i) => [`forbidden import pattern ${i + 1}: ${re}` , re] as const),
  )('%s is absent from production sources', (_label, pattern) => {
    const offenders: string[] = [];
    for (const file of productionFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      if (pattern.test(content)) {
        offenders.push(relative(file));
      }
    }
    expect(offenders).toEqual([]);
  });

  it('no production file imports msw or test-boundary mock modules', () => {
    const offenders: string[] = [];
    for (const file of productionFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      if (
        /from\s+['"]msw(\/[^'"]*)?['"]/.test(content) ||
        /@\/__tests__\/mocks/.test(content) ||
        /mock-wagmi/.test(content)
      ) {
        offenders.push(relative(file));
      }
    }
    expect(offenders).toEqual([]);
  });

  it('lifecycle modules do not import @/data/mock-data fixtures', () => {
    const offenders: string[] = [];
    for (const file of productionFiles) {
      const rel = relative(file);
      const isLifecycle = LIFECYCLE_PATH_FRAGMENTS.some((frag) =>
        rel.includes(frag.split(path.sep).join('/')),
      );
      if (!isLifecycle) continue;
      const content = fs.readFileSync(file, 'utf-8');
      if (MOCK_FIXTURE_IMPORT.test(content)) {
        offenders.push(rel);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('transaction-simulator remains an empty stub (no simulator API)', async () => {
    const mod = await import('@/lib/transaction-simulator');
    const exports = Object.keys(mod as Record<string, unknown>);
    // Empty module or only type-level exports — no runtime simulator functions.
    for (const key of exports) {
      expect(typeof (mod as Record<string, unknown>)[key]).not.toBe('function');
    }
    expect(exports.filter((k) => k.startsWith('simulate'))).toEqual([]);
    expect(exports.filter((k) => k.includes('MockReceipt'))).toEqual([]);
    expect(exports.filter((k) => k.includes('generateTransactionHash'))).toEqual([]);
  });

  it('test harness mock modules are only reachable from test files', () => {
    const mockRoot = path.join(TEST_ROOT, 'mocks');
    if (!fs.existsSync(mockRoot)) return;
    const mockFiles = walk(mockRoot);
    expect(mockFiles.length).toBeGreaterThan(0);

    const offenders: string[] = [];
    for (const file of productionFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      if (/@\/__tests__\/mocks|__tests__\/mocks\//.test(content)) {
        offenders.push(relative(file));
      }
    }
    expect(offenders).toEqual([]);
  });
});
